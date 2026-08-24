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
    setFillStyle(_color: number, _alpha?: number): this { return this }
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

import { GameServices, SCENE_KEYS } from '../../src/app/GameServices'
import { combatAttackCatalog } from '../../src/content/attacks'
import { getBossDefinition } from '../../src/content/bosses'
import { EMP_BASE_DURATION_MS, EMP_DURATION_SCALE } from '../../src/content/items'
import {
  floodedTunnelZone,
  getPlayableStageOneZone,
} from '../../src/content/stage1'
import type { CombatState } from '../../src/domain/combat/combatReducer'
import { fixedStepMs } from '../../src/domain/combat/tuning'
import { createBossBrainState, type BossBrainState } from '../../src/domain/enemies/bossBrain'
import {
  createItemRuntimeState,
  itemReducer,
  type ItemRuntimeState,
} from '../../src/domain/items/itemReducer'
import { runReducer, type RunCheckpoint, type RunState } from '../../src/domain/run/runReducer'
import {
  createTunnelHazardState,
  type TunnelHazardState,
} from '../../src/domain/world/tunnelHazard'
import type { ZoneWaveRuntime } from '../../src/domain/waves/waveDirector'
import { CombatScene } from '../../src/phaser/scenes/CombatScene'
import { TunnelBackdrop } from '../../src/phaser/world/TunnelBackdrop'

describe('flooded-tunnel authored finale contracts', () => {
  it('freezes the mixed wave, final boss, timing, arena, and nullable ending', () => {
    expect(getPlayableStageOneZone('flooded-tunnel')).toBe(floodedTunnelZone)
    expect(floodedTunnelZone).toMatchObject({
      id: 'flooded-tunnel',
      arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
      playerStart: { x: 112, y: 224, z: 0 },
      interWaveDelayMs: 900,
      enemyDamageScale: 0.25,
      bossDamageScale: 1,
      transitionDurationMs: 1_500,
      targetDurationMs: 240_000,
      acceptanceDurationMs: { min: 210_000, max: 270_000 },
      nextZoneEntry: null,
    })
    expect(floodedTunnelZone.waves).toEqual([
      {
        id: 'flooded-tunnel-wave-1', seed: 0x7d081a47,
        orders: [
          { id: 'tunnel-striker', enemyVariantId: 'scout-striker', delayMs: 0, position: { x: 452, y: 214 } },
          { id: 'tunnel-patrol', enemyVariantId: 'scout-patrol', delayMs: 650, position: { x: 516, y: 286 } },
          { id: 'tunnel-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 1_300, position: { x: 558, y: 248 } },
        ],
      },
      {
        id: 'flooded-tunnel-wave-2', seed: 0x8e192b58,
        orders: [
          { id: 'final-boss', enemyVariantId: 'boss-silo-dredger', delayMs: 0, position: { x: 500, y: 264 } },
        ],
      },
    ])
    expect(Object.isFrozen(floodedTunnelZone)).toBe(true)
    expect(Object.isFrozen(floodedTunnelZone.waves[1].orders[0].position)).toBe(true)
  })

  it('authors one 960 HP boss, exactly two reducer attacks, and the existing 700ms EMP scale', () => {
    const boss = getBossDefinition('boss-silo-dredger')
    expect(boss).toMatchObject({
      id: 'boss-silo-dredger', baseBodyId: 'bulwark-frame', maxHp: 960,
      damageScale: 1, targetClass: 'boss',
    })
    expect(boss.patterns.map((pattern) => pattern.id)).toEqual([
      'boss-dredger-slam', 'boss-floodline-charge',
    ])
    const attacks = new Map(combatAttackCatalog.map((attack) => [attack.id, attack]))
    expect(attacks.get('boss-dredger-slam')).toMatchObject({
      startupMs: 0, activeMs: 160, recoveryMs: 620,
      hitbox: { halfWidth: 96, halfDepth: 46 },
      hit: { damage: 26, maxHitsPerTarget: 1 },
    })
    expect(attacks.get('boss-floodline-charge')).toMatchObject({
      startupMs: 0, activeMs: 260, recoveryMs: 800,
      hitbox: { halfWidth: 190, halfDepth: 26 },
      hit: { damage: 34, maxHitsPerTarget: 1 },
    })
    expect(EMP_BASE_DURATION_MS * EMP_DURATION_SCALE.boss).toBe(700)

    const result = itemReducer(createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
    }), {
      type: 'interact-use',
      player: { position: { x: 300, y: 220 }, hp: 100, maxHp: 100, living: true },
      targets: [{
        id: 'boss', position: { x: 400, y: 220 }, living: true, targetClass: 'boss',
      }],
    })
    expect(result.effects).toContainEqual({
      type: 'emp-applied', targets: [{ targetId: 'boss', durationMs: 700 }],
    })
  })
})

type SceneHarness = {
  state: CombatState
  runState: RunState
  currentZone: typeof floodedTunnelZone
  waveRuntime: ZoneWaveRuntime
  waveIndex: number
  zonePhase: 'active' | 'inter-wave' | 'zone-clear' | 'zone-handoff'
  transitionRemainingMs: number
  itemRuntime: ItemRuntimeState
  bossBrains: Map<string, BossBrainState>
  tunnelHazardState: TunnelHazardState
  tunnelBackdrop: TunnelBackdrop | null
  checkpointStore: {
    save(checkpoint: Readonly<RunCheckpoint>): boolean
    load(): RunCheckpoint | null
  }
  zoneCheckpoint: RunCheckpoint | null
  scene: { start: ReturnType<typeof vi.fn> }
  create(): void
  stepDomain(): void
  applyRunEffects(effects: ReturnType<typeof runReducer>['effects']): void
  recordEnemyDefeats(enemyIds: readonly string[]): void
  advanceZoneClock(deltaMs: number): void
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

const stepUntil = (
  scene: SceneHarness,
  predicate: () => boolean,
  maxSteps = 2_000,
): void => {
  for (let step = 0; step < maxSteps && !predicate(); step += 1) scene.stepDomain()
  expect(predicate()).toBe(true)
}

const enterFloodedTunnel = (
  scene: SceneHarness,
  inventory = { counts: { emp: 1 as const, 'repair-kit': 0 as const }, selectedItemId: 'emp' as const },
): void => {
  scene.itemRuntime = createItemRuntimeState({ inventory })
  const result = runReducer(scene.runState, {
    type: 'enter-zone',
    entry: { zoneId: 'flooded-tunnel', zoneStartWaveId: 'flooded-tunnel-wave-1' },
  })
  scene.runState = result.state
  scene.applyRunEffects(result.effects)
}

const clearCurrentWave = (scene: SceneHarness): void => {
  const orderCount = floodedTunnelZone.waves[scene.waveIndex].orders.length
  stepUntil(scene, () => scene.waveRuntime.wave.emittedOrderIds.length === orderCount)
  scene.recordEnemyDefeats(scene.waveRuntime.wave.spawnedEnemyIds)
  scene.stepDomain()
}

const enterBossWave = (scene: SceneHarness): string => {
  clearCurrentWave(scene)
  expect(scene.zonePhase).toBe('inter-wave')
  stepUntil(scene, () => scene.waveIndex === 1 && scene.zonePhase === 'active')
  stepUntil(scene, () => scene.waveRuntime.wave.spawnedEnemyIds.length === 1)
  return scene.waveRuntime.wave.spawnedEnemyIds[0]
}

describe('CombatScene flooded-tunnel orchestration', () => {
  it('enters once with a stable checkpoint and a resettable presentation-only backdrop', () => {
    const { scene, services } = createLiveScene()
    const save = vi.fn(() => true)
    scene.checkpointStore = { save, load: () => null }

    enterFloodedTunnel(scene)

    expect(scene.currentZone).toBe(floodedTunnelZone)
    expect(scene.zonePhase).toBe('active')
    expect(scene.runState).toMatchObject({
      zoneId: 'flooded-tunnel',
      zoneStartWaveId: 'flooded-tunnel-wave-1',
      currentWaveId: 'flooded-tunnel-wave-1',
    })
    expect(save).toHaveBeenCalledOnce()
    expect(scene.zoneCheckpoint).toMatchObject({
      zoneId: 'flooded-tunnel',
      zoneStartWaveId: 'flooded-tunnel-wave-1',
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
    })
    expect(scene.tunnelBackdrop?.snapshot()).toMatchObject({
      elapsedMs: 0, puddlePhase: 'safe', trainPhase: 'idle', safeLaneVisible: true,
    })
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
  })

  it('preserves the boss/hazard/backdrop on first-life respawn but Continue rebuilds Zone 3', () => {
    const { scene } = createLiveScene()
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    const boss = scene.state.actors[bossId]
    boss.hp = 300
    boss.position = { x: 500, y: 264, z: 0 }
    scene.bossBrains.set(bossId, createBossBrainState({ phase: 3, cursor: 'B' }))
    scene.tunnelHazardState = {
      elapsedMs: 4_500,
      puddleHitPlayer: true,
      trainHitTargetIds: [bossId],
    }
    scene.tunnelBackdrop?.update(4_500, 'live', 'idle')
    scene.itemRuntime = createItemRuntimeState({
      inventory: scene.itemRuntime.inventory,
      empRemainingMsByTargetId: { [bossId]: 500 },
    })
    const backdropBefore = scene.tunnelBackdrop?.snapshot().elapsedMs ?? 0

    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.runState = { ...scene.runState, hp: 0, lives: 2 }
    scene.stepDomain()

    expect(scene.runState).toMatchObject({ lives: 1, status: 'playing' })
    expect(scene.state.actors[bossId]).toMatchObject({ hp: 300 })
    expect(scene.bossBrains.get(bossId)).toMatchObject({ phase: 3, cursor: 'B', mode: 'chase' })
    expect(scene.tunnelHazardState.elapsedMs).toBeCloseTo(4_500 + fixedStepMs, 6)
    expect(scene.tunnelHazardState.puddleHitPlayer).toBe(true)
    expect(scene.tunnelHazardState.trainHitTargetIds).toEqual([bossId])
    expect(scene.tunnelBackdrop?.snapshot().elapsedMs).toBeGreaterThan(backdropBefore)
    expect(scene.itemRuntime.empRemainingMsByTargetId).toEqual({})

    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.runState = { ...scene.runState, hp: 0, lives: 1 }
    scene.stepDomain()
    expect(scene.runState.status).toBe('game-over')
    scene.tryContinue()

    expect(scene.runState).toMatchObject({
      lives: 2,
      continueUsed: true,
      rankCap: 'C',
      status: 'playing',
      currentWaveId: 'flooded-tunnel-wave-1',
    })
    expect(scene.waveIndex).toBe(0)
    expect(scene.state.actors[bossId]).toBeUndefined()
    expect(scene.bossBrains.size).toBe(0)
    expect(scene.tunnelHazardState).toEqual(createTunnelHazardState())
    expect(scene.tunnelBackdrop?.snapshot()).toMatchObject({
      elapsedMs: 0, puddlePhase: 'safe', trainPhase: 'idle',
    })
    expect(scene.itemRuntime.inventory).toEqual(scene.zoneCheckpoint?.inventory)
    expect(scene.itemRuntime.empRemainingMsByTargetId).toEqual({})
    expect(scene.state.combo.hitCount).toBe(0)
  })

  it('lets the reducer-owned train kill the boss, clear its wave, and route Results once after 1500ms', () => {
    const { scene, services } = createLiveScene()
    const completeCombat = vi.spyOn(services, 'completeCombat')
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    scene.state.actors.han.position = { x: 300, y: 264, z: 0 }
    scene.state.actors[bossId].position = { x: 500, y: 220, z: 0 }
    scene.state.actors[bossId].hp = 60
    scene.tunnelHazardState = {
      elapsedMs: 12_500,
      puddleHitPlayer: false,
      trainHitTargetIds: [],
    }

    scene.stepDomain()

    expect(scene.state.events).toContainEqual({
      type: 'actor-defeated',
      atMs: expect.any(Number),
      actorId: bossId,
      attackerId: 'environment',
      attackId: 'environmental-impact',
      strength: 3,
    })
    expect(scene.state.actors[bossId]).toBeUndefined()
    expect(scene.zonePhase).toBe('zone-clear')
    expect(scene.transitionRemainingMs).toBe(1_500)
    expect(completeCombat).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalled()

    scene.advanceZoneClock(1_499)
    expect(completeCombat).not.toHaveBeenCalled()
    scene.advanceZoneClock(1)
    expect(completeCombat).toHaveBeenCalledOnce()
    expect(completeCombat).toHaveBeenCalledWith('enemy-defeated')
    expect(scene.scene.start).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Results)
    scene.stepDomain()
    scene.advanceZoneClock(2_000)
    expect(completeCombat).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledOnce()
  })

  it('keeps terminal Game Over above a same-tick final-boss defeat', () => {
    const { scene, services } = createLiveScene()
    const completeCombat = vi.spyOn(services, 'completeCombat')
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.state.actors[bossId].hp = 0
    scene.state.actors[bossId].mode = 'defeated'
    scene.runState = { ...scene.runState, hp: 0, lives: 1 }

    scene.stepDomain()

    expect(scene.runState).toMatchObject({
      lives: 0, status: 'game-over', continueAvailable: true,
    })
    expect(scene.zonePhase).toBe('active')
    expect(completeCombat).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
  })
})

describe('TunnelBackdrop ownership', () => {
  it('updates, resets, snapshots, and disposes deterministically without combat input', () => {
    const { scene } = createLiveScene()
    const backdrop = new TunnelBackdrop(scene as never)
    const owned = backdrop.snapshot().ownedObjectCount
    expect(owned).toBeGreaterThan(0)
    backdrop.update(500, 'live', 'warning')
    expect(backdrop.snapshot()).toMatchObject({
      elapsedMs: 500,
      puddleLiveVisible: true,
      trainWarningVisible: true,
    })
    backdrop.reset()
    expect(backdrop.snapshot()).toMatchObject({
      elapsedMs: 0,
      puddlePhase: 'safe',
      trainPhase: 'idle',
      puddleLiveVisible: false,
      trainWarningVisible: false,
    })
    backdrop.dispose()
    backdrop.dispose()
    expect(backdrop.snapshot().ownedObjectCount).toBe(0)
  })
})
