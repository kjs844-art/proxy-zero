import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => {
  class DisplayObject {
    visible = true
    x = 0
    y = 0
    setAlpha(_value: number): this { return this }
    setBackgroundColor(_value: string): this { return this }
    setColor(_value: string): this { return this }
    setDepth(_value: number): this { return this }
    setDisplaySize(_width: number, _height: number): this { return this }
    setFillStyle(_color: number, _alpha?: number): this { return this }
    setFrame(_frame: string): this { return this }
    setFlipX(_value: boolean): this { return this }
    setInteractive(_value?: unknown): this { return this }
    setOrigin(_x: number, _y?: number): this { return this }
    setPosition(x: number, y: number): this { this.x = x; this.y = y; return this }
    setScale(_value: number): this { return this }
    setScrollFactor(_value: number): this { return this }
    setStrokeStyle(_width: number, _color: number, _alpha?: number): this { return this }
    setText(_value: string): this { return this }
    setTint(_value: number): this { return this }
    setTintFill(_value: number): this { return this }
    setVisible(value: boolean): this { this.visible = value; return this }
    clearTint(): this { return this }
    destroy(): void {}
    on(_event: string, _listener: (...args: unknown[]) => void): this { return this }
  }
  class Graphics extends DisplayObject {
    clear(): this { return this }
    fillCircle(_x: number, _y: number, _radius: number): this { return this }
    fillRect(_x: number, _y: number, _width: number, _height: number): this { return this }
    fillStyle(_color: number, _alpha?: number): this { return this }
    lineBetween(_x1: number, _y1: number, _x2: number, _y2: number): this { return this }
    lineStyle(_width: number, _color: number, _alpha?: number): this { return this }
    strokeRect(_x: number, _y: number, _width: number, _height: number): this { return this }
  }
  const createCanvas = () => {
    const documentTarget = new EventTarget() as EventTarget & {
      activeElement: EventTarget | null
      defaultView: EventTarget
    }
    documentTarget.activeElement = null
    documentTarget.defaultView = new EventTarget()
    const canvas = new EventTarget() as EventTarget & {
      focus(options?: FocusOptions): void
      ownerDocument: typeof documentTarget
      setAttribute(name: string, value: string): void
    }
    canvas.ownerDocument = documentTarget
    canvas.focus = () => { documentTarget.activeElement = canvas }
    canvas.setAttribute = () => undefined
    return canvas
  }
  class Scene {
    readonly add = {
      ellipse: () => new DisplayObject(),
      graphics: () => new Graphics(),
      image: () => new DisplayObject(),
      rectangle: () => new DisplayObject(),
      text: () => new DisplayObject(),
    }
    readonly cameras = { main: { setBackgroundColor: vi.fn() } }
    readonly events = { once: vi.fn() }
    readonly game = { canvas: createCanvas() }
    readonly input = { keyboard: { off: vi.fn(), on: vi.fn() }, off: vi.fn(), on: vi.fn() }
    readonly scene = { start: vi.fn() }
    constructor(_config: unknown) {}
  }
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } }
})

import { combatAttackCatalog } from '../../src/content/attacks'
import { getEliteDefinition } from '../../src/content/elites'
import {
  getPlayableStageOneZone,
  serviceTrainZone,
  type PlayableStageOneZoneDefinition,
} from '../../src/content/stage1'
import { GameServices, SCENE_KEYS } from '../../src/app/GameServices'
import type { CombatState } from '../../src/domain/combat/combatReducer'
import type { InputFrame } from '../../src/domain/combat/inputBuffer'
import { fixedStepMs } from '../../src/domain/combat/tuning'
import { SIDE_SCROLL_VIEWPORT_WIDTH } from '../../src/domain/world/sideScroll'
import {
  createEliteBrainState,
  type EliteBrainState,
} from '../../src/domain/enemies/eliteBrain'
import { createItemRuntimeState, type ItemRuntimeState } from '../../src/domain/items/itemReducer'
import { runReducer, type RunCheckpoint, type RunState } from '../../src/domain/run/runReducer'
import {
  getTrainHazardPhase,
  type TrainHazardState,
} from '../../src/domain/world/trainHazard'
import type { ZoneWaveRuntime } from '../../src/domain/waves/waveDirector'
import { CombatScene } from '../../src/phaser/scenes/CombatScene'
import { TrainBackdrop } from '../../src/phaser/world/TrainBackdrop'
import { ZoneRenderer } from '../../src/phaser/world/ZoneRenderer'

describe('service-train authored integration contracts', () => {
  it('authors the exact five waves, items, arena, timing, and Zone 3 handoff', () => {
    expect(getPlayableStageOneZone('service-train')).toBe(serviceTrainZone)
    expect(serviceTrainZone).toMatchObject({
      id: 'service-train',
      arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
      playerSafeSeparation: { x: 72, y: 34 },
      playerStart: { x: 112, y: 236, z: 0 },
      interWaveDelayMs: 900,
      enemyDamageScale: 0.2,
      eliteDamageScale: 1,
      transitionDurationMs: 1_500,
      targetDurationMs: 360_000,
      acceptanceDurationMs: { min: 300_000, max: 420_000 },
      nextZoneEntry: { zoneId: 'flooded-tunnel', zoneStartWaveId: 'flooded-tunnel-wave-1' },
    })
    expect(serviceTrainZone.waves).toEqual([
      {
        id: 'service-train-wave-1', seed: 0x4ad5e714,
        orders: [
          { id: 'train-striker', enemyVariantId: 'scout-striker', delayMs: 0, position: { x: 480, y: 214 } },
          { id: 'train-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 600, position: { x: 540, y: 288 } },
        ],
      },
      {
        id: 'service-train-wave-2', seed: 0x5be6f825,
        orders: [
          { id: 'train-patrol', enemyVariantId: 'scout-patrol', delayMs: 0, position: { x: 450, y: 276 } },
          { id: 'train-flanker', enemyVariantId: 'scout-striker', delayMs: 600, position: { x: 524, y: 208 } },
          { id: 'train-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 1_200, position: { x: 552, y: 280 } },
        ],
      },
      {
        id: 'service-train-wave-3', seed: 0x6cf70936,
        orders: [
          { id: 'train-patrol-support', enemyVariantId: 'scout-patrol', delayMs: 0, position: { x: 470, y: 250 } },
          { id: 'train-rear-striker', enemyVariantId: 'scout-striker', delayMs: 650, position: { x: 540, y: 300 } },
          { id: 'train-rear-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 1_300, position: { x: 560, y: 220 } },
        ],
      },
      {
        id: 'service-train-wave-4', seed: 0x7d081a47,
        orders: [
          { id: 'train-late-patrol', enemyVariantId: 'scout-patrol', delayMs: 0, position: { x: 455, y: 286 } },
          { id: 'elite-screen-striker', enemyVariantId: 'scout-striker', delayMs: 650, position: { x: 520, y: 210 } },
          { id: 'elite-screen-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 1_300, position: { x: 570, y: 292 } },
          { id: 'train-final-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 1_950, position: { x: 500, y: 250 } },
        ],
      },
      {
        id: 'service-train-wave-5', seed: 0x8e192b58,
        orders: [
          { id: 'elite-bulwark-frame', enemyVariantId: 'elite-bulwark-frame', delayMs: 0, position: { x: 500, y: 270 } },
        ],
      },
    ])
    expect(serviceTrainZone.pickups).toEqual([
      { id: 'service-train:repair-kit', itemId: 'repair-kit', position: { x: 176, y: 214 }, consumed: false },
      { id: 'service-train:emp', itemId: 'emp', position: { x: 470, y: 292 }, consumed: false },
    ])
    expect(Object.isFrozen(serviceTrainZone)).toBe(true)
    expect(Object.isFrozen(serviceTrainZone.pickups[0].position)).toBe(true)
  })

  it('backs the heavy-derived elite and both centered patterns with real hit-once attacks', () => {
    const elite = getEliteDefinition('elite-bulwark-frame')
    expect(elite).toMatchObject({
      id: 'elite-bulwark-frame',
      baseBodyId: 'bulwark-frame',
      maxHp: 360,
      radius: 30,
      moveSpeed: 88,
      damageScale: 1,
      targetClass: 'elite',
    })
    expect(elite.patterns).toEqual([
      { id: 'elite-rail-hammer', telegraphMs: 650, activeMs: 150, recoveryMs: 550, range: { x: 88, y: 40 }, damage: 14 },
      { id: 'elite-lane-charge', telegraphMs: 900, activeMs: 220, recoveryMs: 700, range: { x: 180, y: 28 }, damage: 20 },
    ])
    const attacks = new Map(combatAttackCatalog.map((attack) => [attack.id, attack]))
    expect(attacks.get('elite-rail-hammer')).toMatchObject({
      startupMs: 0, activeMs: 150, recoveryMs: 550,
      hitbox: { offsetX: 0, halfWidth: 88, halfDepth: 40 },
      hit: { damage: 14, maxHitsPerTarget: 1 },
    })
    expect(attacks.get('elite-lane-charge')).toMatchObject({
      startupMs: 0, activeMs: 220, recoveryMs: 700,
      hitbox: { offsetX: 0, halfWidth: 180, halfDepth: 28 },
      hit: { damage: 20, maxHitsPerTarget: 1 },
    })
  })
})

type SceneHarness = {
  state: CombatState
  runState: RunState
  currentZone: PlayableStageOneZoneDefinition
  waveRuntime: ZoneWaveRuntime
  waveIndex: number
  zonePhase: 'active' | 'inter-wave' | 'zone-clear' | 'zone-handoff'
  interWaveRemainingMs: number
  transitionRemainingMs: number
  trainHazardState: TrainHazardState
  trainBackdrop: TrainBackdrop | null
  zoneRenderer: ZoneRenderer | null
  itemRuntime: ItemRuntimeState
  eliteBrains: Map<string, EliteBrainState>
  actionQueue: {
    buffer: {
      enqueue(
        edge: { type: 'attack'; limb: 'right-hand' },
        domainTimeMs: number,
      ): unknown
    }
  }
  actorViews: Map<string, { dispose(): void }>
  checkpointStore: {
    save(checkpoint: Readonly<RunCheckpoint>): boolean
    load(): RunCheckpoint | null
  }
  zoneCheckpoint: RunCheckpoint | null
  inputAdapter: { readFrame(): InputFrame } | null
  scene: { start: ReturnType<typeof vi.fn> }
  create(): void
  stepDomain(): void
  applyRunEffects(effects: ReturnType<typeof runReducer>['effects']): void
  createWaveRuntime(index: number): ZoneWaveRuntime
  recordEnemyDefeats(enemyIds: readonly string[]): void
  tryContinue(): void
  dispose(): void
}

const createLiveScene = () => {
  const services = new GameServices()
  services.enterBootScene()
  services.enterScene(SCENE_KEYS.Title)
  services.enterScene(SCENE_KEYS.CharacterSelect)
  services.confirmCharacter('han', 0)
  const scene = new CombatScene(services) as unknown as SceneHarness
  scene.create()
  return { scene, services }
}

const captureOneFrame = (scene: SceneHarness, frame: InputFrame): void => {
  if (!scene.inputAdapter) throw new Error('Expected live input.')
  let pending = frame
  scene.inputAdapter.readFrame = () => {
    const captured = pending
    pending = { moveX: 0, moveY: 0, edges: [] }
    return captured
  }
}

const stepUntil = (
  scene: SceneHarness,
  predicate: () => boolean,
  maxSteps = 1_200,
): void => {
  for (let step = 0; step < maxSteps && !predicate(); step += 1) scene.stepDomain()
  expect(predicate()).toBe(true)
}

const enterServiceTrain = (scene: SceneHarness): void => {
  const result = runReducer(scene.runState, {
    type: 'enter-zone',
    entry: { zoneId: 'service-train', zoneStartWaveId: 'service-train-wave-1' },
  })
  scene.runState = result.state
  scene.applyRunEffects(result.effects)
}

const clearServiceWave = (scene: SceneHarness): void => {
  const authoredCount = serviceTrainZone.waves[scene.waveIndex].orders.length
  stepUntil(scene, () => scene.waveRuntime.wave.emittedOrderIds.length === authoredCount)
  scene.recordEnemyDefeats(scene.waveRuntime.wave.spawnedEnemyIds)
  scene.stepDomain()
}

const crossGateToNextWave = (scene: SceneHarness): void => {
  const nextWaveIndex = scene.waveIndex + 1
  stepUntil(scene, () => scene.interWaveRemainingMs === 0)
  const player = scene.state.actors[scene.state.playerId]
  if (!player || !scene.currentZone.waves[nextWaveIndex]) {
    throw new Error('Expected a player and a next authored wave.')
  }
  player.position.x = scene.currentZone.arena.minX + nextWaveIndex * SIDE_SCROLL_VIEWPORT_WIDTH
  stepUntil(scene, () => scene.waveIndex === nextWaveIndex && scene.zonePhase === 'active')
}

interface HanTimingSample {
  readonly zoneActiveMs: number
  readonly eliteActiveMs: number
  readonly noTargetMs: number
  readonly pickupsAcquired: number
  readonly itemsUsed: number
  readonly handedOff: boolean
}

const measureDeterministicHanRun = (): HanTimingSample => {
  const { scene } = createLiveScene()
  enterServiceTrain(scene)
  let eliteStartedAtMs: number | null = null
  let noTargetMs = 0
  let sawLivingEnemy = false
  let waitingForNextSpawn = false
  let itemsUsed = 0

  for (let step = 0; step < 15_000 && scene.zonePhase !== 'zone-clear'; step += 1) {
    if (scene.runState.status === 'game-over') {
      throw new Error('Deterministic HAN timing run reached Game Over.')
    }
    const player = scene.state.actors.han
    const livingTargets = Object.values(scene.state.actors)
      .filter((actor) => actor.team !== player.team && actor.hp > 0 && actor.mode !== 'defeated')
      .sort((left, right) => {
        const leftDistance = Math.hypot(
          left.position.x - player.position.x,
          left.position.y - player.position.y,
        )
        const rightDistance = Math.hypot(
          right.position.x - player.position.x,
          right.position.y - player.position.y,
        )
        return leftDistance - rightDistance || left.id.localeCompare(right.id)
      })
    const target = livingTargets[0]
    const frozenMs = Math.min(scene.state.hitstopRemainingMs, fixedStepMs)
    const activeDeltaMs = fixedStepMs - frozenMs
    if (target) {
      sawLivingEnemy = true
      waitingForNextSpawn = false
    } else if (sawLivingEnemy && scene.waveIndex < serviceTrainZone.waves.length - 1) {
      waitingForNextSpawn = true
    }
    if (waitingForNextSpawn && !target) {
      noTargetMs += scene.zonePhase === 'inter-wave'
        ? Math.min(activeDeltaMs, scene.interWaveRemainingMs)
        : activeDeltaMs
    }

    if (scene.eliteBrains.size > 0 && eliteStartedAtMs === null) {
      eliteStartedAtMs = scene.state.elapsedMs
    }

    let moveX: -1 | 0 | 1 = 0
    let moveY: -1 | 0 | 1 = 0
    const edges: InputFrame['edges'][number][] = []
    const currentArena = scene.currentZone.arena
    const currentSegmentMinX = currentArena.minX + scene.waveIndex * SIDE_SCROLL_VIEWPORT_WIDTH
    const currentSegmentMaxX = currentArena.maxX + scene.waveIndex * SIDE_SCROLL_VIEWPORT_WIDTH
    const nextPickup = scene.itemRuntime.pickups.find(
      (pickup) =>
        !pickup.consumed &&
        scene.itemRuntime.inventory.counts[pickup.itemId] === 0 &&
        pickup.position.x >= currentSegmentMinX &&
        pickup.position.x <= currentSegmentMaxX,
    )
    if (nextPickup) {
      const deltaX = nextPickup.position.x - player.position.x
      const deltaY = nextPickup.position.y - player.position.y
      if (Math.hypot(deltaX, deltaY) <= 46) {
        edges.push({ type: 'interact-use' })
      } else {
        if (Math.abs(deltaX) > 4) moveX = deltaX < 0 ? -1 : 1
        if (Math.abs(deltaY) > 4) moveY = deltaY < 0 ? -1 : 1
      }
    } else if (
      scene.itemRuntime.inventory.counts['repair-kit'] === 1 &&
      player.hp <= player.maxHp * 0.65
    ) {
      if (scene.itemRuntime.inventory.selectedItemId !== 'repair-kit') {
        edges.push({ type: 'cycle-item' })
      } else {
        edges.push({ type: 'interact-use' })
      }
    } else if (scene.itemRuntime.inventory.counts.emp === 1) {
      if (scene.itemRuntime.inventory.selectedItemId !== 'emp') {
        edges.push({ type: 'cycle-item' })
      } else if (
        target &&
        Math.hypot(
          target.position.x - player.position.x,
          target.position.y - player.position.y,
        ) <= 145
      ) {
        edges.push({ type: 'interact-use' })
      }
    }

    if (!nextPickup && edges.length === 0 && !target && scene.zonePhase === 'inter-wave') {
      moveX = 1
    } else if (!nextPickup && edges.length === 0 && target) {
      const deltaX = target.position.x - player.position.x
      if (Math.abs(deltaX) > 48) moveX = deltaX < 0 ? -1 : 1
      const playerActionable = player.mode === 'idle' || player.mode === 'moving'
      const targetVulnerable =
        target.mode !== 'knocked-down' && target.mode !== 'getting-up'
      if (moveX === 0 && playerActionable && targetVulnerable) {
        scene.actionQueue.buffer.enqueue(
          { type: 'attack', limb: 'right-hand' },
          scene.state.elapsedMs,
        )
      }
    }
    const heldBefore =
      scene.itemRuntime.inventory.counts.emp +
      scene.itemRuntime.inventory.counts['repair-kit']
    const consumedBefore = scene.itemRuntime.pickups.filter((pickup) => pickup.consumed).length
    captureOneFrame(scene, { moveX, moveY, edges })
    scene.stepDomain()
    const heldAfter =
      scene.itemRuntime.inventory.counts.emp +
      scene.itemRuntime.inventory.counts['repair-kit']
    const consumedAfter = scene.itemRuntime.pickups.filter((pickup) => pickup.consumed).length
    itemsUsed += Math.max(0, heldBefore + consumedAfter - consumedBefore - heldAfter)
  }

  expect(scene.zonePhase).toBe('zone-clear')
  const zoneActiveMs = scene.state.elapsedMs
  const eliteActiveMs = eliteStartedAtMs === null ? 0 : zoneActiveMs - eliteStartedAtMs
  const pickupsAcquired = scene.itemRuntime.pickups.filter((pickup) => pickup.consumed).length
  stepUntil(scene, () =>
    scene.currentZone.id === 'flooded-tunnel' && scene.zonePhase === 'active',
  )
  const handedOff =
    scene.runState.zoneId === 'flooded-tunnel' &&
    scene.runState.currentWaveId === 'flooded-tunnel-wave-1'
  scene.dispose()
  return {
    zoneActiveMs,
    eliteActiveMs,
    noTargetMs,
    pickupsAcquired,
    itemsUsed,
    handedOff,
  }
}

describe('CombatScene service-train orchestration', () => {
  it('saves each atomic entry once, runs mixed waves, and enters active Zone 3 without Results', () => {
    const { scene, services } = createLiveScene()
    const save = vi.fn(() => true)
    scene.checkpointStore = { save, load: () => null }

    enterServiceTrain(scene)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      zoneId: 'service-train',
      zoneStartWaveId: 'service-train-wave-1',
    }))
    expect(scene.itemRuntime.pickups).toEqual(serviceTrainZone.pickups)
    expect(scene.trainBackdrop?.snapshot()).toMatchObject({ visiblePickupCount: 2 })

    clearServiceWave(scene)
    expect(scene.zonePhase).toBe('inter-wave')
    crossGateToNextWave(scene)
    clearServiceWave(scene)
    for (let nextWaveIndex = 2; nextWaveIndex < serviceTrainZone.waves.length; nextWaveIndex += 1) {
      crossGateToNextWave(scene)
      clearServiceWave(scene)
    }
    expect(scene.zonePhase).toBe('zone-clear')
    expect(services.result).toBeNull()

    stepUntil(scene, () =>
      scene.currentZone.id === 'flooded-tunnel' && scene.zonePhase === 'active',
    )
    expect(scene.runState).toMatchObject({
      zoneId: 'flooded-tunnel',
      zoneStartWaveId: 'flooded-tunnel-wave-1',
      currentWaveId: 'flooded-tunnel-wave-1',
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      zoneId: 'flooded-tunnel',
      zoneStartWaveId: 'flooded-tunnel-wave-1',
    }))
    const stable = structuredClone(scene.runState)
    for (let step = 0; step < 120; step += 1) scene.stepDomain()
    const { activeTimeMs: activeTimeBefore, ...stableRun } = stable
    const { activeTimeMs: activeTimeAfter, ...currentRun } = scene.runState
    expect(currentRun).toEqual(stableRun)
    expect(activeTimeAfter - activeTimeBefore).toBeCloseTo(120 * fixedStepMs, 8)
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
  })

  it('acquires and uses both authored pickups without continuously resaving the checkpoint', () => {
    const { scene } = createLiveScene()
    const save = vi.fn(() => true)
    scene.checkpointStore = { save, load: () => null }
    enterServiceTrain(scene)
    const savedInventory = structuredClone(scene.zoneCheckpoint?.inventory)

    scene.state.actors.han.position = { x: 176, y: 214, z: 0 }
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'interact-use' }],
    })
    scene.stepDomain()
    expect(scene.itemRuntime.inventory).toEqual({
      counts: { emp: 0, 'repair-kit': 1 },
      selectedItemId: 'repair-kit',
    })
    expect(scene.itemRuntime.pickups[0].consumed).toBe(true)
    expect(scene.trainBackdrop?.snapshot().visiblePickupCount).toBe(1)

    const pickupAnimationEndsAfterMs = scene.state.elapsedMs + 400
    stepUntil(scene, () => scene.state.elapsedMs >= pickupAnimationEndsAfterMs, 60)

    scene.state.actors.han.hp = 50
    scene.runState = { ...scene.runState, hp: 50 }
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'interact-use' }],
    })
    scene.stepDomain()
    expect(scene.state.actors.han.hp).toBe(95)
    expect(scene.itemRuntime.inventory.counts['repair-kit']).toBe(0)

    const repairAnimationEndsAfterMs = scene.state.elapsedMs + 400
    stepUntil(scene, () => scene.state.elapsedMs >= repairAnimationEndsAfterMs, 60)

    scene.state.actors.han.position = { x: 470, y: 292, z: 0 }
    scene.state.actors.han.mode = 'idle'
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'interact-use' }],
    })
    scene.stepDomain()
    expect(scene.itemRuntime.inventory).toEqual({
      counts: { emp: 1, 'repair-kit': 0 },
      selectedItemId: 'emp',
    })
    expect(scene.itemRuntime.pickups[1].consumed).toBe(true)

    const empPickupAnimationEndsAfterMs = scene.state.elapsedMs + 400
    stepUntil(scene, () => scene.state.elapsedMs >= empPickupAnimationEndsAfterMs, 60)

    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    const enemy = scene.state.actors[enemyId]
    enemy.position = { x: 520, y: 292, z: 0 }
    enemy.mode = 'attacking'
    enemy.activeAttack = {
      attackId: 'han-right-hand',
      elapsedMs: 100,
      phase: 'active',
      hitRecords: {},
    }
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'interact-use' }],
    })
    scene.stepDomain()
    expect(scene.itemRuntime.empRemainingMsByTargetId[enemyId]).toBe(2_000)
    expect(scene.state.actors[enemyId].activeAttack).toBeNull()
    expect(scene.itemRuntime.inventory.counts.emp).toBe(0)
    expect(scene.zoneCheckpoint?.inventory).toEqual(savedInventory)
    expect(save).toHaveBeenCalledOnce()
  })

  it('advances train rules only by the partial hitstop remainder and warns before opening', () => {
    const { scene } = createLiveScene()
    enterServiceTrain(scene)
    scene.trainHazardState = {
      elapsedMs: 2_990,
      platformCenterX: 278.56,
      retriggerImmunityRemainingMs: 0,
    }
    scene.state.actors.han.position = { x: 112, y: 236, z: 0 }
    scene.state.hitstopRemainingMs = fixedStepMs / 2
    const waveElapsedBefore = scene.waveRuntime.wave.elapsedMs

    scene.stepDomain()

    expect(scene.trainHazardState.elapsedMs).toBeCloseTo(2_990 + fixedStepMs / 2, 8)
    expect(scene.waveRuntime.wave.elapsedMs).toBeCloseTo(
      waveElapsedBefore + fixedStepMs / 2,
      8,
    )
    expect(getTrainHazardPhase(scene.trainHazardState)).toBe('safe')

    scene.stepDomain()
    expect(getTrainHazardPhase(scene.trainHazardState)).toBe('warning')
    expect(scene.trainBackdrop?.snapshot().warningVisible).toBe(true)

    scene.itemRuntime = createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 1 }, selectedItemId: 'emp' },
      pickups: scene.itemRuntime.pickups,
    })
    scene.state.hitstopRemainingMs = fixedStepMs
    const frozenHazard = structuredClone(scene.trainHazardState)
    const frozenWaveElapsed = scene.waveRuntime.wave.elapsedMs
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'cycle-item' }],
    })
    scene.stepDomain()
    expect(scene.trainHazardState).toEqual(frozenHazard)
    expect(scene.waveRuntime.wave.elapsedMs).toBe(frozenWaveElapsed)
    expect(scene.itemRuntime.inventory.selectedItemId).toBe('repair-kit')
  })

  it('shows warning/open state and routes one fall through Q-before-discarded-E combat', () => {
    const { scene } = createLiveScene()
    enterServiceTrain(scene)
    scene.itemRuntime = createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 1 }, selectedItemId: 'emp' },
      pickups: scene.itemRuntime.pickups,
    })
    scene.trainHazardState = {
      elapsedMs: 4_000,
      platformCenterX: 334,
      retriggerImmunityRemainingMs: 0,
    }
    scene.state.actors.han.position = { x: 394, y: 280, z: 0 }
    captureOneFrame(scene, {
      moveX: 0,
      moveY: 0,
      edges: [{ type: 'cycle-item' }, { type: 'interact-use' }],
    })

    scene.stepDomain()

    expect(scene.state.actors.han).toMatchObject({
      hp: 82,
      position: { x: 394, y: 236, z: 0 },
      mode: 'knocked-down',
      activeAttack: null,
    })
    expect(scene.runState.hp).toBe(82)
    expect(scene.itemRuntime.inventory).toEqual({
      counts: { emp: 1, 'repair-kit': 1 },
      selectedItemId: 'repair-kit',
    })
    expect(scene.trainBackdrop?.snapshot()).toMatchObject({ warningVisible: true })
  })

  it('retains first-life world state but Continue reconstructs authored Zone 2 start', () => {
    const { scene } = createLiveScene()
    enterServiceTrain(scene)
    scene.waveIndex = 4
    scene.waveRuntime = scene.createWaveRuntime(4)
    scene.runState = { ...scene.runState, currentWaveId: 'service-train-wave-5' }
    scene.stepDomain()
    const eliteId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.state.actors[eliteId].hp = 137
    scene.eliteBrains.set(eliteId, createEliteBrainState('B'))
    const backdrop = scene.trainBackdrop
    if (!backdrop) throw new Error('Expected train backdrop.')
    scene.trainHazardState = {
      elapsedMs: 1_234,
      platformCenterX: 347.104,
      retriggerImmunityRemainingMs: 900,
    }
    backdrop.update(321, 'safe', 347.104, scene.itemRuntime.pickups)
    scene.itemRuntime = createItemRuntimeState({
      inventory: { counts: { emp: 0, 'repair-kit': 1 }, selectedItemId: 'repair-kit' },
      pickups: scene.itemRuntime.pickups.map((pickup) => ({ ...pickup, consumed: true })),
      empRemainingMsByTargetId: { stale: 700 },
    })
    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.runState = { ...scene.runState, hp: 0, lives: 2 }

    scene.stepDomain()

    expect(scene.runState.lives).toBe(1)
    expect(scene.trainHazardState.elapsedMs).toBeGreaterThan(1_234)
    expect(scene.runState.currentWaveId).toBe('service-train-wave-5')
    expect(scene.state.actors[eliteId].hp).toBe(137)
    expect(scene.eliteBrains.get(eliteId)?.cursor).toBe('B')
    expect(scene.itemRuntime.pickups.every((pickup) => pickup.consumed)).toBe(true)
    expect(scene.itemRuntime.empRemainingMsByTargetId).toEqual({})
    expect(scene.trainBackdrop).toBe(backdrop)
    expect(backdrop.snapshot().offset).not.toBe(0)

    scene.zoneCheckpoint = {
      schemaVersion: 2,
      characterId: 'han',
      zoneId: 'service-train',
      zoneStartWaveId: 'service-train-wave-1',
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
    }
    scene.runState = {
      ...scene.runState,
      currentWaveId: 'service-train-wave-5',
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
    }
    scene.tryContinue()

    expect(scene.runState).toMatchObject({
      currentWaveId: 'service-train-wave-1',
      continueUsed: true,
      status: 'playing',
    })
    expect(scene.trainHazardState).toEqual({
      elapsedMs: 0,
      platformCenterX: 278,
      retriggerImmunityRemainingMs: 0,
    })
    expect(scene.itemRuntime.pickups).toEqual(serviceTrainZone.pickups)
    expect(scene.itemRuntime.inventory).toEqual(scene.zoneCheckpoint.inventory)
    expect(scene.waveIndex).toBe(0)
    expect(scene.eliteBrains.size).toBe(0)
    expect(scene.state.actors[eliteId]).toBeUndefined()
    expect(scene.trainBackdrop).toBe(backdrop)
    expect(backdrop.snapshot()).toMatchObject({ offset: 0, visiblePickupCount: 2 })
  })

  it('alternates accepted elite patterns, preserves B across EMP, and hits once before defeat', () => {
    const { scene } = createLiveScene()
    enterServiceTrain(scene)
    scene.waveIndex = 4
    scene.waveRuntime = scene.createWaveRuntime(4)
    scene.runState = { ...scene.runState, currentWaveId: 'service-train-wave-5' }
    scene.stepDomain()
    const eliteId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    const elite = scene.state.actors[eliteId]
    const eliteSectionOffset = 4 * SIDE_SCROLL_VIEWPORT_WIDTH
    scene.state.actors.han.position = { x: 450 + eliteSectionOffset, y: 270, z: 0 }
    elite.position = { x: 500 + eliteSectionOffset, y: 270, z: 0 }

    scene.stepDomain()
    expect(scene.eliteBrains.get(eliteId)).toMatchObject({
      mode: 'telegraph', cursor: 'A', attackId: 'elite-rail-hammer',
    })

    for (let step = 0; step < 38; step += 1) scene.stepDomain()
    scene.state.actors.han.position = { x: 350 + eliteSectionOffset, y: 270, z: 0 }
    stepUntil(scene, () => scene.state.events.some(
      (event) => event.type === 'attack-started' && event.attackId === 'elite-rail-hammer',
    ), 4)
    expect(scene.eliteBrains.get(eliteId)).toMatchObject({
      mode: 'await-completion', cursor: 'B',
    })

    scene.itemRuntime = createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
      pickups: scene.itemRuntime.pickups,
    })
    scene.state.actors.han.position = { x: elite.position.x - 80, y: elite.position.y, z: 0 }
    captureOneFrame(scene, { moveX: 0, moveY: 0, edges: [{ type: 'interact-use' }] })
    scene.stepDomain()
    expect(scene.itemRuntime.empRemainingMsByTargetId[eliteId]).toBe(1_300)
    expect(scene.state.actors[eliteId].activeAttack).toBeNull()
    expect(scene.eliteBrains.get(eliteId)).toMatchObject({ mode: 'chase', cursor: 'B' })

    stepUntil(scene, () => scene.eliteBrains.get(eliteId)?.mode === 'telegraph', 120)
    expect(scene.eliteBrains.get(eliteId)).toMatchObject({
      cursor: 'B', attackId: 'elite-lane-charge',
    })

    const hpBeforeLaneCharge = scene.state.actors.han.hp
    stepUntil(scene, () => scene.state.events.some(
      (event) => event.type === 'attack-started' && event.attackId === 'elite-lane-charge',
    ), 70)
    expect(scene.eliteBrains.get(eliteId)).toMatchObject({
      mode: 'await-completion', cursor: 'A',
    })
    expect(scene.state.actors.han.hp).toBe(hpBeforeLaneCharge - 20)
    expect(scene.state.actors[eliteId].activeAttack?.hitRecords.han?.count).toBe(1)

    for (let step = 0; step < 20; step += 1) scene.stepDomain()
    expect(scene.state.actors.han.hp).toBe(hpBeforeLaneCharge - 20)

    scene.recordEnemyDefeats([eliteId])
    scene.stepDomain()
    expect(scene.zonePhase).toBe('zone-clear')
  })

  it('routes debug clear through the same card/entry and disposes each active renderer once', () => {
    const { scene, services } = createLiveScene()
    const depotRenderer = scene.zoneRenderer
    if (!depotRenderer) throw new Error('Expected depot renderer.')
    const depotDispose = vi.spyOn(depotRenderer, 'dispose')

    scene.stepDomain()
    const departingDepotEnemyIds = Object.values(scene.state.actors)
      .filter((actor) => actor.id !== scene.state.playerId)
      .map((actor) => actor.id)
    expect(departingDepotEnemyIds.length).toBeGreaterThan(0)

    services.requestDebugClear()
    scene.stepDomain()
    expect(scene.zonePhase).toBe('zone-clear')
    stepUntil(scene, () => scene.currentZone.id === 'service-train')
    expect(departingDepotEnemyIds.every((enemyId) => scene.state.actors[enemyId] === undefined))
      .toBe(true)
    expect(depotDispose).toHaveBeenCalledOnce()
    const train = scene.trainBackdrop
    if (!train) throw new Error('Expected train renderer.')
    const trainDispose = vi.spyOn(train, 'dispose')
    train.reset(scene.itemRuntime.pickups)
    train.update(3_200, 'safe', 278, scene.itemRuntime.pickups)
    expect(train.snapshot().offset).toBeCloseTo(0, 6)
    train.reset(scene.itemRuntime.pickups)
    const stableObjectCount = train.snapshot().ownedObjectCount
    for (let step = 0; step < 60; step += 1) scene.stepDomain()
    expect(train.snapshot().ownedObjectCount).toBe(stableObjectCount)

    services.requestDebugClear()
    scene.stepDomain()
    expect(scene.zonePhase).toBe('zone-clear')
    stepUntil(scene, () =>
      scene.currentZone.id === 'flooded-tunnel' && scene.zonePhase === 'active',
    )
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
    expect(trainDispose).toHaveBeenCalledOnce()

    scene.dispose()
    scene.dispose()
    expect(trainDispose).toHaveBeenCalledOnce()
  })

  it('produces reproducible deterministic lower-bound diagnostics without claiming human pacing', () => {
    const samples = [
      measureDeterministicHanRun(),
      measureDeterministicHanRun(),
      measureDeterministicHanRun(),
    ]
    expect(samples[1]).toEqual(samples[0])
    expect(samples[2]).toEqual(samples[0])
    expect(samples[0].noTargetMs).toBeLessThanOrEqual(3_700 + 1e-6)
    expect(samples[0].noTargetMs).toBeCloseTo(3_666.6666666667, 6)
    expect(samples[0].zoneActiveMs).toBeGreaterThan(0)
    expect(samples[0].eliteActiveMs).toBeGreaterThan(0)
    expect(samples[0].pickupsAcquired).toBe(5)
    expect(samples[0].itemsUsed).toBeGreaterThanOrEqual(1)
    expect(samples[0].handedOff).toBe(true)
  })
})
