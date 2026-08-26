import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => {
  class DisplayObject {
    visible = true
    x = 0
    y = 0
    add(_children: unknown): this { return this }
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
    setRotation(_value: number): this { return this }
    setScale(_value: number): this { return this }
    setScrollFactor(_value: number): this { return this }
    setStrokeStyle(_width: number, _color: number, _alpha?: number): this { return this }
    setText(_value: string): this { return this }
    setTint(_value: number): this { return this }
    setTintFill(_value: number): this { return this }
    setVisible(value: boolean): this { this.visible = value; return this }
    clearTint(): this { return this }
    destroy(_fromScene?: boolean): void {}
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
      container: () => new DisplayObject(),
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
import type {
  CombatActor,
  CombatCommand,
  CombatState,
} from '../../src/domain/combat/combatReducer'
import type { BossAttackPlan } from '../../src/domain/combat/bossAttackDirector'
import { fixedStepMs } from '../../src/domain/combat/tuning'
import { SIDE_SCROLL_VIEWPORT_WIDTH } from '../../src/domain/world/sideScroll'
import { createBossBrainState, type BossBrainState } from '../../src/domain/enemies/bossBrain'
import {
  createItemRuntimeState,
  itemReducer,
  type ItemRuntimeState,
} from '../../src/domain/items/itemReducer'
import { runReducer, type RunCheckpoint, type RunState } from '../../src/domain/run/runReducer'
import {
  createTunnelHazardState,
  TUNNEL_TRAIN_RECT,
  type TunnelHazardState,
} from '../../src/domain/world/tunnelHazard'
import type { ZoneWaveRuntime } from '../../src/domain/waves/waveDirector'
import type { KeyboardInputAdapter } from '../../src/phaser/input/KeyboardInputAdapter'
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
      enemyDamageScale: 0.35,
      bossDamageScale: 1,
      transitionDurationMs: 1_500,
      targetDurationMs: 480_000,
      acceptanceDurationMs: { min: 420_000, max: 600_000 },
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
          { id: 'tunnel-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 0, position: { x: 490, y: 302 } },
          { id: 'tunnel-upper-striker', enemyVariantId: 'scout-striker', delayMs: 650, position: { x: 575, y: 205 } },
          { id: 'tunnel-lower-patrol', enemyVariantId: 'scout-patrol', delayMs: 1_300, position: { x: 520, y: 300 } },
        ],
      },
      {
        id: 'flooded-tunnel-wave-3', seed: 0x9f2a3c69,
        orders: [
          { id: 'tunnel-rear-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 0, position: { x: 570, y: 250 } },
          { id: 'tunnel-rear-striker', enemyVariantId: 'scout-striker', delayMs: 650, position: { x: 500, y: 214 } },
          { id: 'tunnel-final-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 1_300, position: { x: 548, y: 292 } },
          { id: 'tunnel-final-patrol', enemyVariantId: 'scout-patrol', delayMs: 1_950, position: { x: 470, y: 236 } },
        ],
      },
      {
        id: 'flooded-tunnel-wave-4', seed: 0xaf3b4d7a,
        orders: [
          { id: 'final-boss', enemyVariantId: 'boss-silo-dredger', delayMs: 0, position: { x: 500, y: 264 } },
        ],
      },
    ])
    expect(Object.isFrozen(floodedTunnelZone)).toBe(true)
    expect(Object.isFrozen(floodedTunnelZone.waves[3].orders[0].position)).toBe(true)
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
  interWaveRemainingMs: number
  transitionRemainingMs: number
  itemRuntime: ItemRuntimeState
  itemTargetClasses: Map<string, 'normal' | 'elite' | 'boss'>
  bossBrains: Map<string, BossBrainState>
  bossRangedCooldownMs: Map<string, number>
  bossRangedVolleyCount: Map<string, number>
  pendingBossRangedAttacks: Map<string, {
    plan: BossAttackPlan
    remainingTelegraphMs: number
  }>
  bossRangedFiringThisStep: Set<string>
  bossProjectileView: {
    advance(deltaMs: number, target: unknown): Array<{
      sourceId: string
      pattern: 'straight-projectile' | 'three-way-spread' | 'ground-shockwave'
      damage: number
      hitstunMs: number
    }>
    spawn(sourceId: string, plan: Readonly<BossAttackPlan>): void
  } | null
  tunnelHazardState: TunnelHazardState
  tunnelBackdrop: TunnelBackdrop | null
  hazardView: { snapshot(): { telegraphCount: number } } | null
  inputAdapter: KeyboardInputAdapter | null
  game: { canvas: HTMLCanvasElement }
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
  advanceBossRangedAttacks(
    deltaMs: number,
    player: Readonly<CombatActor>,
  ): CombatCommand[]
  buildBossCommands(deltaMs?: number, pauseEnteringEnemies?: boolean): CombatCommand[]
  advanceZoneClock(deltaMs: number): void
  debugClearCurrentZone(): void
  onDebugKeyDown(event: KeyboardEvent): void
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

const dispatchKeyDown = (scene: SceneHarness, code: string): void => {
  if (!scene.inputAdapter) throw new Error('Expected the live KeyboardInputAdapter.')
  const event = new Event('keydown', { cancelable: true })
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: false },
  })
  scene.game.canvas.ownerDocument.dispatchEvent(event)
}

const keyboardEvent = (code: string, repeat = false) => ({
  code,
  repeat,
  preventDefault: vi.fn(),
}) as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }

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

const enterBossWave = (scene: SceneHarness): string => {
  while (scene.currentZone.waves[scene.waveIndex]?.id !== 'flooded-tunnel-wave-4') {
    clearCurrentWave(scene)
    expect(scene.zonePhase).toBe('inter-wave')
    crossGateToNextWave(scene)
  }
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
    expect(services.completedRun).toBeNull()
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
    const completeRun = vi.spyOn(services, 'completeRun')
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    const bossSectionOffset = 3 * SIDE_SCROLL_VIEWPORT_WIDTH
    scene.state.actors.han.position = { x: 300 + bossSectionOffset, y: 264, z: 0 }
    scene.state.actors[bossId].position = { x: 500 + bossSectionOffset, y: 220, z: 0 }
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
    expect(scene.itemTargetClasses.has(bossId)).toBe(false)
    expect(scene.runState.score).toBe(5_000)
    expect(scene.zonePhase).toBe('zone-clear')
    expect(scene.transitionRemainingMs).toBe(1_500)
    expect(completeRun).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalled()

    scene.advanceZoneClock(1_499)
    expect(completeRun).not.toHaveBeenCalled()
    scene.advanceZoneClock(1)
    expect(completeRun).toHaveBeenCalledOnce()
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'mission-clear',
      characterId: 'han',
      score: 5_000,
      maxCombo: 0,
      hitsTaken: 0,
      continueUsed: false,
    }))
    expect(services.completedRun).toEqual(expect.objectContaining({
      outcome: 'mission-clear', score: 5_000,
    }))
    expect(scene.scene.start).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Results)
    scene.stepDomain()
    scene.advanceZoneClock(2_000)
    expect(completeRun).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledOnce()
  })

  it('marks a debug clear for the whole run and completes one D result', () => {
    const { scene, services } = createLiveScene()
    const completeRun = vi.spyOn(services, 'completeRun')
    enterFloodedTunnel(scene)

    scene.debugClearCurrentZone()
    expect(scene.runState.debugClearUsed).toBe(true)
    expect(scene.zonePhase).toBe('zone-clear')

    scene.advanceZoneClock(floodedTunnelZone.transitionDurationMs)
    expect(completeRun).toHaveBeenCalledOnce()
    expect(services.completedRun).toEqual(expect.objectContaining({
      outcome: 'debug-clear',
      characterId: 'han',
      rank: 'D',
    }))
    scene.advanceZoneClock(floodedTunnelZone.transitionDurationMs)
    expect(completeRun).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledOnce()
  })

  it('keeps terminal Game Over above simultaneous train defeats and Continue rebuilds without Results', () => {
    const { scene, services } = createLiveScene()
    const completeRun = vi.spyOn(services, 'completeRun')
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    const player = scene.state.actors.han
    const boss = scene.state.actors[bossId]
    const bossSectionOffset = 3 * SIDE_SCROLL_VIEWPORT_WIDTH
    player.position = { x: 300 + bossSectionOffset, y: 220, z: 0 }
    player.hp = 24
    player.mode = 'idle'
    boss.position = { x: 400 + bossSectionOffset, y: 220, z: 0 }
    boss.hp = 60
    boss.mode = 'idle'
    scene.runState = { ...scene.runState, hp: 24, lives: 1 }
    scene.tunnelHazardState = {
      elapsedMs: 12_500,
      puddleHitPlayer: false,
      trainHitTargetIds: [],
    }

    expect(player.position.z).toBe(0)
    expect(boss.position.z).toBe(0)
    expect(player.position.y).toBeGreaterThanOrEqual(TUNNEL_TRAIN_RECT.minY)
    expect(player.position.y).toBeLessThanOrEqual(TUNNEL_TRAIN_RECT.maxY)
    expect(boss.position.y).toBeGreaterThanOrEqual(TUNNEL_TRAIN_RECT.minY)
    expect(boss.position.y).toBeLessThanOrEqual(TUNNEL_TRAIN_RECT.maxY)

    scene.stepDomain()

    const environmentalDefeats = scene.state.events.filter(
      (event) => event.type === 'actor-defeated' && event.attackerId === 'environment',
    )
    expect(environmentalDefeats).toHaveLength(2)
    expect(environmentalDefeats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorId: 'han', attackId: 'environmental-impact', strength: 3,
      }),
      expect.objectContaining({
        actorId: bossId, attackId: 'environmental-impact', strength: 3,
      }),
    ]))
    expect(scene.state.actors[bossId]).toMatchObject({ hp: 0, mode: 'defeated' })
    expect(scene.runState).toMatchObject({
      lives: 0,
      status: 'game-over',
      continueAvailable: true,
      score: 5_000,
      hitsTaken: 1,
    })
    expect(scene.zonePhase).toBe('active')
    expect(completeRun).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)

    scene.tryContinue()

    expect(scene.runState).toMatchObject({
      lives: 2,
      continueUsed: true,
      status: 'playing',
      currentWaveId: 'flooded-tunnel-wave-1',
      score: 0,
      hitsTaken: 1,
    })
    expect(scene.waveIndex).toBe(0)
    expect(scene.state.actors[bossId]).toBeUndefined()
    expect(scene.zonePhase).toBe('active')
    expect(completeRun).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
  })

  it('accepts only Enter for a capable Continue, while Escape forfeits and repeat is ignored', () => {
    const continuing = createLiveScene()
    continuing.scene.runState = {
      ...continuing.scene.runState,
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
    }
    for (const code of ['Space', 'KeyJ', 'KeyT']) {
      const ignoredEvent = keyboardEvent(code)
      continuing.scene.onDebugKeyDown(ignoredEvent)
      expect(ignoredEvent.preventDefault).not.toHaveBeenCalled()
    }
    expect(continuing.scene.runState.status).toBe('game-over')
    expect(continuing.services.completedRun).toBeNull()
    const continueEvent = keyboardEvent('Enter')
    continuing.scene.onDebugKeyDown(continueEvent)
    expect(continueEvent.preventDefault).toHaveBeenCalledOnce()
    expect(continuing.scene.runState).toMatchObject({
      status: 'playing', continueUsed: true, continueAvailable: false,
    })
    expect(continuing.services.completedRun).toBeNull()

    const forfeiting = createLiveScene()
    const completeRun = vi.spyOn(forfeiting.services, 'completeRun')
    forfeiting.scene.runState = {
      ...forfeiting.scene.runState,
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
    }
    const repeatEvent = keyboardEvent('Escape', true)
    forfeiting.scene.onDebugKeyDown(repeatEvent)
    expect(repeatEvent.preventDefault).not.toHaveBeenCalled()
    expect(completeRun).not.toHaveBeenCalled()
    const forfeitEvent = keyboardEvent('Escape')
    forfeiting.scene.onDebugKeyDown(forfeitEvent)
    forfeiting.scene.onDebugKeyDown(keyboardEvent('Escape'))
    expect(forfeitEvent.preventDefault).toHaveBeenCalledOnce()
    expect(completeRun).toHaveBeenCalledOnce()
    expect(forfeiting.services.completedRun).toEqual(expect.objectContaining({
      outcome: 'mission-failed', rank: 'D', continueUsed: false,
    }))
    expect(forfeiting.scene.scene.start).toHaveBeenCalledOnce()
  })

  it.each(['Enter', 'Space', 'KeyJ', 'Escape', 'KeyT'])(
    'routes exhausted Game Over key %s to one failed result',
    (code) => {
      const { scene, services } = createLiveScene()
      const completeRun = vi.spyOn(services, 'completeRun')
      scene.runState = {
        ...scene.runState,
        lives: 0,
        hp: 0,
        status: 'game-over',
        continueUsed: true,
        continueAvailable: false,
        debugClearUsed: true,
      }
      const terminalEvent = keyboardEvent(code)

      scene.onDebugKeyDown(terminalEvent)
      scene.onDebugKeyDown(keyboardEvent(code))

      expect(terminalEvent.preventDefault).toHaveBeenCalledOnce()
      expect(completeRun).toHaveBeenCalledOnce()
      expect(services.completedRun).toEqual(expect.objectContaining({
        outcome: 'mission-failed', rank: 'D', continueUsed: true,
      }))
      expect(scene.scene.start).toHaveBeenCalledOnce()
      expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Results)
    },
  )

  it('keeps the melee boss brain idle throughout a ranged telegraph and its firing tick', () => {
    const { scene } = createLiveScene()
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    stepUntil(
      scene,
      () => scene.state.actors[bossId].wakeInvulnerabilityRemainingMs === 0,
    )
    const player = scene.state.actors.han
    const boss = scene.state.actors[bossId]
    player.position = { x: 120, y: 220, z: 0 }
    boss.position = { x: 500, y: 264, z: 0 }
    boss.mode = 'idle'
    scene.bossBrains.set(bossId, createBossBrainState())
    scene.pendingBossRangedAttacks.clear()
    scene.bossRangedCooldownMs.set(bossId, 0)
    scene.bossRangedVolleyCount.set(bossId, 0)
    const spawn = vi.fn()
    scene.bossProjectileView = {
      advance: () => [],
      spawn,
    }

    scene.advanceBossRangedAttacks(fixedStepMs, player)
    expect(scene.pendingBossRangedAttacks.has(bossId)).toBe(true)
    expect(scene.buildBossCommands()).toContainEqual({
      actorId: bossId,
      moveX: 0,
      moveY: 0,
    })
    expect(scene.bossBrains.get(bossId)?.mode).toBe('chase')

    const pending = scene.pendingBossRangedAttacks.get(bossId)
    if (!pending) throw new Error('Expected an authored ranged telegraph.')
    pending.remainingTelegraphMs = 0
    scene.advanceBossRangedAttacks(fixedStepMs, player)
    expect(spawn).toHaveBeenCalledOnce()
    expect(scene.bossRangedFiringThisStep.has(bossId)).toBe(true)
    expect(scene.buildBossCommands()).toContainEqual({
      actorId: bossId,
      moveX: 0,
      moveY: 0,
    })
    expect(scene.bossBrains.get(bossId)?.mode).toBe('chase')
  })

  it('does not stack a boss projectile hit onto hitstun or knockdown', () => {
    const { scene } = createLiveScene()
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    const player = scene.state.actors.han
    player.wakeInvulnerabilityRemainingMs = 0
    scene.bossRangedCooldownMs.set(bossId, 99_000)
    scene.bossProjectileView = {
      advance: () => [{
        sourceId: bossId,
        pattern: 'straight-projectile',
        damage: 6,
        hitstunMs: 240,
      }],
      spawn: vi.fn(),
    }

    player.mode = 'hitstun'
    expect(scene.advanceBossRangedAttacks(fixedStepMs, player)).toEqual([])
    player.mode = 'knocked-down'
    expect(scene.advanceBossRangedAttacks(fixedStepMs, player)).toEqual([])
    player.mode = 'idle'
    expect(scene.advanceBossRangedAttacks(fixedStepMs, player)).toContainEqual(
      expect.objectContaining({
        actorId: player.id,
        environmentalImpact: expect.objectContaining({ damage: 6 }),
      }),
    )
  })

  it('advances the accepted boss cursor and resumes its next pattern after a live 700ms EMP edge', () => {
    const { scene } = createLiveScene()
    enterFloodedTunnel(scene)
    const bossId = enterBossWave(scene)
    const player = scene.state.actors.han
    const boss = scene.state.actors[bossId]
    player.position = { x: 300, y: 220, z: 0 }
    boss.position = { x: 340, y: 220, z: 0 }
    boss.hp = 600
    boss.mode = 'idle'
    scene.tunnelHazardState = createTunnelHazardState()
    scene.runState = { ...scene.runState, respawnInvulnerabilityRemainingMs: 5_000 }

    stepUntil(scene, () => scene.state.events.some((event) =>
      event.type === 'attack-started' &&
      event.actorId === bossId &&
      event.attackId === 'boss-floodline-charge',
    ))

    expect(scene.state.actors[bossId].activeAttack?.attackId).toBe('boss-floodline-charge')
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2,
      cursor: 'B',
      mode: 'await-completion',
      attackId: 'boss-floodline-charge',
    })

    dispatchKeyDown(scene, 'KeyE')
    scene.stepDomain()

    expect(scene.itemRuntime.inventory.counts.emp).toBe(0)
    expect(scene.itemRuntime.empRemainingMsByTargetId[bossId]).toBe(700)
    expect(scene.state.actors[bossId].activeAttack).toBeNull()
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(0)
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2,
      cursor: 'B',
      mode: 'chase',
      attackId: null,
      elapsedMs: 0,
    })

    const fullActiveStepsBeforeExpiry = Math.ceil(700 / fixedStepMs) - 1
    for (let step = 0; step < fullActiveStepsBeforeExpiry; step += 1) scene.stepDomain()
    expect(scene.itemRuntime.empRemainingMsByTargetId[bossId]).toBeGreaterThan(0)
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2, cursor: 'B', mode: 'chase',
    })
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(0)

    scene.stepDomain()

    expect(scene.itemRuntime.empRemainingMsByTargetId[bossId]).toBeCloseTo(0, 8)
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2, cursor: 'B', mode: 'chase',
    })
    scene.stepDomain()

    expect(scene.itemRuntime.empRemainingMsByTargetId[bossId]).toBeUndefined()
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2,
      cursor: 'B',
      mode: 'telegraph',
      attackId: 'boss-dredger-slam',
      elapsedMs: 0,
    })
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(1)

    stepUntil(scene, () => scene.state.events.some((event) =>
      event.type === 'attack-started' &&
      event.actorId === bossId &&
      event.attackId === 'boss-dredger-slam',
    ))
    expect(scene.bossBrains.get(bossId)).toMatchObject({
      phase: 2,
      cursor: 'A',
      mode: 'await-completion',
      attackId: 'boss-dredger-slam',
    })
  })
})

describe('TunnelBackdrop ownership', () => {
  it('repeats static tunnel sections and moves only dynamic hazards to the active section', () => {
    const { scene } = createLiveScene()
    const defaultBackdrop = new TunnelBackdrop(scene as never)
    const backdrop = new TunnelBackdrop(scene as never, 3)
    const defaultSnapshot = defaultBackdrop.snapshot()
    const owned = backdrop.snapshot().ownedObjectCount
    expect(defaultSnapshot).toMatchObject({
      sectionCount: 1,
      sectionStride: 640,
      activeSectionIndex: 0,
      ownedObjectCount: 12,
      sectionLandmarkCount: 1,
    })
    expect(owned).toBe(defaultSnapshot.ownedObjectCount + 14)

    backdrop.update(500, 'live', 'warning', 2)
    expect(backdrop.snapshot()).toMatchObject({
      elapsedMs: 500,
      sectionCount: 3,
      sectionStride: 640,
      activeSectionIndex: 2,
      sectionLandmarkCount: 3,
      puddleLiveVisible: true,
      trainWarningVisible: true,
    })
    const dynamic = backdrop as unknown as {
      puddle: { x: number, y: number }
      safeLane: { x: number, y: number }
      trainWarning: { x: number, y: number }
      trainWarningStripes: { x: number, y: number }
      runoff: { x: number, y: number }
    }
    expect(dynamic.puddle).toMatchObject({ x: 1_600, y: 283 })
    expect(dynamic.safeLane).toMatchObject({ x: 1_600, y: 214 })
    expect(dynamic.trainWarning).toMatchObject({ x: 1_600, y: 216 })
    expect(dynamic.trainWarningStripes).toMatchObject({ x: 1_280, y: 0 })
    expect(dynamic.runoff.x).toBe(1_280)
    expect(dynamic.runoff.y).toBeCloseTo(12.5)

    backdrop.reset()
    expect(backdrop.snapshot()).toMatchObject({
      elapsedMs: 0,
      activeSectionIndex: 0,
      puddlePhase: 'safe',
      trainPhase: 'idle',
      puddleLiveVisible: false,
      trainWarningVisible: false,
    })
    expect(dynamic.puddle).toMatchObject({ x: 320, y: 283 })
    expect(dynamic.safeLane).toMatchObject({ x: 320, y: 214 })
    expect(dynamic.trainWarning).toMatchObject({ x: 320, y: 216 })
    expect(dynamic.trainWarningStripes).toMatchObject({ x: 0, y: 0 })
    expect(dynamic.runoff).toMatchObject({ x: 0, y: 0 })

    defaultBackdrop.dispose()
    backdrop.dispose()
    backdrop.dispose()
    expect(backdrop.snapshot().ownedObjectCount).toBe(0)
  })
})
