import Phaser from 'phaser'

import {
  BufferedCombatActionQueue,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import type { ActorTelegraphSnapshot } from '../../content/animations'
import { characters, type CharacterDefinition } from '../../content/characters'
import { getBossDefinition, isBossDefinitionId } from '../../content/bosses'
import { getEliteDefinition, isEliteDefinitionId } from '../../content/elites'
import { getEnemyBaseBody, getEnemyVariant } from '../../content/enemies'
import type { EmpTargetClass } from '../../content/items'
import {
  getPlayableStageOneZone,
  n9DepotZone,
  type PlayableStageOneZoneDefinition,
  type PlayableStageOneZoneId,
  type StageOneWaveDefinition,
} from '../../content/stage1'
import {
  combatReducer,
  type CombatActor,
  type CombatCommand,
  type CombatEvent,
  type CombatState,
} from '../../domain/combat/combatReducer'
import { resolveCombo, type AcceptedAttackInput } from '../../domain/combat/comboResolver'
import { type BufferedAction, type InputFrame } from '../../domain/combat/inputBuffer'
import { fixedStepMs } from '../../domain/combat/tuning'
import {
  createBossBrainState,
  interruptBossBrain,
  stepBossBrain,
  type BossBrainState,
  type BossIntent,
} from '../../domain/enemies/bossBrain'
import {
  createEliteBrainState,
  interruptEliteBrain,
  stepEliteBrain,
  type EliteBrainState,
  type EliteIntent,
} from '../../domain/enemies/eliteBrain'
import {
  createEnemyBrainState,
  stepEnemyBrain,
  type EnemyBrainState,
  type EnemyIntent,
} from '../../domain/enemies/enemyBrain'
import type { EnemyPoint, EnemyVariantDefinition } from '../../domain/enemies/types'
import {
  cloneItemInventory,
  createEmptyItemInventory,
  createItemRuntimeState,
  itemReducer,
  type ItemEffect,
  type ItemInventory,
  type ItemPickupSnapshot,
  type ItemRuntimeState,
  type ItemTargetSnapshot,
} from '../../domain/items/itemReducer'
import {
  CHECKPOINT_SCHEMA_VERSION,
  createRunState,
  runReducer,
  type DefeatedEnemyClass,
  type RunCheckpoint,
  type RunEffect,
  type RunState,
} from '../../domain/run/runReducer'
import { calculateRunRank, type RunOutcome } from '../../domain/run/rankCalculator'
import type { ZoneEntry } from '../../domain/run/types'
import {
  createTunnelHazardState,
  getPuddlePhase,
  getTunnelTrainPhase,
  stepTunnelHazard,
  type TunnelHazardEffect,
  type TunnelHazardState,
} from '../../domain/world/tunnelHazard'
import {
  createTrainHazardState,
  getTrainHazardPhase,
  stepTrainHazard,
  type PlayerFellEffect,
  type TrainHazardState,
} from '../../domain/world/trainHazard'
import {
  advanceWaveDirector,
  createZoneWaveRuntime,
  isInsideArena,
  type EnemyRecoveryObservation,
  type WaveDirectorEvent,
  type ZoneWaveRuntime,
} from '../../domain/waves/waveDirector'
import { HudController } from '../../presentation/HudController'
import { InventoryHud } from '../../presentation/InventoryHud'
import { AudioBus, type AudioBackend } from '../../presentation/AudioBus'
import {
  CombatVfx,
  planPresentationBatch,
  type ActorPresentationPoint,
  type HazardWarningId,
} from '../../presentation/CombatVfx'
import { PerformanceGovernor } from '../../presentation/PerformanceGovernor'
import { CheckpointStore, type StorageLike } from '../../runtime/CheckpointStore'
import { FixedStepRunner } from '../../runtime/FixedStepRunner'
import { SeededRandom } from '../../runtime/SeededRandom'
import { ActorView } from '../actors/ActorView'
import { KeyboardInputAdapter } from '../input/KeyboardInputAdapter'
import { HazardView } from '../world/HazardView'
import { TrainBackdrop } from '../world/TrainBackdrop'
import { TunnelBackdrop } from '../world/TunnelBackdrop'
import { ZoneRenderer } from '../world/ZoneRenderer'

type ZonePhase = 'active' | 'inter-wave' | 'zone-clear' | 'zone-handoff'

const getWaveVariant = (id: string): EnemyVariantDefinition => {
  if (isBossDefinitionId(id)) {
    const boss = getBossDefinition(id)
    return {
      id: boss.id,
      baseBodyId: boss.id,
      moveSpeed: boss.phases[0].chaseSpeed,
      chaseDistance: 400,
      guardDurationMs: 0,
      intentWeights: { attack: 1, guard: 0 },
      attacks: boss.patterns.map((pattern) => ({
        id: pattern.id,
        telegraphMs: boss.phases[0].telegraphMsByAttackId[pattern.id],
        activeMs: 0,
        recoveryMs: 0,
        range: { ...pattern.range },
        weight: 1,
      })),
    }
  }
  if (!isEliteDefinitionId(id)) return getEnemyVariant(id)
  const elite = getEliteDefinition(id)
  return {
    id: elite.id,
    baseBodyId: elite.id,
    moveSpeed: elite.moveSpeed,
    chaseDistance: 360,
    guardDurationMs: 0,
    intentWeights: { attack: 1, guard: 0 },
    attacks: elite.patterns.map((pattern) => ({
      ...pattern,
      range: { ...pattern.range },
      weight: 1,
    })),
  }
}
const getWaveBaseBody = (id: string) => {
  if (isBossDefinitionId(id)) {
    const boss = getBossDefinition(id)
    const heavyBody = getEnemyBaseBody(boss.baseBodyId)
    return { ...heavyBody, id: boss.id, maxHp: boss.maxHp, radius: boss.radius }
  }
  if (!isEliteDefinitionId(id)) return getEnemyBaseBody(id)
  const elite = getEliteDefinition(id)
  const heavyBody = getEnemyBaseBody(elite.baseBodyId)
  return { ...heavyBody, id: elite.id, maxHp: elite.maxHp, radius: elite.radius }
}
const enemyContent = { getVariant: getWaveVariant, getBaseBody: getWaveBaseBody }

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

const createCombatState = (
  character: CharacterDefinition,
  playerStart = n9DepotZone.playerStart,
): CombatState => {
  const player = makeActor({
    id: character.id,
    team: 'heroes',
    position: { ...playerStart },
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
  Object.freeze({
    ...checkpoint,
    inventory: Object.freeze({
      ...checkpoint.inventory,
      counts: Object.freeze({ ...checkpoint.inventory.counts }),
    }),
  })

const axisToward = (from: number, to: number): -1 | 0 | 1 =>
  Math.abs(from - to) < 1 ? 0 : from < to ? 1 : -1

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const distanceToArena = (
  point: Readonly<EnemyPoint>,
  zone: Readonly<PlayableStageOneZoneDefinition>,
): number => {
  const deltaX =
    point.x < zone.arena.minX
      ? zone.arena.minX - point.x
      : point.x > zone.arena.maxX
        ? point.x - zone.arena.maxX
        : 0
  const deltaY =
    point.y < zone.arena.minY
      ? zone.arena.minY - point.y
      : point.y > zone.arena.maxY
        ? point.y - zone.arena.maxY
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
  private inventoryHud: InventoryHud | null = null
  private combatVfx: CombatVfx | null = null
  private audioBus: AudioBus | null = null
  private readonly performanceGovernor = new PerformanceGovernor()
  private presentationBatchId = 0
  private pendingItemPresentationEffects: ItemEffect[] = []
  private presentationPaused = false
  private discardNextRenderDelta = false
  private windowFocused = true
  private canvasFocused = true
  private documentVisible = true
  private itemRuntime: ItemRuntimeState = createItemRuntimeState()
  private authoredItemPickups: ItemPickupSnapshot[] = []
  private readonly itemTargetClasses = new Map<string, EmpTargetClass>()
  private acceptedAttackHistory: AcceptedAttackInput[] = []
  private focusedCanvas: HTMLCanvasElement | null = null
  private finished = false
  private checkpointStore = new CheckpointStore()
  private zoneCheckpoint: RunCheckpoint | null = null
  private gameOverText: Phaser.GameObjects.Text | null = null
  private zoneClearText: Phaser.GameObjects.Text | null = null
  private zoneRenderer: ZoneRenderer | null = null
  private trainBackdrop: TrainBackdrop | null = null
  private tunnelBackdrop: TunnelBackdrop | null = null
  private hazardView: HazardView | null = null

  private currentZone: PlayableStageOneZoneDefinition = n9DepotZone
  private waveIndex = 0
  private waveRuntime!: ZoneWaveRuntime
  private zonePhase: ZonePhase = 'active'
  private interWaveRemainingMs = 0
  private transitionRemainingMs = 0
  private readonly pendingDefeatedEnemyIds = new Set<string>()
  private readonly enemyBrains = new Map<string, EnemyBrainState>()
  private readonly eliteBrains = new Map<string, EliteBrainState>()
  private readonly bossBrains = new Map<string, BossBrainState>()
  private readonly enemyRngs = new Map<string, SeededRandom>()
  private readonly enemyVariantIds = new Map<string, string>()
  private readonly returningEnemyIds = new Set<string>()
  private readonly lastRecoveryPositions = new Map<string, EnemyPoint>()
  private trainHazardState: TrainHazardState = createTrainHazardState()
  private tunnelHazardState: TunnelHazardState = createTunnelHazardState()
  private pendingCombatResult: Exclude<RunOutcome, 'mission-failed'> = 'mission-clear'
  private sceneCreated = false
  private playerItemUseStartedAtMs: number | null = null
  private focusEventTarget: EventTarget | null = null
  private visibilityEventTarget: EventTarget | null = null

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Combat })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Combat)
    const character = characters.find((entry) => entry.id === this.services.selectedCharacter)
    if (!character) throw new Error('Combat requires a confirmed character.')

    this.character = character
    this.currentZone = n9DepotZone
    this.state = createCombatState(character, this.currentZone.playerStart)
    this.runState = createRunState({
      characterId: character.id,
      zoneId: n9DepotZone.id,
      waveId: n9DepotZone.waves[0].id,
      maxHp: character.maxHp,
    })
    this.authoredItemPickups = this.cloneAuthoredPickups(this.currentZone.pickups)
    this.itemRuntime = createItemRuntimeState({
      inventory: createEmptyItemInventory(),
      pickups: this.authoredItemPickups,
    })
    this.zoneCheckpoint = immutableCheckpoint({
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      characterId: character.id,
      zoneId: n9DepotZone.id,
      zoneStartWaveId: n9DepotZone.waves[0].id,
      inventory: cloneItemInventory(this.itemRuntime.inventory),
    })
    this.checkpointStore = new CheckpointStore(browserStorage())
    this.checkpointStore.save(this.zoneCheckpoint)
    this.finished = false
    this.sceneCreated = true
    this.acceptedAttackHistory = []
    this.playerItemUseStartedAtMs = null
    this.presentationBatchId = 0
    this.pendingItemPresentationEffects = []
    this.presentationPaused = false
    this.discardNextRenderDelta = false
    this.windowFocused = true
    this.canvasFocused = true
    this.documentVisible = true
    this.performanceGovernor.resetSampling()
    this.initializeZoneRuntime()

    this.zoneRenderer = new ZoneRenderer(this, this.currentZone.arena)
    this.trainBackdrop = null
    this.tunnelBackdrop = null
    this.hazardView = new HazardView(this)
    this.actorViews.set(
      character.id,
      new ActorView(this, this.state.actors[character.id], character.id),
    )
    this.hud = new HudController(this, character.id, this.itemRuntime.inventory)
    this.inventoryHud = this.hud.inventoryHud
    this.combatVfx = new CombatVfx(this)
    const soundBackend = (this as unknown as { sound?: AudioBackend }).sound
    this.audioBus = new AudioBus(soundBackend)
    this.audioBus.startCombatLoop()
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
    canvas.addEventListener('blur', this.onCanvasBlur)
    canvas.addEventListener('focus', this.onCanvasFocus)
    this.focusEventTarget = canvas.ownerDocument.defaultView
    this.focusEventTarget?.addEventListener('blur', this.onWindowBlur)
    this.focusEventTarget?.addEventListener('focus', this.onWindowFocus)
    this.visibilityEventTarget = canvas.ownerDocument
    this.documentVisible = !(
      canvas.ownerDocument.hidden || canvas.ownerDocument.visibilityState === 'hidden'
    )
    this.visibilityEventTarget.addEventListener('visibilitychange', this.onVisibilityChange)
    this.input.keyboard?.on('keydown', this.onDebugKeyDown)
    this.runner = new FixedStepRunner(this.stepDomain)

    this.focusCanvas()
    this.services.markCombatInputReady(this.state.elapsedMs)
    this.syncPresentation()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  update(_time: number, deltaMs: number): void {
    if (this.presentationPaused) {
      if (!this.finished) this.syncPresentation()
      return
    }
    if (this.discardNextRenderDelta) {
      this.discardNextRenderDelta = false
      if (!this.finished) this.syncPresentation()
      return
    }
    const renderDeltaMs = finiteDelta(deltaMs)
    this.performanceGovernor.sample(renderDeltaMs)
    this.runner?.advance(renderDeltaMs)
    this.combatVfx?.update(renderDeltaMs)
    this.hud?.advance(renderDeltaMs)
    if (!this.finished) this.syncPresentation()
  }

  private readonly stepDomain = (): void => {
    if (this.finished) return
    if (this.services.consumeDebugClear()) {
      this.debugClearCurrentZone()
      return
    }
    if (!this.sceneCreated) {
      this.stepUnmountedAdapter()
      return
    }
    if (this.runState.status === 'game-over') {
      this.inputAdapter?.readFrame()
      this.actionQueue.clear()
      return
    }
    const frozenMs = Math.min(
      Math.max(0, this.state.hitstopRemainingMs),
      fixedStepMs,
    )
    const activeDeltaMs = fixedStepMs - frozenMs
    const trainPhaseAtStart = getTrainHazardPhase(this.trainHazardState)
    const puddlePhaseAtStart = getPuddlePhase(this.tunnelHazardState)
    const tunnelTrainPhaseAtStart = getTunnelTrainPhase(this.tunnelHazardState)
    let fallEffect: PlayerFellEffect | null = null
    let tunnelEffects: readonly TunnelHazardEffect[] = []
    if (activeDeltaMs > 0) {
      const timerResult = itemReducer(this.itemRuntime, {
        type: 'advance-time',
        deltaMs: activeDeltaMs,
      })
      this.itemRuntime = timerResult.state
      this.applyItemPresentationEffects(timerResult.effects)

      this.runState = runReducer(this.runState, {
        type: 'advance-time',
        deltaMs: activeDeltaMs,
      }).state
      this.state.actors[this.state.playerId].wakeInvulnerabilityRemainingMs =
        this.runState.respawnInvulnerabilityRemainingMs

      const phaseAtStart = this.zonePhase
      if (phaseAtStart === 'active') {
        this.advanceWaveRuntime(activeDeltaMs)
        if (this.currentZone.id === 'service-train' && this.zonePhase === 'active') {
          const player = this.state.actors[this.state.playerId]
          const hazard = stepTrainHazard(this.trainHazardState, {
            activeDeltaMs,
            player: {
              x: player.position.x,
              y: player.position.y,
              grounded: player.position.z === 0,
            },
          })
          this.trainHazardState = hazard.state
          player.position.x += hazard.carryDeltaX
          fallEffect = hazard.effects[0] ?? null
        } else if (this.currentZone.id === 'flooded-tunnel' && this.zonePhase === 'active') {
          const player = this.state.actors[this.state.playerId]
          const hazard = stepTunnelHazard(this.tunnelHazardState, {
            activeDeltaMs,
            player: {
              id: player.id,
              x: player.position.x,
              y: player.position.y,
              grounded: player.position.z === 0,
            },
            bosses: [...this.bossBrains.keys()].sort().flatMap((bossId) => {
              const boss = this.state.actors[bossId]
              return boss && boss.mode !== 'defeated'
                ? [{
                    id: boss.id,
                    x: boss.position.x,
                    y: boss.position.y,
                    grounded: boss.position.z === 0,
                  }]
                : []
            }),
          })
          this.tunnelHazardState = hazard.state
          tunnelEffects = hazard.effects
        }
      } else {
        this.advanceZoneClock(activeDeltaMs)
      }
    }

    const frame = this.inputAdapter?.readFrame() ?? emptyInputFrame()
    const player = this.state.actors[this.state.playerId]
    const playerTunnelEffect = tunnelEffects.find((effect) => effect.actorId === player.id)
    const itemHealAmount = this.processItemEdges(
      frame,
      player,
      fallEffect !== null || playerTunnelEffect !== undefined,
    )
    const bufferedAction =
      activeDeltaMs > 0
        ? this.actionQueue.nextAction(this.state.elapsedMs)
        : undefined
    const attackId = this.resolveBufferedAttack(bufferedAction, player)
    const playerEnvironmentalImpact: CombatCommand['environmentalImpact'] = fallEffect
      ? {
          damage: fallEffect.damage,
          recoveryPosition: { ...fallEffect.recoveryPosition },
          reaction: { type: 'knockdown', durationMs: fallEffect.knockdownMs },
        }
      : playerTunnelEffect
        ? {
            damage: playerTunnelEffect.damage,
            recoveryPosition: { ...playerTunnelEffect.recoveryPosition },
            reaction: { ...playerTunnelEffect.reaction },
          }
        : undefined
    const playerCommand: CombatCommand = {
      actorId: player.id,
      moveX: frame.moveX,
      moveY: frame.moveY,
      jump: bufferedAction?.edge.type === 'jump',
      ...(attackId ? { attackId } : {}),
      ...(itemHealAmount > 0 ? { healAmount: itemHealAmount } : {}),
      ...(playerEnvironmentalImpact ? { environmentalImpact: playerEnvironmentalImpact } : {}),
    }
    const normalEnemyCommands =
      activeDeltaMs > 0 && this.zonePhase === 'active'
        ? this.buildEnemyCommands(activeDeltaMs)
        : []
    const eliteCommands =
      activeDeltaMs > 0 && this.zonePhase === 'active'
        ? this.buildEliteCommands(activeDeltaMs)
        : []
    const bossCommands =
      activeDeltaMs > 0 && this.zonePhase === 'active'
        ? this.buildBossCommands(activeDeltaMs)
        : []
    const tunnelImpactCommands: CombatCommand[] = tunnelEffects
      .filter((effect) => effect.actorId !== player.id)
      .map((effect) => ({
        actorId: effect.actorId,
        moveX: 0,
        moveY: 0,
        environmentalImpact: {
          damage: effect.damage,
          recoveryPosition: { ...effect.recoveryPosition },
          reaction: { ...effect.reaction },
        },
      }))
    const commands = this.mergeCombatCommands(
      [playerCommand],
      normalEnemyCommands,
      eliteCommands,
      bossCommands,
      tunnelImpactCommands,
      this.empStatusCommands(),
    )

    this.state = this.reduceCombatWithFacingAssist(commands)
    this.acceptEliteAttackStarts()
    this.acceptBossAttackStarts()
    if (this.zonePhase === 'active') this.clampLivingActors()
    this.runState = runReducer(this.runState, {
      type: 'player-hp-changed',
      hp: this.state.actors[this.state.playerId].hp,
    }).state
    if (bufferedAction && this.wasActionAccepted(bufferedAction, attackId, player)) {
      this.recordAcceptedAttack(this.actionQueue.accept(bufferedAction))
    }

    this.consumePresentationBatch(this.collectHazardWarningEdges(
      trainPhaseAtStart,
      puddlePhaseAtStart,
      tunnelTrainPhaseAtStart,
    ))
    this.recordRunCombatEvents()

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
    if (defeatedEnemyIds.length > 0 && this.zonePhase === 'active') {
      this.advanceWaveRuntime(0)
    }
    this.hazardView?.update(activeDeltaMs)
    this.zoneRenderer?.update(fixedStepMs)
    this.trainBackdrop?.update(
      activeDeltaMs,
      getTrainHazardPhase(this.trainHazardState),
      this.trainHazardState.platformCenterX,
      this.itemRuntime.pickups,
    )
    this.tunnelBackdrop?.update(
      activeDeltaMs,
      getPuddlePhase(this.tunnelHazardState),
      getTunnelTrainPhase(this.tunnelHazardState),
    )
  }

  private processItemEdges(
    frame: Readonly<InputFrame>,
    player: Readonly<CombatActor>,
    discardUse = false,
  ): number {
    let requestedHeal = 0
    for (const edge of frame.edges) {
      if (edge.type === 'cycle-item') {
        this.itemRuntime = itemReducer(this.itemRuntime, { type: 'cycle-item' }).state
        continue
      }
      if (edge.type !== 'interact-use' || discardUse || !this.canInteractUse(player)) continue

      const result = itemReducer(this.itemRuntime, {
        type: 'interact-use',
        player: {
          position: { x: player.position.x, y: player.position.y },
          hp: player.hp,
          maxHp: player.maxHp,
          living: player.hp > 0 && player.mode !== 'defeated',
        },
        targets: this.itemTargets(),
      })
      this.itemRuntime = result.state
      this.applyItemPresentationEffects(result.effects)
      for (const effect of result.effects) {
        if (effect.type === 'repair-requested') requestedHeal += effect.amount
      }
    }
    return requestedHeal
  }

  private canInteractUse(player: Readonly<CombatActor>): boolean {
    return (
      this.zonePhase === 'active' &&
      player.hp > 0 &&
      (player.mode === 'idle' || player.mode === 'moving' || player.mode === 'airborne')
    )
  }

  private itemTargets(): ItemTargetSnapshot[] {
    const player = this.state.actors[this.state.playerId]
    return Object.values(this.state.actors)
      .filter((actor) => actor.id !== player.id && actor.team !== player.team)
      .map((actor) => ({
        id: actor.id,
        position: { x: actor.position.x, y: actor.position.y },
        living: actor.hp > 0 && actor.mode !== 'defeated',
        targetClass: this.itemTargetClasses.get(actor.id) ?? 'normal',
      }))
  }

  private applyItemPresentationEffects(effects: readonly ItemEffect[]): void {
    this.pendingItemPresentationEffects.push(...effects.map((effect): ItemEffect => {
      if (effect.type === 'emp-applied') {
        return { ...effect, targets: effect.targets.map((target) => ({ ...target })) }
      }
      if (effect.type === 'emp-expired') {
        return { ...effect, targetIds: [...effect.targetIds] }
      }
      return { ...effect }
    }))
    if (effects.some((effect) =>
      effect.type === 'pickup-acquired' ||
      effect.type === 'repair-requested' ||
      effect.type === 'emp-applied'
    )) {
      this.playerItemUseStartedAtMs = this.state.elapsedMs
    }
    for (const effect of effects) {
      if (effect.type === 'emp-applied') {
        for (const target of effect.targets) this.resetEmpActorPresentation(target.targetId)
      } else if (effect.type === 'emp-expired') {
        for (const targetId of effect.targetIds) this.resetEmpActorPresentation(targetId)
      }
    }
  }

  private collectHazardWarningEdges(
    trainBefore: ReturnType<typeof getTrainHazardPhase>,
    puddleBefore: ReturnType<typeof getPuddlePhase>,
    tunnelTrainBefore: ReturnType<typeof getTunnelTrainPhase>,
  ): HazardWarningId[] {
    const warnings: HazardWarningId[] = []
    if (
      this.currentZone.id === 'service-train' &&
      trainBefore !== 'warning' &&
      getTrainHazardPhase(this.trainHazardState) === 'warning'
    ) {
      warnings.push('train-gap')
    }
    if (this.currentZone.id === 'flooded-tunnel') {
      if (puddleBefore !== 'warning' && getPuddlePhase(this.tunnelHazardState) === 'warning') {
        warnings.push('electric-puddle')
      }
      if (
        tunnelTrainBefore !== 'warning' &&
        getTunnelTrainPhase(this.tunnelHazardState) === 'warning'
      ) {
        warnings.push('tunnel-train')
      }
    }
    return warnings
  }

  private captureActorPresentationPoints(): Readonly<Record<string, ActorPresentationPoint>> {
    const entries = Object.values(this.state.actors).map((actor) => [
      actor.id,
      Object.freeze({
        x: Math.round(actor.position.x),
        y: Math.round(actor.position.y - actor.position.z - Math.max(34, actor.body.height * 0.9)),
        facing: actor.facing,
      }),
    ] as const)
    return Object.freeze(Object.fromEntries(entries))
  }

  /** Final reducer-event consumer, called before player respawn or enemy view deletion. */
  private consumePresentationBatch(warningIds: readonly HazardWarningId[]): void {
    const events = this.state.events.map((event) => Object.freeze({ ...event })) as CombatEvent[]
    const itemEffects = this.pendingItemPresentationEffects.splice(0)
    if (events.length === 0 && itemEffects.length === 0 && warningIds.length === 0) return
    const plan = planPresentationBatch({
      events,
      itemEffects,
      warningIds,
      points: this.captureActorPresentationPoints(),
      playerId: this.state.playerId,
      lowEffect: this.performanceGovernor.mode === 'low-effect' || this.prefersReducedMotion(),
    })
    this.presentationBatchId += 1
    this.combatVfx?.consume(this.presentationBatchId, plan)
    this.audioBus?.consumeBatch(this.presentationBatchId, plan.cues)
    this.hud?.registerConfirmedHits(plan.confirmedHitCount)
  }

  private prefersReducedMotion(): boolean {
    try {
      return this.focusedCanvas?.ownerDocument.defaultView?.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches === true
    } catch {
      return false
    }
  }

  private resetEmpActorPresentation(actorId: string): void {
    if (this.enemyBrains.has(actorId)) {
      this.enemyBrains.set(actorId, createEnemyBrainState('chase'))
    }
    const eliteBrain = this.eliteBrains.get(actorId)
    if (eliteBrain) this.eliteBrains.set(actorId, interruptEliteBrain(eliteBrain))
    const bossBrain = this.bossBrains.get(actorId)
    if (bossBrain) this.bossBrains.set(actorId, interruptBossBrain(bossBrain))
    this.hazardView?.clearEnemy(actorId)
  }

  private clearEmpTimers(): void {
    const affectedActorIds = Object.keys(this.itemRuntime.empRemainingMsByTargetId)
    this.itemRuntime = itemReducer(this.itemRuntime, { type: 'clear-emp' }).state
    for (const actorId of affectedActorIds) this.resetEmpActorPresentation(actorId)
  }

  private replaceInventoryHud(): void {
    this.hud?.dispose()
    this.hud = this.sceneCreated
      ? new HudController(this, this.character.id, this.itemRuntime.inventory)
      : null
    this.inventoryHud = this.hud?.inventoryHud ?? null
  }

  private empStatusCommands(): CombatCommand[] {
    return Object.keys(this.itemRuntime.empRemainingMsByTargetId)
      .sort()
      .filter((actorId) => {
        const actor = this.state.actors[actorId]
        return actor !== undefined && actor.hp > 0 && actor.mode !== 'defeated'
      })
      .map((actorId) => ({
        actorId,
        moveX: 0,
        moveY: 0,
        interruptAttack: true,
        suppressActions: true,
        clearGuard: true,
      }))
  }

  private mergeCombatCommands(
    ...groups: readonly (readonly Readonly<CombatCommand>[])[]
  ): CombatCommand[] {
    const merged = new Map<string, CombatCommand>()
    for (const commands of groups) {
      for (const command of commands) {
        const prior = merged.get(command.actorId)
        merged.set(command.actorId, {
          ...(prior ?? { actorId: command.actorId, moveX: 0, moveY: 0 }),
          ...command,
          healAmount: (prior?.healAmount ?? 0) + (command.healAmount ?? 0),
          interruptAttack:
            prior?.interruptAttack === true || command.interruptAttack === true,
          suppressActions:
            prior?.suppressActions === true || command.suppressActions === true,
          clearGuard: prior?.clearGuard === true || command.clearGuard === true,
          environmentalImpact: command.environmentalImpact ?? prior?.environmentalImpact,
        })
      }
    }
    return [...merged.values()].sort((left, right) => left.actorId.localeCompare(right.actorId))
  }

  private resolvePlayerFacingAssist(command: Readonly<CombatCommand>): -1 | 1 | null {
    if (!command.attackId || command.moveX !== 0 || command.actorId !== this.state.playerId) {
      return null
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
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      })[0]
    if (!target || target.position.x === player.position.x) return null
    return target.position.x < player.position.x ? -1 : 1
  }

  private reduceCombatWithFacingAssist(
    commands: readonly Readonly<CombatCommand>[],
  ): CombatState {
    const preflight = combatReducer(this.state, commands, fixedStepMs)
    const playerCommand = commands.find(
      (command) => command.actorId === this.state.playerId,
    )
    if (!playerCommand?.attackId) return preflight

    const facing = this.resolvePlayerFacingAssist(playerCommand)
    const accepted = preflight.events.some(
      (event) =>
        event.type === 'attack-started' &&
        event.actorId === this.state.playerId &&
        event.attackId === playerCommand.attackId,
    )
    const player = this.state.actors[this.state.playerId]
    if (!accepted || facing === null || facing === player.facing) return preflight

    const assistedInput: CombatState = {
      ...this.state,
      actors: {
        ...this.state.actors,
        [player.id]: { ...player, facing },
      },
    }
    return combatReducer(assistedInput, commands, fixedStepMs)
  }

  private stepUnmountedAdapter(): void {
    if (this.runState.status === 'game-over') return
    if (this.zonePhase !== 'active') {
      this.advanceZoneClock(fixedStepMs)
      return
    }
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
  }

  private advanceWaveRuntime(deltaMs: number): void {
    const result = advanceWaveDirector(this.waveRuntime.wave, {
      deltaMs,
      defeatedEnemyIds: [...this.pendingDefeatedEnemyIds],
      activeEnemies: this.activeEnemyObservations(),
      arena: this.currentZone.arena,
      playerPosition: {
        x: this.state.actors[this.state.playerId].position.x,
        y: this.state.actors[this.state.playerId].position.y,
      },
      playerSafeSeparation: this.currentZone.playerSafeSeparation,
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
      if (isInsideArena(position, this.currentZone.arena)) {
        this.returningEnemyIds.delete(enemyId)
      }
      observations.push({
        enemyId,
        position,
        down: actor.mode === 'knocked-down' || actor.mode === 'getting-up',
        madeRecoveryProgress:
          prior !== undefined &&
          distanceToArena(position, this.currentZone) <
            distanceToArena(prior, this.currentZone),
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
    const bossDefinition = isBossDefinitionId(enemyVariantId)
      ? getBossDefinition(enemyVariantId)
      : null
    const eliteDefinition = isEliteDefinitionId(enemyVariantId)
      ? getEliteDefinition(enemyVariantId)
      : null
    const variant = getWaveVariant(enemyVariantId)
    const body = getWaveBaseBody(runtime.baseBodyId)
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
      damageScale: bossDefinition
        ? this.currentZone.bossDamageScale
        : eliteDefinition
          ? this.currentZone.eliteDamageScale
          : this.currentZone.enemyDamageScale,
      moveSpeed: variant.moveSpeed,
    })
    this.state.actors[enemyId] = actor
    if (bossDefinition) {
      this.bossBrains.set(enemyId, createBossBrainState())
    } else if (eliteDefinition) {
      this.eliteBrains.set(enemyId, createEliteBrainState())
    } else {
      this.enemyBrains.set(enemyId, { ...runtime.brain })
      this.enemyRngs.set(enemyId, new SeededRandom(runtime.seed))
    }
    this.enemyVariantIds.set(enemyId, enemyVariantId)
    this.itemTargetClasses.set(
      enemyId,
      bossDefinition?.targetClass ?? eliteDefinition?.targetClass ?? 'normal',
    )
    this.lastRecoveryPositions.set(enemyId, { ...order.position })
    this.actorViews.set(
      enemyId,
      new ActorView(this, actor, enemyVariantId),
    )
    this.services.recordEnemySpawn(enemyId, this.state.elapsedMs)
  }

  private buildEnemyCommands(deltaMs = fixedStepMs): CombatCommand[] {
    const commands: CombatCommand[] = []
    const player = this.state.actors[this.state.playerId]
    for (const enemyId of [...this.enemyBrains.keys()].sort()) {
      const actor = this.state.actors[enemyId]
      let brain = this.enemyBrains.get(enemyId)
      const rng = this.enemyRngs.get(enemyId)
      const variantId = this.enemyVariantIds.get(enemyId)
      if (!actor || !brain || !rng || !variantId || actor.mode === 'defeated') continue
      if ((this.itemRuntime.empRemainingMsByTargetId[enemyId] ?? 0) > 0) continue
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
              x: (this.currentZone.arena.minX + this.currentZone.arena.maxX) / 2,
              y: (this.currentZone.arena.minY + this.currentZone.arena.maxY) / 2,
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
            deltaMs,
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

  private buildEliteCommands(deltaMs = fixedStepMs): CombatCommand[] {
    const commands: CombatCommand[] = []
    const player = this.state.actors[this.state.playerId]
    for (const enemyId of [...this.eliteBrains.keys()].sort()) {
      const actor = this.state.actors[enemyId]
      const brain = this.eliteBrains.get(enemyId)
      const variantId = this.enemyVariantIds.get(enemyId)
      if (!actor || !brain || !variantId || !isEliteDefinitionId(variantId)) continue
      if (actor.mode === 'defeated') continue
      if ((this.itemRuntime.empRemainingMsByTargetId[enemyId] ?? 0) > 0) continue
      const definition = getEliteDefinition(variantId)
      actor.facing = player.position.x < actor.position.x ? -1 : 1
      let command: CombatCommand = { actorId: enemyId, moveX: 0, moveY: 0 }

      if (
        actor.mode === 'hitstun' ||
        actor.mode === 'knocked-down' ||
        actor.mode === 'getting-up'
      ) {
        this.eliteBrains.set(enemyId, interruptEliteBrain(brain))
        this.hazardView?.clearEnemy(enemyId)
        commands.push(command)
        continue
      }

      if (this.returningEnemyIds.has(enemyId)) {
        command = {
          ...command,
          moveX: axisToward(
            actor.position.x,
            (this.currentZone.arena.minX + this.currentZone.arena.maxX) / 2,
          ),
          moveY: axisToward(
            actor.position.y,
            (this.currentZone.arena.minY + this.currentZone.arena.maxY) / 2,
          ),
        }
      } else {
        const result = stepEliteBrain({
          state: brain,
          definition,
          position: actor.position,
          playerPosition: player.position,
          activeDeltaMs: deltaMs,
          actorActiveAttackId: actor.activeAttack?.attackId ?? null,
          acceptedAttackId: null,
          empRemainingMs: 0,
        })
        this.eliteBrains.set(enemyId, result.state)
        for (const intent of result.intents) {
          command = { ...command, ...this.applyEliteIntent(enemyId, intent) }
        }
      }
      commands.push(command)
    }
    return commands
  }

  private applyEliteIntent(
    enemyId: string,
    intent: Readonly<EliteIntent>,
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
    this.hazardView?.clearEnemy(enemyId)
    return { attackId: intent.attackId }
  }

  private acceptEliteAttackStarts(): void {
    for (const event of this.state.events) {
      if (event.type !== 'attack-started') continue
      const brain = this.eliteBrains.get(event.actorId)
      const actor = this.state.actors[event.actorId]
      const variantId = this.enemyVariantIds.get(event.actorId)
      if (!brain || !actor || !variantId || !isEliteDefinitionId(variantId)) continue
      const result = stepEliteBrain({
        state: brain,
        definition: getEliteDefinition(variantId),
        position: actor.position,
        playerPosition: this.state.actors[this.state.playerId].position,
        activeDeltaMs: 0,
        actorActiveAttackId: actor.activeAttack?.attackId ?? null,
        acceptedAttackId: event.attackId,
        empRemainingMs: 0,
      })
      this.eliteBrains.set(event.actorId, result.state)
    }
  }

  private buildBossCommands(deltaMs = fixedStepMs): CombatCommand[] {
    const commands: CombatCommand[] = []
    const player = this.state.actors[this.state.playerId]
    for (const bossId of [...this.bossBrains.keys()].sort()) {
      const actor = this.state.actors[bossId]
      const brain = this.bossBrains.get(bossId)
      const variantId = this.enemyVariantIds.get(bossId)
      if (!actor || !brain || !variantId || !isBossDefinitionId(variantId)) continue
      if (actor.mode === 'defeated') continue
      if ((this.itemRuntime.empRemainingMsByTargetId[bossId] ?? 0) > 0) continue
      const definition = getBossDefinition(variantId)
      actor.facing = player.position.x < actor.position.x ? -1 : 1
      let command: CombatCommand = { actorId: bossId, moveX: 0, moveY: 0 }

      if (
        actor.mode === 'hitstun' ||
        actor.mode === 'knocked-down' ||
        actor.mode === 'getting-up'
      ) {
        this.bossBrains.set(bossId, interruptBossBrain(brain))
        this.hazardView?.clearEnemy(bossId)
        commands.push(command)
        continue
      }

      if (this.returningEnemyIds.has(bossId)) {
        command = {
          ...command,
          moveX: axisToward(
            actor.position.x,
            (this.currentZone.arena.minX + this.currentZone.arena.maxX) / 2,
          ),
          moveY: axisToward(
            actor.position.y,
            (this.currentZone.arena.minY + this.currentZone.arena.maxY) / 2,
          ),
        }
      } else {
        const result = stepBossBrain({
          state: brain,
          definition,
          hp: actor.hp,
          position: actor.position,
          playerPosition: player.position,
          activeDeltaMs: deltaMs,
          actorActiveAttackId: actor.activeAttack?.attackId ?? null,
          acceptedAttackId: null,
          empRemainingMs: 0,
        })
        this.bossBrains.set(bossId, result.state)
        for (const intent of result.intents) {
          command = { ...command, ...this.applyBossIntent(bossId, intent) }
        }
      }
      commands.push(command)
    }
    return commands
  }

  private applyBossIntent(
    bossId: string,
    intent: Readonly<BossIntent>,
  ): Partial<CombatCommand> {
    const actor = this.state.actors[bossId]
    if (!actor) return {}
    if (intent.type === 'move') {
      actor.moveSpeed = intent.speed
      return {
        moveX: axisToward(actor.position.x, intent.target.x),
        moveY: axisToward(actor.position.y, intent.target.y),
      }
    }
    if (intent.type === 'telegraph') {
      this.hazardView?.showTelegraph(
        bossId,
        { x: actor.position.x, y: actor.position.y },
        intent.range,
        intent.durationMs,
      )
      return {}
    }
    actor.attackSpeedScale = intent.attackSpeedScale
    this.hazardView?.clearEnemy(bossId)
    return { attackId: intent.attackId }
  }

  private acceptBossAttackStarts(): void {
    for (const event of this.state.events) {
      if (event.type !== 'attack-started') continue
      const brain = this.bossBrains.get(event.actorId)
      const actor = this.state.actors[event.actorId]
      const variantId = this.enemyVariantIds.get(event.actorId)
      if (!brain || !actor || !variantId || !isBossDefinitionId(variantId)) continue
      const result = stepBossBrain({
        state: brain,
        definition: getBossDefinition(variantId),
        hp: actor.hp,
        position: actor.position,
        playerPosition: this.state.actors[this.state.playerId].position,
        activeDeltaMs: 0,
        actorActiveAttackId: actor.activeAttack?.attackId ?? null,
        acceptedAttackId: event.attackId,
        empRemainingMs: 0,
      })
      this.bossBrains.set(event.actorId, result.state)
    }
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
      const attackId = this.currentZone.enemyPatternAttackIds[intent.attackId]
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
    const uniqueEnemyIds = [...new Set(enemyIds)]
    if (uniqueEnemyIds.length > 0) {
      this.itemRuntime = itemReducer(this.itemRuntime, {
        type: 'remove-targets',
        targetIds: uniqueEnemyIds,
      }).state
    }
    for (const enemyId of uniqueEnemyIds) {
      if (!this.waveRuntime.wave.spawnedEnemyIds.includes(enemyId)) continue
      this.pendingDefeatedEnemyIds.add(enemyId)
      this.actorViews.get(enemyId)?.dispose()
      this.actorViews.delete(enemyId)
      this.enemyBrains.delete(enemyId)
      this.eliteBrains.delete(enemyId)
      this.bossBrains.delete(enemyId)
      this.enemyRngs.delete(enemyId)
      this.enemyVariantIds.delete(enemyId)
      this.itemTargetClasses.delete(enemyId)
      this.returningEnemyIds.delete(enemyId)
      this.lastRecoveryPositions.delete(enemyId)
      this.hazardView?.clearEnemy(enemyId)
      delete this.state.actors[enemyId]
    }
  }

  /** Consumes the final reducer facts once, before defeat routing can delete actor-class maps. */
  private recordRunCombatEvents(): void {
    let playerConfirmedHits = 0
    let playerDamageEvents = 0
    const defeatedEnemyIds = new Set<string>()

    for (const event of this.state.events) {
      if (event.type === 'hit-confirmed') {
        if (event.attackerId === this.state.playerId) playerConfirmedHits += 1
        if (event.targetId === this.state.playerId) playerDamageEvents += 1
        continue
      }
      if (event.type === 'environmental-impact' && event.actorId === this.state.playerId) {
        playerDamageEvents += 1
        continue
      }
      if (event.type !== 'actor-defeated' || event.actorId === this.state.playerId) continue
      defeatedEnemyIds.add(event.actorId)
    }

    const defeatedEnemyClasses: DefeatedEnemyClass[] = [...defeatedEnemyIds].map(
      (enemyId) => this.itemTargetClasses.get(enemyId) ?? 'normal',
    )
    this.runState = runReducer(this.runState, {
      type: 'record-combat-events',
      playerConfirmedHits,
      playerDamageEvents,
      defeatedEnemyClasses,
    }).state
  }

  private beginWaveClear(waveId: string): void {
    if (this.zonePhase !== 'active' || waveId !== this.currentWave().id) return
    this.zoneRenderer?.setLocked(false)
    this.hazardView?.reset()
    if (this.waveIndex < this.currentZone.waves.length - 1) {
      this.zonePhase = 'inter-wave'
      this.interWaveRemainingMs = this.currentZone.interWaveDelayMs
      return
    }
    this.clearEmpTimers()
    this.pendingCombatResult = 'mission-clear'
    this.zonePhase = 'zone-clear'
    this.transitionRemainingMs = this.currentZone.transitionDurationMs
    this.zoneClearText
      ?.setText(
        this.currentZone.id === 'flooded-tunnel'
          ? 'FLOODED TUNNEL\nMISSION CLEAR'
          : `${this.currentZone.id === 'n9-depot' ? 'N-9 DEPOT' : 'SERVICE TRAIN'}\nZONE CLEAR`,
      )
      .setVisible(true)
  }

  private advanceZoneClock(deltaMs: number): void {
    const elapsed = finiteDelta(deltaMs)
    if (this.zonePhase === 'inter-wave') {
      const interWaveElapsed = Math.min(this.interWaveRemainingMs, elapsed)
      this.interWaveRemainingMs -= interWaveElapsed
      if (this.interWaveRemainingMs === 0) {
        const priorWaveIndex = this.waveIndex
        this.startNextWave()
        if (this.waveIndex !== priorWaveIndex) {
          this.advanceWaveRuntime(elapsed - interWaveElapsed)
        }
      }
      return
    }
    if (this.zonePhase !== 'zone-clear') return
    this.transitionRemainingMs = Math.max(0, this.transitionRemainingMs - elapsed)
    if (this.transitionRemainingMs === 0) this.enterNextZone()
  }

  private startNextWave(): void {
    const nextIndex = this.waveIndex + 1
    if (nextIndex >= this.currentZone.waves.length) return
    this.waveIndex = nextIndex
    this.waveRuntime = this.createWaveRuntime(nextIndex)
    this.runState = { ...this.runState, currentWaveId: this.currentWave().id }
    this.zonePhase = 'active'
    this.interWaveRemainingMs = 0
    this.pendingDefeatedEnemyIds.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.clearEmpTimers()
    this.hazardView?.reset()
    this.zoneRenderer?.setLocked(true)
  }

  private clampLivingActors(): void {
    for (const actor of Object.values(this.state.actors)) {
      if (actor.mode === 'defeated') continue
      actor.position.x = Math.min(
        this.currentZone.arena.maxX,
        Math.max(this.currentZone.arena.minX, actor.position.x),
      )
      actor.position.y = Math.min(
        this.currentZone.arena.maxY,
        Math.max(this.currentZone.arena.minY, actor.position.y),
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
      if (!actor) continue
      view.update(actor, {
        domainTimeMs: this.state.elapsedMs,
        telegraph: this.telegraphFor(actorId),
        itemUse: actorId === this.state.playerId && this.playerItemUseStartedAtMs !== null
          ? { startedAtMs: this.playerItemUseStartedAtMs, durationMs: 400 }
          : null,
      })
    }
    const player = this.state.actors[this.state.playerId]
    if (player) {
      this.hud?.update({
        characterId: this.character.id,
        hp: player.hp,
        maxHp: player.maxHp,
        meter: player.meter,
        lives: this.runState.lives,
        inventory: this.itemRuntime.inventory,
        encounter: this.encounterHudSnapshot(),
      })
    }
    if (this.runState.status !== 'game-over') {
      this.gameOverText?.setVisible(false)
      return
    }
    const prompt = this.runState.continueAvailable
      ? 'GAME OVER\nENTER · CONTINUE   ESC · FORFEIT'
      : 'GAME OVER\nCONTINUE EXHAUSTED\nENTER / J / ESC / T · RESULTS'
    this.gameOverText?.setText(prompt).setVisible(true)
  }

  private encounterHudSnapshot(): { label: string; hp: number; maxHp: number } | null {
    const bossId = [...this.bossBrains.keys()].sort()[0]
    const eliteId = [...this.eliteBrains.keys()].sort()[0]
    const actorId = bossId ?? eliteId
    if (!actorId) return null
    const actor = this.state.actors[actorId]
    if (!actor || actor.mode === 'defeated') return null
    return {
      label: bossId ? 'SILO DREDGER' : 'RAIL WARDEN',
      hp: actor.hp,
      maxHp: actor.maxHp,
    }
  }

  private resetTransientPresentation(): void {
    this.pendingItemPresentationEffects = []
    this.combatVfx?.resetTransient()
    this.audioBus?.resetTransient()
    this.hud?.resetTransient()
  }

  private telegraphFor(actorId: string): ActorTelegraphSnapshot | null {
    const normal = this.enemyBrains.get(actorId)
    if (normal?.mode === 'telegraph' && normal.attackId) {
      return { attackId: normal.attackId, elapsedMs: normal.elapsedMs }
    }
    const elite = this.eliteBrains.get(actorId)
    if (elite?.mode === 'telegraph' && elite.attackId) {
      return { attackId: elite.attackId, elapsedMs: elite.elapsedMs }
    }
    const boss = this.bossBrains.get(actorId)
    if (boss?.mode === 'telegraph' && boss.attackId) {
      return { attackId: boss.attackId, elapsedMs: boss.elapsedMs }
    }
    return null
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
      if (effect.type === 'same-wave-respawn') {
        this.respawnPlayerInCurrentWave()
      } else if (effect.type === 'rebuild-zone') {
        this.rebuildZoneFromCheckpoint(effect.inventory)
      } else {
        this.handleZoneEntered(effect.entry)
      }
    }
  }

  private respawnPlayerInCurrentWave(): void {
    this.hud?.resetCombo()
    this.clearEmpTimers()
    const player = this.state.actors[this.state.playerId]
    player.hp = player.maxHp
    player.position = { ...this.currentZone.playerStart }
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
    this.playerItemUseStartedAtMs = null
  }

  private tryContinue(): void {
    if (!this.runState.continueAvailable) return
    this.inputAdapter?.readFrame()
    this.actionQueue.clear()
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

  private rebuildZoneFromCheckpoint(inventory: Readonly<ItemInventory>): void {
    const character = characters.find((entry) => entry.id === this.runState.characterId)
    if (!character) return
    this.character = character
    this.resetTransientPresentation()
    this.clearEnemyResources()
    this.currentZone = getPlayableStageOneZone(this.runState.zoneId as PlayableStageOneZoneId)
    this.authoredItemPickups = this.cloneAuthoredPickups(this.currentZone.pickups)
    this.itemRuntime = createItemRuntimeState({
      inventory,
      pickups: this.authoredItemPickups,
    })
    this.state = createCombatState(character, this.currentZone.playerStart)
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
    this.playerItemUseStartedAtMs = null
    this.finished = false
    this.trainHazardState = createTrainHazardState()
    this.tunnelHazardState = createTunnelHazardState()
    this.pendingCombatResult = 'mission-clear'
    this.zoneRenderer?.reset()
    this.trainBackdrop?.reset(this.itemRuntime.pickups)
    this.tunnelBackdrop?.reset()
    this.hazardView?.reset()
    this.zoneClearText?.setVisible(false)
    this.replaceInventoryHud()
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
    this.eliteBrains.clear()
    this.bossBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.itemTargetClasses.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
  }

  private createWaveRuntime(index: number): ZoneWaveRuntime {
    const wave = this.currentZone.waves[index]
    return createZoneWaveRuntime(wave, wave.seed, enemyContent)
  }

  private currentWave(): StageOneWaveDefinition {
    return this.currentZone.waves[this.waveIndex]
  }

  private clearEnemyResources(): void {
    for (const [actorId, view] of this.actorViews) {
      if (actorId === this.state?.playerId) continue
      view.dispose()
      this.actorViews.delete(actorId)
    }
    if (this.state) {
      for (const actorId of Object.keys(this.state.actors)) {
        if (actorId !== this.state.playerId) delete this.state.actors[actorId]
      }
    }
    this.enemyBrains.clear()
    this.eliteBrains.clear()
    this.bossBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.itemTargetClasses.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.pendingDefeatedEnemyIds.clear()
    this.hazardView?.reset()
  }

  private cloneAuthoredPickups(
    pickups: readonly Readonly<ItemPickupSnapshot>[],
  ): ItemPickupSnapshot[] {
    return pickups.map((pickup) => ({
      ...pickup,
      position: { ...pickup.position },
    }))
  }

  private enterNextZone(): void {
    if (this.zonePhase !== 'zone-clear') return
    if (this.currentZone.nextZoneEntry === null) {
      if (this.finished || this.runState.status === 'game-over') return
      this.finishRun(this.pendingCombatResult)
      return
    }
    const result = runReducer(this.runState, {
      type: 'enter-zone',
      entry: this.currentZone.nextZoneEntry,
    })
    this.runState = result.state
    this.applyRunEffects(result.effects)
  }

  /** The single scene-owned zone-entry checkpoint and runtime handoff location. */
  private handleZoneEntered(entry: Readonly<ZoneEntry>): void {
    this.resetTransientPresentation()
    this.zoneCheckpoint = immutableCheckpoint({
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      characterId: this.runState.characterId,
      zoneId: entry.zoneId,
      zoneStartWaveId: entry.zoneStartWaveId,
      inventory: cloneItemInventory(this.itemRuntime.inventory),
    })
    this.checkpointStore.save(this.zoneCheckpoint)
    this.clearEmpTimers()
    this.clearEnemyResources()
    this.actionQueue.clear()
    this.acceptedAttackHistory = []
    this.playerItemUseStartedAtMs = null

    this.currentZone = getPlayableStageOneZone(entry.zoneId)
    this.authoredItemPickups = this.cloneAuthoredPickups(this.currentZone.pickups)
    this.itemRuntime = createItemRuntimeState({
      inventory: this.itemRuntime.inventory,
      pickups: this.authoredItemPickups,
    })
    const player = this.state.actors[this.state.playerId]
    player.position = { ...this.currentZone.playerStart }
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
    this.trainHazardState = createTrainHazardState()
    this.tunnelHazardState = createTunnelHazardState()
    this.pendingCombatResult = 'mission-clear'
    this.initializeZoneRuntime()
    this.zoneRenderer?.dispose()
    this.zoneRenderer = null
    this.trainBackdrop?.dispose()
    this.trainBackdrop = null
    this.tunnelBackdrop?.dispose()
    this.tunnelBackdrop = null
    if (entry.zoneId === 'service-train') {
      this.trainBackdrop = new TrainBackdrop(this, this.itemRuntime.pickups)
    } else if (entry.zoneId === 'flooded-tunnel') {
      this.tunnelBackdrop = new TunnelBackdrop(this)
    }
    this.hazardView?.reset()
    this.zoneClearText
      ?.setText(
        entry.zoneId === 'service-train'
          ? 'SERVICE TRAIN\nZONE 2'
          : 'FLOODED TUNNEL\nZONE 3',
      )
      .setVisible(false)
    this.syncPresentation()
  }

  private debugClearCurrentZone(): void {
    if (this.zonePhase === 'zone-clear' || this.zonePhase === 'zone-handoff') return
    this.runState = runReducer(this.runState, { type: 'mark-debug-clear-used' }).state
    this.resetTransientPresentation()
    this.clearEnemyResources()
    this.clearEmpTimers()
    this.pendingCombatResult = 'debug-clear'
    this.zonePhase = 'zone-clear'
    this.interWaveRemainingMs = 0
    this.transitionRemainingMs = this.currentZone.transitionDurationMs
    this.zoneRenderer?.setLocked(false)
    this.hazardView?.reset()
    this.zoneClearText?.setVisible(true)
  }

  private readonly focusCanvas = (): void => {
    this.focusedCanvas?.focus({ preventScroll: true })
    this.windowFocused = true
    this.canvasFocused = true
    this.reconcilePresentationPause()
  }

  private readonly onCanvasBlur = (): void => {
    this.canvasFocused = false
    this.reconcilePresentationPause()
  }

  private readonly onCanvasFocus = (): void => {
    this.canvasFocused = true
    this.reconcilePresentationPause()
  }

  private readonly onWindowBlur = (): void => {
    this.windowFocused = false
    this.reconcilePresentationPause()
  }

  private readonly onWindowFocus = (): void => {
    this.windowFocused = true
    if (this.focusedCanvas?.ownerDocument.activeElement === this.focusedCanvas) {
      this.canvasFocused = true
    }
    this.reconcilePresentationPause()
  }

  private readonly onVisibilityChange = (): void => {
    const documentTarget = this.visibilityEventTarget as (EventTarget & {
      visibilityState?: string
      hidden?: boolean
    }) | null
    this.documentVisible = !(
      documentTarget?.hidden === true || documentTarget?.visibilityState === 'hidden'
    )
    this.reconcilePresentationPause()
  }

  private reconcilePresentationPause(): void {
    if (!this.windowFocused || !this.canvasFocused || !this.documentVisible) {
      this.pausePresentation()
    } else {
      this.resumePresentation()
    }
  }

  private pausePresentation(): void {
    if (this.presentationPaused) return
    this.presentationPaused = true
    this.runner?.pause()
    this.inputAdapter?.clear()
    this.actionQueue.clear()
    this.audioBus?.pause()
    this.performanceGovernor.resetSampling()
    this.discardNextRenderDelta = true
  }

  private resumePresentation(): void {
    if (!this.presentationPaused) return
    this.presentationPaused = false
    this.runner?.resume()
    void this.audioBus?.resume()
    this.performanceGovernor.resetSampling()
    this.discardNextRenderDelta = true
  }

  private readonly onDebugKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (import.meta.env.DEV && event.code === 'Backquote') {
      event.preventDefault()
      this.services.requestDebugClear()
      return
    }
    if (this.runState.status !== 'game-over') return
    if (this.runState.continueAvailable) {
      if (event.code === 'Enter') {
        event.preventDefault()
        this.tryContinue()
      } else if (event.code === 'Escape') {
        event.preventDefault()
        this.finishRun('mission-failed')
      }
      return
    }
    if (['Enter', 'Space', 'KeyJ', 'Escape', 'KeyT'].includes(event.code)) {
      event.preventDefault()
      this.finishRun('mission-failed')
    }
  }

  private finishRun(requestedOutcome: RunOutcome): void {
    if (this.finished) return
    const outcome: RunOutcome =
      requestedOutcome === 'mission-clear' && this.runState.debugClearUsed
        ? 'debug-clear'
        : requestedOutcome
    const rank = calculateRunRank({
      outcome,
      activeTimeMs: this.runState.activeTimeMs,
      score: this.runState.score,
      maxCombo: this.runState.maxCombo,
      hitsTaken: this.runState.hitsTaken,
      continueUsed: this.runState.continueUsed,
    })
    this.finished = true
    this.actionQueue.clear()
    this.acceptedAttackHistory = []
    this.services.completeRun({
      outcome,
      characterId: this.runState.characterId,
      activeTimeMs: this.runState.activeTimeMs,
      score: this.runState.score,
      maxCombo: this.runState.maxCombo,
      hitsTaken: this.runState.hitsTaken,
      continueUsed: this.runState.continueUsed,
      rank,
    })
    this.scene.start(SCENE_KEYS.Results)
  }

  private dispose(): void {
    this.runner?.pause()
    this.runner = null
    this.inputAdapter?.dispose()
    this.inputAdapter = null
    this.actionQueue.clear()
    this.focusedCanvas?.removeEventListener('pointerdown', this.focusCanvas)
    this.focusedCanvas?.removeEventListener('blur', this.onCanvasBlur)
    this.focusedCanvas?.removeEventListener('focus', this.onCanvasFocus)
    this.focusEventTarget?.removeEventListener('blur', this.onWindowBlur)
    this.focusEventTarget?.removeEventListener('focus', this.onWindowFocus)
    this.visibilityEventTarget?.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.focusedCanvas = null
    this.focusEventTarget = null
    this.visibilityEventTarget = null
    this.input.keyboard?.off('keydown', this.onDebugKeyDown)
    for (const view of this.actorViews.values()) view.dispose()
    this.actorViews.clear()
    this.enemyBrains.clear()
    this.eliteBrains.clear()
    this.bossBrains.clear()
    this.enemyRngs.clear()
    this.enemyVariantIds.clear()
    this.itemTargetClasses.clear()
    this.returningEnemyIds.clear()
    this.lastRecoveryPositions.clear()
    this.pendingDefeatedEnemyIds.clear()
    this.hazardView?.dispose()
    this.hazardView = null
    this.zoneRenderer?.dispose()
    this.zoneRenderer = null
    this.trainBackdrop?.dispose()
    this.trainBackdrop = null
    this.tunnelBackdrop?.dispose()
    this.tunnelBackdrop = null
    this.hud?.dispose()
    this.hud = null
    this.inventoryHud = null
    this.combatVfx?.dispose()
    this.combatVfx = null
    this.audioBus?.dispose()
    this.audioBus = null
    this.gameOverText = null
    this.zoneClearText = null
    this.zoneCheckpoint = null
    this.itemRuntime = createItemRuntimeState()
    this.authoredItemPickups = []
    this.trainHazardState = createTrainHazardState()
    this.tunnelHazardState = createTunnelHazardState()
    this.pendingCombatResult = 'mission-clear'
    this.acceptedAttackHistory = []
    this.playerItemUseStartedAtMs = null
    this.pendingItemPresentationEffects = []
    this.presentationPaused = false
    this.discardNextRenderDelta = false
    this.windowFocused = true
    this.canvasFocused = true
    this.documentVisible = true
    this.sceneCreated = false
  }
}
