import Phaser from 'phaser'

import {
  BufferedCombatActionQueue,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import {
  characters,
  type CharacterDefinition,
} from '../../content/characters'
import {
  combatReducer,
  type CombatActor,
  type CombatCommand,
  type CombatState,
} from '../../domain/combat/combatReducer'
import {
  resolveCombo,
  type AcceptedAttackInput,
} from '../../domain/combat/comboResolver'
import {
  type BufferedAction,
  type InputFrame,
} from '../../domain/combat/inputBuffer'
import { fixedStepMs } from '../../domain/combat/tuning'
import { HudController } from '../../presentation/HudController'
import { FixedStepRunner } from '../../runtime/FixedStepRunner'
import { ActorView, GREYBOX_TEXTURES } from '../actors/ActorView'
import { KeyboardInputAdapter } from '../input/KeyboardInputAdapter'

const ENEMY_ID = 'greybox-enemy'

const makeActor = (overrides: Partial<CombatActor>): CombatActor => ({
  id: 'actor',
  team: 'neutral',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  facing: 1,
  body: { halfWidth: 12, halfDepth: 12, height: 48 },
  hp: 100,
  maxHp: 100,
  meter: 0,
  damageScale: 1,
  attackSpeedScale: 1,
  moveSpeedScale: 1,
  moveSpeed: 150,
  jumpSpeed: 300,
  gravity: 900,
  mode: 'idle',
  activeAttack: null,
  hitstunRemainingMs: 0,
  knockdownRemainingMs: 0,
  wakeInvulnerabilityRemainingMs: 0,
  pendingKnockdown: false,
  reactionSource: null,
  ...overrides,
})

const createCombatState = (character: CharacterDefinition): CombatState => {
  const player = makeActor({
    id: character.id,
    team: 'heroes',
    position: { x: 250, y: 248, z: 0 },
    hp: character.maxHp,
    maxHp: character.maxHp,
    damageScale: character.damageScale,
    attackSpeedScale: character.attackSpeedScale,
    moveSpeedScale: character.moveSpeedScale,
  })
  const enemy = makeActor({
    id: ENEMY_ID,
    team: 'enemies',
    position: { x: 300, y: 248, z: 0 },
    facing: -1,
    hp: 24,
    maxHp: 24,
    moveSpeed: 0,
  })

  return {
    elapsedMs: 0,
    hitstopRemainingMs: 0,
    playerId: player.id,
    actors: { [player.id]: player, [enemy.id]: enemy },
    combo: {
      hitCount: 0,
      lastHitAtMs: null,
      lastAttackerId: null,
      lastTargetId: null,
    },
    events: [],
  }
}

const emptyInputFrame = (): InputFrame => ({ moveX: 0, moveY: 0, edges: [] })

export class CombatScene extends Phaser.Scene {
  private state!: CombatState
  private character!: CharacterDefinition
  private readonly actionQueue = new BufferedCombatActionQueue()
  private inputAdapter: KeyboardInputAdapter | null = null
  private runner: FixedStepRunner | null = null
  private readonly actorViews = new Map<string, ActorView>()
  private hud: HudController | null = null
  private acceptedAttackHistory: AcceptedAttackInput[] = []
  private focusedCanvas: HTMLCanvasElement | null = null
  private finished = false

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Combat })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Combat)
    const selectedCharacter = this.services.selectedCharacter
    const character = characters.find((entry) => entry.id === selectedCharacter)
    if (!character) throw new Error('Combat requires a confirmed character.')

    this.character = character
    this.state = createCombatState(character)
    this.finished = false
    this.acceptedAttackHistory = []
    this.drawArena()

    this.actorViews.set(
      character.id,
      new ActorView(this, this.state.actors[character.id], GREYBOX_TEXTURES[character.id]),
    )
    this.actorViews.set(
      ENEMY_ID,
      new ActorView(this, this.state.actors[ENEMY_ID], GREYBOX_TEXTURES.enemy),
    )
    this.hud = new HudController(this, character.id)

    const canvas = this.game.canvas
    canvas.setAttribute('tabindex', '0')
    this.focusedCanvas = canvas
    this.inputAdapter = new KeyboardInputAdapter(
      canvas,
      this.actionQueue.buffer,
      () => this.state.elapsedMs,
    )
    canvas.addEventListener('pointerdown', this.focusCanvas)
    this.input.keyboard?.on('keydown', this.onDebugKeyDown)
    this.runner = new FixedStepRunner(this.stepDomain)

    this.focusCanvas()
    this.services.markCombatInputReady(this.state.elapsedMs)
    this.services.recordEnemySpawn(ENEMY_ID, this.state.elapsedMs)
    this.syncPresentation()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  update(_time: number, deltaMs: number): void {
    this.runner?.advance(deltaMs)
    if (!this.finished) this.syncPresentation()
  }

  private readonly stepDomain = (): void => {
    if (this.finished) return
    if (this.services.consumeDebugClear()) {
      this.finishCombat('debug-clear')
      return
    }

    const frame = this.inputAdapter?.readFrame() ?? emptyInputFrame()
    const bufferedAction =
      this.state.hitstopRemainingMs === 0
        ? this.actionQueue.nextAction(this.state.elapsedMs)
        : undefined
    const player = this.state.actors[this.state.playerId]
    const attackId = this.resolveBufferedAttack(bufferedAction, player)
    const command: CombatCommand = {
      actorId: player.id,
      moveX: frame.moveX,
      moveY: frame.moveY,
      jump: bufferedAction?.edge.type === 'jump',
      ...(attackId ? { attackId } : {}),
    }

    this.state = combatReducer(this.state, [command], fixedStepMs)
    if (bufferedAction && this.wasActionAccepted(bufferedAction, attackId, player)) {
      this.recordAcceptedAttack(this.actionQueue.accept(bufferedAction))
    }

    if (
      this.state.actors[ENEMY_ID].mode === 'defeated' ||
      this.state.events.some(
        (event) => event.type === 'actor-defeated' && event.actorId === ENEMY_ID,
      )
    ) {
      this.finishCombat('enemy-defeated')
    }
  }

  private resolveBufferedAttack(
    bufferedAttack: BufferedAction | undefined,
    player: Readonly<CombatActor>,
  ): string | undefined {
    if (!bufferedAttack) return undefined
    return resolveCombo(bufferedAttack, this.acceptedAttackHistory, this.character, {
      airborne: player.position.z > 0,
      meter: player.meter,
    })?.attackId
  }

  private wasActionAccepted(
    bufferedAction: BufferedAction | undefined,
    attackId: string | undefined,
    priorPlayer: Readonly<CombatActor>,
  ): boolean {
    if (!bufferedAction) return false
    if (bufferedAction.edge.type === 'jump') {
      const currentPlayer = this.state.actors[this.state.playerId]
      return (
        priorPlayer.position.z === 0 &&
        currentPlayer.position.z > 0 &&
        currentPlayer.mode === 'airborne'
      )
    }
    if (bufferedAction.edge.type !== 'attack' || !attackId) return false
    return this.state.events.some(
      (event) =>
        event.type === 'attack-started' &&
        event.actorId === this.state.playerId &&
        event.attackId === attackId,
    )
  }

  private recordAcceptedAttack(bufferedAction: BufferedAction | undefined): void {
    if (!bufferedAction || bufferedAction.edge.type !== 'attack') return
    this.acceptedAttackHistory.push({
      limb: bufferedAction.edge.limb,
      enqueuedAtMs: bufferedAction.enqueuedAtMs,
    })
    if (this.acceptedAttackHistory.length > 8) this.acceptedAttackHistory.shift()
  }

  private syncPresentation(): void {
    for (const [actorId, view] of this.actorViews) {
      view.update(this.state.actors[actorId])
    }
    this.hud?.update(this.state.actors[this.state.playerId])
  }

  private drawArena(): void {
    this.cameras.main.setBackgroundColor('#071018')
    this.add.rectangle(320, 254, 580, 164, 0x102a3a).setDepth(-100)
    const lines = this.add.graphics().setDepth(-99)
    lines.lineStyle(1, 0x1f5068, 1)
    for (let y = 190; y <= 320; y += 26) lines.lineBetween(30, y, 610, y)
    lines.lineStyle(2, 0x67e8f9, 0.45)
    lines.strokeRect(30, 172, 580, 164)
  }

  private readonly focusCanvas = (): void => {
    this.focusedCanvas?.focus({ preventScroll: true })
  }

  private readonly onDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote') this.services.requestDebugClear()
  }

  private finishCombat(result: 'enemy-defeated' | 'debug-clear'): void {
    if (this.finished) return
    this.finished = true
    this.services.completeCombat(result)
    this.scene.start(SCENE_KEYS.Results)
  }

  private dispose(): void {
    this.runner?.pause()
    this.runner = null
    this.inputAdapter?.dispose()
    this.inputAdapter = null
    this.actionQueue.clear()
    this.focusedCanvas?.removeEventListener('pointerdown', this.focusCanvas)
    this.focusedCanvas = null
    this.input.keyboard?.off('keydown', this.onDebugKeyDown)
    for (const view of this.actorViews.values()) view.dispose()
    this.actorViews.clear()
    this.hud?.dispose()
    this.hud = null
    this.acceptedAttackHistory = []
  }
}
