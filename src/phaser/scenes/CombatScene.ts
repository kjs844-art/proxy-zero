import Phaser from 'phaser'

import {
  BufferedCombatActionQueue,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import { characters, type CharacterDefinition } from '../../content/characters'
import { getEnemyBaseBody, getEnemyVariant } from '../../content/enemies'
import { n9DepotZone, type DepotWaveDefinition } from '../../content/stage1'
import {
  combatReducer,
  type CombatActor,
  type CombatCommand,
  type CombatState,
} from '../../domain/combat/combatReducer'
import { resolveCombo, type AcceptedAttackInput } from '../../domain/combat/comboResolver'
import { type BufferedAction, type InputFrame } from '../../domain/combat/inputBuffer'
import { fixedStepMs } from '../../domain/combat/tuning'
import {
  createEnemyBrainState,
  stepEnemyBrain,
  type EnemyBrainState,
  type EnemyIntent,
} from '../../domain/enemies/enemyBrain'
import type { EnemyPoint, EnemyVariantDefinition } from '../../domain/enemies/types'
import {
  CHECKPOINT_SCHEMA_VERSION,
  createRunState,
  runReducer,
  type RunCheckpoint,
  type RunEffect,
  type RunState,
} from '../../domain/run/runReducer'
import {
  advanceWaveDirector,
  createZoneWaveRuntime,
  isInsideArena,
  type EnemyRecoveryObservation,
  type WaveDirectorEvent,
  type ZoneWaveRuntime,
} from '../../domain/waves/waveDirector'
import { HudController } from '../../presentation/HudController'
import { CheckpointStore, type StorageLike } from '../../runtime/CheckpointStore'
import { FixedStepRunner } from '../../runtime/FixedStepRunner'
import { SeededRandom } from '../../runtime/SeededRandom'
import { ActorView, GREYBOX_TEXTURES } from '../actors/ActorView'
import { KeyboardInputAdapter } from '../input/KeyboardInputAdapter'
import { HazardView } from '../world/HazardView'
import { ZoneRenderer } from '../world/ZoneRenderer'

type ZonePhase = 'active' | 'inter-wave' | 'zone-clear'

const PLAYER_START = { x: 250, y: 248, z: 0 } as const
const enemyContent = { getVariant: getEnemyVariant, getBaseBody: getEnemyBaseBody }

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
    position: { ...PLAYER_START },
    hp: character.maxHp,
    maxHp: character.maxHp,
    damageScale: character.damageScale,
    attackSpeedScale: character.attackSpeedScale,
    moveSpeedScale: character.moveSpeedScale,
  })
  return {
    elapsedMs: 0,
    hitstopRemainingMs: 0,
    playerId: player.id,
    actors: { [player.id]: player },
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

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const immutableCheckpoint = (checkpoint: RunCheckpoint): RunCheckpoint =>
  Object.freeze({ ...checkpoint, inventory: Object.freeze({ ...checkpoint.inventory }) })

const axisToward = (from: number, to: number): -1 | 0 | 1 =>
  Math.abs(from - to) < 1 ? 0 : from < to ? 1 : -1

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const distanceToArena = (point: Readonly<EnemyPoint>): number => {
  const deltaX =
    point.x < n9DepotZone.arena.minX
      ? n9DepotZone.arena.minX - point.x
      : point.x > n9DepotZone.arena.maxX
        ? point.x - n9DepotZone.arena.maxX
        : 0
  const deltaY =
    point.y < n9DepotZone.arena.minY
      ? n9DepotZone.arena.minY - point.y
      : point.y > n9DepotZone.arena.maxY
        ? point.y - n9DepotZone.arena.maxY
        : 0
  return Math.hypot(deltaX, deltaY)
}

export class CombatScene extends Phaser.Scene {
  private state!: CombatState
  private runState!: RunState
  private character!: CharacterDefinition
  private readonly actionQueue = new BufferedCombatActionQueue()
  private inputAdapter: KeyboardInputAdapter | null = null
  private runner: FixedStepRunner | null = null
  private readonly actorViews = new Map<string, ActorView>()
  private hud: HudController | null = null
  private acceptedAttackHistory: AcceptedAttackInput[] = []
  private focusedCanvas: HTMLCanvasElement | null = null
  private finished = false
  private checkpointStore = new CheckpointStore()
  private zoneCheckpoint: RunCheckpoint | null = null
  private lifeText: Phaser.GameObjects.Text | null = null
  private gameOverText: Phaser.GameObjects.Text | null = null
  private zoneClearText: Phaser.GameObjects.Text | null = null
  private zoneRenderer: ZoneRenderer | null = null
  private hazardView: HazardView | null = null

  private waveIndex = 0
  private waveRuntime: ZoneWaveRuntime = this.createWaveRuntime(0)
  private zonePhase: ZonePhase = 'active'
  private interWaveRemainingMs = 0
  private transitionRemainingMs = 0
  private readonly pendingDefeatedEnemyIds = new Set<string>()
  private readonly enemyBrains = new Map<string, EnemyBrainState>()
  private readonly enemyRngs = new Map<string, SeededRandom>()
  private readonly enemyVariantIds = new Map<string, string>()
  private readonly returningEnemyIds = new Set<string>()
  private readonly lastRecoveryPositions = new Map<string, EnemyPoint>()
  private sceneCreated = false

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Combat })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Combat)
    const character = characters.find((entry) => entry.id === this.services.selectedCharacter)
    if (!character) throw new Error('Combat requires a confirmed character.')

    this.character = character
    this.state = createCombatState(character)
    this.runState = createRunState({
      characterId: character.id,
      zoneId: n9DepotZone.id,
      waveId: n9DepotZone.waves[0].id,
      maxHp: character.maxHp,
      inventory: { itemId: null, count: 0, available: false },
    })
    this.zoneCheckpoint = immutableCheckpoint({
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      characterId: character.id,
      zoneId: n9DepotZone.id,
      zoneStartWaveId: n9DepotZone.waves[0].id,
      inventory: { itemId: null, count: 0, available: false },
    })
    this.checkpointStore = new CheckpointStore(browserStorage())
    this.checkpointStore.save(this.zoneCheckpoint)
    this.finished = false
    this.sceneCreated = true
    this.acceptedAttackHistory = []
    this.initializeZoneRuntime()

    this.zoneRenderer = new ZoneRenderer(this, n9DepotZone.arena)
    this.hazardView = new HazardView(this)
    this.actorViews.set(
      character.id,
      new ActorView(this, this.state.actors[character.id], GREYBOX_TEXTURES[character.id]),
    )
    this.hud = new HudController(this, character.id)
    this.lifeText = this.add
      .text(524, 18, 'LIFE ×2', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setDepth(200)
    this.gameOverText = this.add
      .text(320, 108, '', {
        align: 'center',
        backgroundColor: '#071018dd',
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        padding: { x: 18, y: 14 },
      })
      .setDepth(201)
      .setOrigin(0.5)
      .setVisible(false)
    this.zoneClearText = this.add
      .text(320, 144, 'N-9 DEPOT\nZONE CLEAR', {
        align: 'center',
        backgroundColor: '#071018ee',
        color: '#67e8f9',
        fontFamily: 'monospace',
        fontSize: '24px',
        fontStyle: 'bold',
        padding: { x: 22, y: 16 },
      })
      .setDepth(220)
      .setOrigin(0.5)
      .setVisible(false)

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
    if (!this.sceneCreated) {
      this.stepUnmountedAdapter()
      return
    }
    if (this.runState.status === 'game-over') return

    this.runState = runReducer(this.runState, {
      type: 'advance-time',
      deltaMs: fixedStepMs,
    }).state
    this.state.actors[this.state.playerId].wakeInvulnerabilityRemainingMs =
      this.runState.respawnInvulnerabilityRemainingMs

    const phaseAtStart = this.zonePhase
    if (phaseAtStart === 'active') this.advanceWaveRuntime()
    else this.advanceZoneClock(fixedStepMs)

    const frame = this.inputAdapter?.readFrame() ?? emptyInputFrame()
    const bufferedAction =
      this.state.hitstopRemainingMs === 0
        ? this.actionQueue.nextAction(this.state.elapsedMs)
        : undefined
    const player = this.state.actors[this.state.playerId]
    const attackId = this.resolveBufferedAttack(bufferedAction, player)
    const playerCommand: CombatCommand = {
      actorId: player.id,
      moveX: frame.moveX,
      moveY: frame.moveY,
      jump: bufferedAction?.edge.type === 'jump',
      ...(attackId ? { attackId } : {}),
    }
    this.applyPlayerFacingAssist(playerCommand)
    const commands = [
      playerCommand,
      ...(this.zonePhase === 'active' ? this.buildEnemyCommands() : []),
    ]

    this.state = combatReducer(this.state, commands, fixedStepMs)
    if (this.zonePhase === 'active') this.clampLivingActors()
    this.runState = runReducer(this.runState, {
      type: 'player-hp-changed',
      hp: this.state.actors[this.state.playerId].hp,
    }).state
    if (bufferedAction && this.wasActionAccepted(bufferedAction, attackId, player)) {
      this.recordAcceptedAttack(this.actionQueue.accept(bufferedAction))
    }

    if (this.playerWasDefeated()) {
      this.handlePlayerDefeat()
      if (this.runState.status === 'game-over') return
    }

    const defeatedEnemyIds = this.state.events.flatMap((event) =>
      event.type === 'actor-defeated' && event.actorId !== this.state.playerId
        ? [event.actorId]
        : [],
    )
    this.recordEnemyDefeats(defeatedEnemyIds)
    this.hazardView?.update(fixedStepMs)
    this.zoneRenderer?.update(fixedStepMs)
  }

  private applyPlayerFacingAssist(command: Readonly<CombatCommand>): void {
    if (!command.attackId || command.moveX !== 0 || command.actorId !== this.state.playerId) {
      return
    }
    const player = this.state.actors[this.state.playerId]
    const target = Object.values(this.state.actors)
      .filter((actor) => {
        if (actor.id === player.id || actor.team === player.team || actor.mode === 'defeated') {
          return false
        }
        return (
          Math.abs(actor.position.x - player.position.x) <= 180 &&
          Math.abs(actor.position.y - player.position.y) <= 60
        )
      })
      .sort((left, right) => {
        const leftX = left.position.x - player.position.x
        const leftY = left.position.y - player.position.y
        const rightX = right.position.x - player.position.x
        const rightY = right.position.y - player.position.y
        return leftX * leftX + leftY * leftY - (rightX * rightX + rightY * rightY) ||
          left.id.localeCompare(right.id)
      })[0]
    if (!target || target.position.x === player.position.x) return
    player.facing = target.position.x < player.position.x ? -1 : 1
  }

  private stepUnmountedAdapter(): void {
    if (this.runState.status === 'game-over') return
    this.runState = runReducer(this.runState, {
      type: 'advance-time',
      deltaMs: fixedStepMs,
    }).state
    this.state.actors[this.state.playerId].wakeInvulnerabilityRemainingMs =
      this.runState.respawnInvulnerabilityRemainingMs
    this.state = combatReducer(this.state, [], fixedStepMs)
    this.runState = runReducer(this.runState, {
      type: 'player-hp-changed',
      hp: this.state.actors[this.state.playerId].hp,
    }).state
    if (this.playerWasDefeated()) {
      this.handlePlayerDefeat()
      if (this.runState.status === 'game-over') return
    }
    const defeatedEnemy = Object.values(this.state.actors).find(
      (actor) => actor.id !== this.state.playerId && actor.mode === 'defeated',
    )
    if (defeatedEnemy) this.finishCombat('enemy-defeated')
  }

  private advanceWaveRuntime(): void {
    const result = advanceWaveDirector(this.waveRuntime.wave, {
      deltaMs: fixedStepMs,
      defeatedEnemyIds: [...this.pendingDefeatedEnemyIds],
      activeEnemies: this.activeEnemyObservations(),
      arena: n9DepotZone.arena,
      playerPosition: {
        x: this.state.actors[this.state.playerId].position.x,
        y: this.state.actors[this.state.playerId].position.y,
      },
      playerSafeSeparation: n9DepotZone.playerSafeSeparation,
    })
    this.pendingDefeatedEnemyIds.clear()
    this.waveRuntime = { ...this.waveRuntime, wave: result.state }
    this.applyWaveDirectorEvents(result.events)
  }

  private activeEnemyObservations(): EnemyRecoveryObservation[] {
    const observations: EnemyRecoveryObservation[] = []
    for (const enemyId of this.waveRuntime.wave.spawnedEnemyIds) {
      const actor = this.state.actors[enemyId]
      if (!actor || actor.mode === 'defeated') continue
      const prior = this.lastRecoveryPositions.get(enemyId)
      const position = { x: actor.position.x, y: actor.position.y }
      if (isInsideArena(position, n9DepotZone.arena)) {
        this.returningEnemyIds.delete(enemyId)
      }
      observations.push({
        enemyId,
        position,
        down: actor.mode === 'knocked-down' || actor.mode === 'getting-up',
        madeRecoveryProgress:
          prior !== undefined && distanceToArena(position) < distanceToArena(prior),
      })
      this.lastRecoveryPositions.set(enemyId, position)
    }
    return observations
  }

  private applyWaveDirectorEvents(events: readonly WaveDirectorEvent[]): void {
    for (const event of events) {
      if (event.type === 'enemy-spawned') {
        this.spawnEnemy(event.enemyId, event.orderId, event.enemyVariantId)
      } else if (event.type === 'enemy-return-requested') {
        if (this.state.actors[event.enemyId]) this.returningEnemyIds.add(event.enemyId)
      } else if (event.type === 'enemy-force-repositioned') {
        const actor = this.state.actors[event.enemyId]
        if (!actor) continue
        actor.position = { ...event.position, z: 0 }
        actor.velocity = { x: 0, y: 0, z: 0 }
        this.returningEnemyIds.delete(event.enemyId)
        this.lastRecoveryPositions.set(event.enemyId, { ...event.position })
      } else {
        this.beginWaveClear(event.waveId)
      }
    }
  }

  private spawnEnemy(enemyId: string, orderId: string, enemyVariantId: string): void {
    if (this.state.actors[enemyId]) return
    const order = this.currentWave().orders.find((entry) => entry.id === orderId)
    const runtime = this.waveRuntime.enemiesById[enemyId]
    if (!order || !runtime || runtime.enemyVariantId !== enemyVariantId) return
    const variant = getEnemyVariant(enemyVariantId)
    const body = getEnemyBaseBody(runtime.baseBodyId)
    const player = this.state.actors[this.state.playerId]
    const actor = makeActor({
      id: enemyId,
      team: 'enemies',
      position: { ...order.position, z: 0 },
      facing: order.position.x < player.position.x ? 1 : -1,
      body: {
        halfWidth: body.radius,
        halfDepth: Math.max(12, body.radius * 0.7),
        height: 48,
      },
      hp: runtime.hp,
      maxHp: runtime.maxHp,
      damageScale: n9DepotZone.enemyDamageScale,
      moveSpeed: variant.moveSpeed,
    })
    this.state.actors[enemyId] = actor
    this.enemyBrains.set(enemyId, { ...runtime.brain })
    this.enemyRngs.set(enemyId, new SeededRandom(runtime.seed))
    this.enemyVariantIds.set(enemyId, enemyVariantId)
    this.lastRecoveryPositions.set(enemyId, { ...order.position })
    this.actorViews.set(enemyId, new ActorView(this, actor, GREYBOX_TEXTURES.enemy))
    this.services.recordEnemySpawn(enemyId, this.state.elapsedMs)
  }

  private buildEnemyCommands(): CombatCommand[] {
    const commands: CombatCommand[] = []
    const player = this.state.actors[this.state.playerId]
    for (const enemyId of [...this.enemyBrains.keys()].sort()) {
      const actor = this.state.actors[enemyId]
      let brain = this.enemyBrains.get(enemyId)
      const rng = this.enemyRngs.get(enemyId)
      const variantId = this.enemyVariantIds.get(enemyId)
      if (!actor || !brain || !rng || !variantId || actor.mode === 'defeated') continue
      const variant = getEnemyVariant(variantId)
      actor.facing = player.position.x < actor.position.x ? -1 : 1
      let command: CombatCommand = { actorId: enemyId, moveX: 0, moveY: 0 }

      if (actor.mode === 'knocked-down' || actor.mode === 'getting-up') {
        this.enemyBrains.set(enemyId, createEnemyBrainState('down'))
        this.hazardView?.clearEnemy(enemyId)
        commands.push(command)
        continue
      }
      if (brain.mode === 'down') {
        brain = createEnemyBrainState('chase')
        this.enemyBrains.set(enemyId, brain)
      }

      if (this.returningEnemyIds.has(enemyId)) {
        command = {
          ...command,
          ...this.applyEnemyIntent(enemyId, {
            type: 'move',
            target: {
              x: (n9DepotZone.arena.minX + n9DepotZone.arena.maxX) / 2,
              y: (n9DepotZone.arena.minY + n9DepotZone.arena.maxY) / 2,
            },
            speed: variant.moveSpeed,
          }),
        }
      } else {
        const result = stepEnemyBrain(
          {
            enemyId,
            definition: variant,
            state: brain,
            position: { x: actor.position.x, y: actor.position.y },
            playerPosition: { x: player.position.x, y: player.position.y },
            deltaMs: fixedStepMs,
          },
          rng,
        )
        this.enemyBrains.set(enemyId, result.state)
        for (const intent of result.intents) {
          command = { ...command, ...this.applyEnemyIntent(enemyId, intent) }
        }
        this.applyEnemyGuardState(enemyId, result.state, variant)
      }
      commands.push(command)
    }
    return commands
  }

  private applyEnemyIntent(
    enemyId: string,
    intent: Readonly<EnemyIntent>,
  ): Partial<CombatCommand> {
    const actor = this.state.actors[enemyId]
    if (!actor) return {}
    if (intent.type === 'move') {
      return {
        moveX: axisToward(actor.position.x, intent.target.x),
        moveY: axisToward(actor.position.y, intent.target.y),
      }
    }
    if (intent.type === 'telegraph') {
      this.hazardView?.showTelegraph(
        enemyId,
        { x: actor.position.x, y: actor.position.y },
        intent.range,
        intent.durationMs,
      )
      return {}
    }
    if (intent.type === 'attack') {
      const attackId = n9DepotZone.enemyPatternAttackIds[intent.attackId]
      return attackId ? { attackId } : {}
    }
    actor.wakeInvulnerabilityRemainingMs = intent.durationMs
    this.hazardView?.setGuard(
      enemyId,
      { x: actor.position.x, y: actor.position.y },
      true,
    )
    return {}
  }

  private applyEnemyGuardState(
    enemyId: string,
    brain: Readonly<EnemyBrainState>,
    variant: Readonly<EnemyVariantDefinition>,
  ): void {
    const actor = this.state.actors[enemyId]
    if (!actor) return
    const guarding = brain.mode === 'guard' && brain.elapsedMs < variant.guardDurationMs
    if (guarding) {
      actor.wakeInvulnerabilityRemainingMs = Math.max(
        0,
        variant.guardDurationMs - brain.elapsedMs,
      )
    } else if (actor.mode !== 'getting-up') {
      actor.wakeInvulnerabilityRemainingMs = 0
    }
    this.hazardView?.setGuard(
      enemyId,
      { x: actor.position.x, y: actor.position.y },
      guarding,
    )
  }

  private recordEnemyDefeats(enemyIds: readonly string[]): void {
    for (const enemyId of new Set(enemyIds)) {
      if (!this.waveRuntime.wave.spawnedEnemyIds.includes(enemyId)) continue
      this.pendingDefeatedEnemyIds.add(enemyId)
      this.actorViews.get(enemyId)?.dispose()
      this.actorViews.delete(enemyId)
      this.enemyBrains.delete(enemyId)
      this.enemyRngs.delete(enemyId)
      this.enemyVariantIds.delete(enemyId)
      this.returningEnemyIds.delete(enemyId)
      this.lastRecoveryPositions.delete(enemyId)
      this.hazardView?.clearEnemy(enemyId)
      delete this.state.actors[enemyId]
    }
  }

  private beginWaveClear(waveId: string): void {
    if (this.zonePhase !== 'active' || waveId !== this.currentWave().id) return
    this.zoneRenderer?.setLocked(false)
    this.hazardView?.reset()
    if (this.waveIndex < n9DepotZone.waves.length - 1) {
      this.zonePhase = 'inter-wave'
      this.interWaveRemainingMs = n9DepotZone.interWaveDelayMs
      return
    }
    this.zonePhase = 'zone-clear'
    this.transitionRemainingMs = n9DepotZone.transitionDurationMs
    this.zoneClearText?.setVisible(true)
  }

  private advanceZoneClock(deltaMs: number): void {
    const elapsed = finiteDelta(deltaMs)
    if (this.zonePhase === 'inter-wave') {
      this.interWaveRemainingMs = Math.max(0, this.interWaveRemainingMs - elapsed)
      if (this.interWaveRemainingMs === 0) this.startNextWave()
      return
    }
    this.transitionRemainingMs = Math.max(0, this.transitionRemainingMs - elapsed)
    if (this.transitionRemainingMs === 0) this.finishCombat('enemy-defeated')
  }

  private startNextWave(): void {
    const nextIndex = this.waveIndex + 1
    if (nextIndex >= n9DepotZone.waves.length) return
    this.waveIndex = nextIndex
    this.waveRuntime = this.createWaveRuntime(nextIndex)
    this.runState = { ...this.runState, currentWaveId: this.currentWave().id }
    this.zonePhase = 'active'
    this.interWaveRemainingMs = 0
    this.pendingDefeatedEnemyIds.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.hazardView?.reset()
    this.zoneRenderer?.setLocked(true)
  }

  private clampLivingActors(): void {
    for (const actor of Object.values(this.state.actors)) {
      if (actor.mode === 'defeated') continue
      actor.position.x = Math.min(
        n9DepotZone.arena.maxX,
        Math.max(n9DepotZone.arena.minX, actor.position.x),
      )
      actor.position.y = Math.min(
        n9DepotZone.arena.maxY,
        Math.max(n9DepotZone.arena.minY, actor.position.y),
      )
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

  private playerWasDefeated(): boolean {
    return (
      this.state.actors[this.state.playerId].mode === 'defeated' ||
      this.state.events.some(
        (event) => event.type === 'actor-defeated' && event.actorId === this.state.playerId,
      )
    )
  }

  private syncPresentation(): void {
    for (const [actorId, view] of this.actorViews) {
      const actor = this.state.actors[actorId]
      if (actor) view.update(actor)
    }
    const player = this.state.actors[this.state.playerId]
    if (player) this.hud?.update(player)
    this.lifeText?.setText(`LIFE ×${this.runState.lives}`)
    if (this.runState.status !== 'game-over') {
      this.gameOverText?.setVisible(false)
      return
    }
    const prompt = this.runState.continueAvailable
      ? 'GAME OVER\nENTER · CONTINUE'
      : 'GAME OVER\nCONTINUE EXHAUSTED'
    this.gameOverText?.setText(prompt).setVisible(true)
  }

  private handlePlayerDefeat(): void {
    const result = runReducer(this.runState, { type: 'player-defeated' })
    this.runState = result.state
    this.applyRunEffects(result.effects)
    if (this.runState.status === 'game-over') {
      this.actionQueue.clear()
      this.acceptedAttackHistory = []
    }
  }

  private applyRunEffects(effects: readonly RunEffect[]): void {
    for (const effect of effects) {
      if (effect.type === 'same-wave-respawn') this.respawnPlayerInCurrentWave()
      else this.rebuildZoneFromCheckpoint()
    }
  }

  private respawnPlayerInCurrentWave(): void {
    const player = this.state.actors[this.state.playerId]
    player.hp = player.maxHp
    player.position = { ...PLAYER_START }
    player.velocity = { x: 0, y: 0, z: 0 }
    player.mode = 'idle'
    player.activeAttack = null
    player.hitstunRemainingMs = 0
    player.knockdownRemainingMs = 0
    player.wakeInvulnerabilityRemainingMs =
      this.runState.respawnInvulnerabilityRemainingMs
    player.pendingKnockdown = false
    player.reactionSource = null
    this.state.hitstopRemainingMs = 0
    this.state.combo = {
      hitCount: 0,
      lastHitAtMs: null,
      lastAttackerId: null,
      lastTargetId: null,
    }
    this.actionQueue.clear()
    this.acceptedAttackHistory = []
  }

  private tryContinue(): void {
    if (!this.runState.continueAvailable) return
    const storedCheckpoint = this.checkpointStore.load()
    const checkpoint = this.matchesCurrentRun(storedCheckpoint)
      ? storedCheckpoint
      : this.zoneCheckpoint
    if (!checkpoint) return
    const result = runReducer(this.runState, {
      type: 'continue-from-checkpoint',
      checkpoint,
    })
    this.runState = result.state
    this.applyRunEffects(result.effects)
  }

  private matchesCurrentRun(checkpoint: RunCheckpoint | null): checkpoint is RunCheckpoint {
    return (
      checkpoint !== null &&
      checkpoint.characterId === this.runState.characterId &&
      checkpoint.zoneId === this.runState.zoneId &&
      checkpoint.zoneStartWaveId === this.runState.zoneStartWaveId
    )
  }

  private rebuildZoneFromCheckpoint(): void {
    const character = characters.find((entry) => entry.id === this.runState.characterId)
    if (!character) return
    this.character = character
    this.clearEnemyResources()
    this.state = createCombatState(character)
    if (!this.sceneCreated) {
      this.state.actors['greybox-enemy'] = makeActor({
        id: 'greybox-enemy',
        team: 'enemies',
        hp: 24,
        maxHp: 24,
        moveSpeed: 0,
      })
    }
    this.initializeZoneRuntime()
    this.actionQueue.clear()
    this.acceptedAttackHistory = []
    this.finished = false
    this.zoneRenderer?.reset()
    this.hazardView?.reset()
    this.zoneClearText?.setVisible(false)
    this.syncPresentation()
  }

  private initializeZoneRuntime(): void {
    this.waveIndex = 0
    this.waveRuntime = this.createWaveRuntime(0)
    this.zonePhase = 'active'
    this.interWaveRemainingMs = 0
    this.transitionRemainingMs = 0
    this.pendingDefeatedEnemyIds.clear()
    this.enemyBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
  }

  private createWaveRuntime(index: number): ZoneWaveRuntime {
    const wave = n9DepotZone.waves[index]
    return createZoneWaveRuntime(wave, wave.seed, enemyContent)
  }

  private currentWave(): DepotWaveDefinition {
    return n9DepotZone.waves[this.waveIndex]
  }

  private clearEnemyResources(): void {
    for (const [actorId, view] of this.actorViews) {
      if (actorId === this.state?.playerId) continue
      view.dispose()
      this.actorViews.delete(actorId)
    }
    this.enemyBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.pendingDefeatedEnemyIds.clear()
    this.hazardView?.reset()
  }

  private readonly focusCanvas = (): void => {
    this.focusedCanvas?.focus({ preventScroll: true })
  }

  private readonly onDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Backquote') this.services.requestDebugClear()
    if (event.code === 'Enter' && this.runState.status === 'game-over') this.tryContinue()
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
    this.enemyBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.pendingDefeatedEnemyIds.clear()
    this.hazardView?.dispose()
    this.hazardView = null
    this.zoneRenderer?.dispose()
    this.zoneRenderer = null
    this.hud?.dispose()
    this.hud = null
    this.lifeText = null
    this.gameOverText = null
    this.zoneClearText = null
    this.zoneCheckpoint = null
    this.acceptedAttackHistory = []
    this.sceneCreated = false
  }
}
