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
    setScrollFactor(_value: number): this { return this }
    setStrokeStyle(_width: number, _color: number, _alpha?: number): this { return this }
    setText(_value: string): this { return this }
    setVisible(value: boolean): this { this.visible = value; return this }
    setTintFill(_value: number): this { return this }
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
    readonly input = {
      keyboard: { off: vi.fn(), on: vi.fn() },
      off: vi.fn(),
      on: vi.fn(),
    }
    readonly scene = { start: vi.fn() }

    constructor(_config: unknown) {}
  }

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  }
})

import { attackCatalog } from '../../src/content/attacks'
import { GameServices, SCENE_KEYS } from '../../src/app/GameServices'
import { characters } from '../../src/content/characters'
import { getEnemyBaseBody, getEnemyVariant } from '../../src/content/enemies'
import { n9DepotZone } from '../../src/content/stage1'
import {
  combatReducer,
  type CombatCommand,
  type CombatActor,
  type CombatState,
} from '../../src/domain/combat/combatReducer'
import { fixedStepMs } from '../../src/domain/combat/tuning'
import { createEnemyBrainState, type EnemyIntent } from '../../src/domain/enemies/enemyBrain'
import type { EnemyBrainState, EnemyBrainResult } from '../../src/domain/enemies/enemyBrain'
import type { EnemyVariantDefinition } from '../../src/domain/enemies/types'
import { createRunState, type RunCheckpoint, type RunState } from '../../src/domain/run/runReducer'
import {
  advanceWaveDirector,
  createZoneWaveRuntime,
  type WaveDirectorEvent,
  type WaveDirectorState,
  type ZoneWaveRuntime,
} from '../../src/domain/waves/waveDirector'
import { HazardView } from '../../src/phaser/world/HazardView'
import { ZoneRenderer } from '../../src/phaser/world/ZoneRenderer'
import { CombatScene } from '../../src/phaser/scenes/CombatScene'

const content = {
  getVariant: getEnemyVariant,
  getBaseBody: getEnemyBaseBody,
}

const activeEnemies = (state: Readonly<WaveDirectorState>) =>
  state.spawnedEnemyIds
    .filter((enemyId) => !state.defeatedEnemyIds.includes(enemyId))
    .map((enemyId) => ({
      enemyId,
      position: { x: 320, y: 248 },
    }))

const advance = (
  state: Readonly<WaveDirectorState>,
  deltaMs: number,
  defeatedEnemyIds: readonly string[] = [],
) =>
  advanceWaveDirector(state, {
    deltaMs,
    defeatedEnemyIds,
    activeEnemies: activeEnemies(state),
    arena: n9DepotZone.arena,
    playerPosition: { x: 250, y: 248 },
    playerSafeSeparation: n9DepotZone.playerSafeSeparation,
  })

describe('N-9 Depot authored zone', () => {
  it('authors three exact escalating waves with stable delayed spawn orders', () => {
    expect(n9DepotZone.id).toBe('n9-depot')
    expect(n9DepotZone.waves.map((wave) => wave.id)).toEqual([
      'n9-depot-wave-1',
      'n9-depot-wave-2',
      'n9-depot-wave-3',
    ])
    expect(
      n9DepotZone.waves.map((wave) =>
        wave.orders.map(({ id, enemyVariantId, delayMs }) => ({
          id,
          enemyVariantId,
          delayMs,
        })),
      ),
    ).toEqual([
      [
        { id: 'entry-patrol', enemyVariantId: 'scout-patrol', delayMs: 0 },
        { id: 'far-striker', enemyVariantId: 'scout-striker', delayMs: 6_000 },
      ],
      [
        { id: 'left-striker', enemyVariantId: 'scout-striker', delayMs: 0 },
        { id: 'anchor-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 6_500 },
      ],
      [
        { id: 'near-patrol', enemyVariantId: 'scout-patrol', delayMs: 0 },
        { id: 'far-striker', enemyVariantId: 'scout-striker', delayMs: 6_000 },
        { id: 'gate-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 12_000 },
      ],
    ])
    expect(n9DepotZone.waves.map((wave) => wave.seed)).toEqual([
      0x19a2c4e1,
      0x29b3d5f2,
      0x39c4e603,
    ])
    expect(n9DepotZone.waves.map((wave) => wave.orders.length)).toEqual([2, 2, 3])
  })

  it('keeps arrival, lock timing, transition, and three-minute target as immutable data', () => {
    expect(n9DepotZone.inputReadyWithinMs).toBe(2_000)
    expect(n9DepotZone.firstSpawnWithinMs).toBe(4_000)
    expect(n9DepotZone.interWaveDelayMs).toBe(900)
    expect(n9DepotZone.enemyDamageScale).toBe(0.05)
    expect(n9DepotZone.transitionDurationMs).toBe(1_500)
    expect(n9DepotZone.transitionDurationMs).toBeGreaterThan(0)
    expect(n9DepotZone.transitionDurationMs).toBeLessThanOrEqual(2_000)
    expect(n9DepotZone.targetDurationMs).toBe(180_000)
    expect(n9DepotZone.acceptanceDurationMs).toEqual({ min: 150_000, max: 210_000 })
    expect(Object.isFrozen(n9DepotZone)).toBe(true)
    expect(Object.isFrozen(n9DepotZone.waves)).toBe(true)
    expect(Object.isFrozen(n9DepotZone.waves[0].orders[0].position)).toBe(true)
  })

  it('maps every authored enemy pattern to an existing zero-cost combat attack', () => {
    const attackById = new Map(attackCatalog.map((attack) => [attack.id, attack]))
    const authoredPatternIds = new Set(
      n9DepotZone.waves.flatMap((wave) =>
        wave.orders.flatMap((order) =>
          getEnemyVariant(order.enemyVariantId).attacks.map((attack) => attack.id),
        ),
      ),
    )

    expect(Object.keys(n9DepotZone.enemyPatternAttackIds).sort()).toEqual(
      [...authoredPatternIds].sort(),
    )
    for (const patternId of authoredPatternIds) {
      const attack = attackById.get(n9DepotZone.enemyPatternAttackIds[patternId])
      expect(attack, patternId).toBeDefined()
      expect(attack?.meterCost, patternId).toBe(0)
    }
  })

  it('keeps every AI attack range within its mapped combat hitbox reach', () => {
    const attackById = new Map(attackCatalog.map((attack) => [attack.id, attack]))
    const playerBodyHalfWidth = 12

    for (const wave of n9DepotZone.waves) {
      for (const order of wave.orders) {
        for (const pattern of getEnemyVariant(order.enemyVariantId).attacks) {
          const mappedAttack = attackById.get(n9DepotZone.enemyPatternAttackIds[pattern.id])
          expect(mappedAttack, pattern.id).toBeDefined()
          const actualXReach =
            Math.abs(mappedAttack?.hitbox.offsetX ?? 0) +
            (mappedAttack?.hitbox.halfWidth ?? 0) +
            playerBodyHalfWidth
          expect(pattern.range.x, pattern.id).toBeLessThanOrEqual(actualXReach)
        }
      }
    }
  })
})

describe('N-9 Depot Task 8 wave integration', () => {
  it('spawns immediately, preserves stable delayed order, and cannot clear early', () => {
    const wave = n9DepotZone.waves[2]
    let state = createZoneWaveRuntime(wave, wave.seed, content).wave

    let result = advance(state, 0)
    state = result.state
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy-spawned',
        waveId: 'n9-depot-wave-3',
        orderId: 'near-patrol',
      }),
    )

    result = advance(state, 5_999, state.spawnedEnemyIds)
    state = result.state
    expect(result.events.some((event) => event.type === 'wave-cleared')).toBe(false)
    expect(state.emittedOrderIds).toEqual(['near-patrol'])

    result = advance(state, 1)
    state = result.state
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'enemy-spawned', orderId: 'far-striker' }),
    )
    expect(state.emittedOrderIds).toEqual(['near-patrol', 'far-striker'])

    result = advance(state, 6_000, state.spawnedEnemyIds)
    expect(result.state.emittedOrderIds).toEqual([
      'near-patrol',
      'far-striker',
      'gate-enforcer',
    ])
    expect(result.events.some((event) => event.type === 'wave-cleared')).toBe(false)

    result = advance(result.state, 0, result.state.spawnedEnemyIds)
    expect(result.events).toContainEqual({
      type: 'wave-cleared',
      waveId: 'n9-depot-wave-3',
    })
  })

  it('clears all waves without a delayed-order deadlock at a reasonable simulated cadence', () => {
    const clearCadences = [45_000, 55_000, 65_000]
    let zoneElapsedMs = 0

    n9DepotZone.waves.forEach((wave, index) => {
      let state = createZoneWaveRuntime(wave, wave.seed, content).wave
      let result = advance(state, clearCadences[index])
      state = result.state
      expect(state.emittedOrderIds).toEqual(wave.orders.map((order) => order.id))

      result = advance(state, 0, state.spawnedEnemyIds)
      expect(result.state.cleared).toBe(true)
      expect(result.events).toContainEqual({ type: 'wave-cleared', waveId: wave.id })
      zoneElapsedMs += clearCadences[index]
      if (index < n9DepotZone.waves.length - 1) {
        zoneElapsedMs += n9DepotZone.interWaveDelayMs
      }
    })

    expect(zoneElapsedMs).toBeGreaterThanOrEqual(n9DepotZone.acceptanceDurationMs.min)
    expect(zoneElapsedMs).toBeLessThanOrEqual(n9DepotZone.acceptanceDurationMs.max)
  })

  it('clears all three directors from real CombatCommands and reducer HP defeats', () => {
    const makeActor = (overrides: Partial<CombatActor>): CombatActor => ({
      id: 'han',
      team: 'heroes',
      position: { x: 250, y: 248, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      facing: 1,
      body: { halfWidth: 12, halfDepth: 12, height: 48 },
      hp: 100,
      maxHp: 100,
      meter: 0,
      damageScale: 1,
      attackSpeedScale: 1,
      moveSpeedScale: 1,
      moveSpeed: 180,
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
    const clearedWaveIds: string[] = []
    let observedHpReduction = false

    for (const wave of n9DepotZone.waves) {
      const runtime = createZoneWaveRuntime(wave, wave.seed, content)
      let director = runtime.wave
      let combat: CombatState = {
        elapsedMs: 0,
        hitstopRemainingMs: 0,
        playerId: 'han',
        actors: { han: makeActor({}) },
        combo: {
          hitCount: 0,
          lastHitAtMs: null,
          lastAttackerId: null,
          lastTargetId: null,
        },
        events: [],
      }
      const reducerDefeats = new Set<string>()

      for (let step = 0; step < 2_000 && !director.cleared; step += 1) {
        const directorResult = advanceWaveDirector(director, {
          deltaMs: 50,
          defeatedEnemyIds: [...reducerDefeats],
          activeEnemies: director.spawnedEnemyIds
            .filter((enemyId) => !reducerDefeats.has(enemyId))
            .map((enemyId) => ({
              enemyId,
              position: combat.actors[enemyId]?.position ?? { x: 285, y: 248 },
            })),
          arena: n9DepotZone.arena,
          playerPosition: combat.actors.han.position,
          playerSafeSeparation: n9DepotZone.playerSafeSeparation,
        })
        director = directorResult.state

        for (const event of directorResult.events) {
          if (event.type !== 'enemy-spawned') continue
          const enemyRuntime = runtime.enemiesById[event.enemyId]
          const body = getEnemyBaseBody(enemyRuntime.baseBodyId)
          combat.actors[event.enemyId] = makeActor({
            id: event.enemyId,
            team: 'enemies',
            position: { x: combat.actors.han.position.x + 35, y: 248, z: 0 },
            body: { halfWidth: body.radius, halfDepth: body.radius, height: body.radius * 2 },
            hp: body.maxHp,
            maxHp: body.maxHp,
            moveSpeed: 0,
          })
        }

        const target = director.spawnedEnemyIds
          .map((enemyId) => combat.actors[enemyId])
          .find((actor) => actor && actor.mode !== 'defeated')
        const player = combat.actors.han
        const command: CombatCommand = target
          ? Math.abs(target.position.x - player.position.x) > 58
            ? {
                actorId: 'han',
                moveX: target.position.x < player.position.x ? -1 : 1,
                moveY: 0,
              }
            : { actorId: 'han', moveX: 0, moveY: 0, attackId: 'han-left-foot' }
          : { actorId: 'han', moveX: 0, moveY: 0 }
        const hpBefore = Object.fromEntries(
          Object.entries(combat.actors).map(([actorId, actor]) => [actorId, actor.hp]),
        )
        combat = combatReducer(combat, [command], 50)
        observedHpReduction ||= Object.entries(combat.actors).some(
          ([actorId, actor]) => actor.hp < (hpBefore[actorId] ?? actor.hp),
        )
        for (const event of combat.events) {
          if (event.type === 'actor-defeated' && event.actorId !== 'han') {
            reducerDefeats.add(event.actorId)
          }
        }
      }

      expect(reducerDefeats).toEqual(new Set(director.spawnedEnemyIds))
      expect(director.cleared, wave.id).toBe(true)
      clearedWaveIds.push(wave.id)
    }

    expect(observedHpReduction).toBe(true)
    expect(clearedWaveIds).toEqual(n9DepotZone.waves.map((wave) => wave.id))
  })
})

class FakeDisplayObject {
  alpha = 1
  destroyed = false
  fillColor = 0
  visible = true
  x = 0
  y = 0

  setAlpha(value: number): this {
    this.alpha = value
    return this
  }

  setDepth(_value: number): this {
    return this
  }

  setFillStyle(color: number, _alpha?: number): this {
    this.fillColor = color
    return this
  }

  setOrigin(_x: number, _y?: number): this {
    return this
  }

  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  setStrokeStyle(_width: number, _color: number, _alpha?: number): this {
    return this
  }

  setVisible(value: boolean): this {
    this.visible = value
    return this
  }

  destroy(): void {
    this.destroyed = true
  }
}

class FakeGraphics extends FakeDisplayObject {
  clear(): this { return this }
  fillCircle(_x: number, _y: number, _radius: number): this { return this }
  fillRect(_x: number, _y: number, _width: number, _height: number): this { return this }
  fillStyle(_color: number, _alpha?: number): this { return this }
  lineBetween(_x1: number, _y1: number, _x2: number, _y2: number): this { return this }
  lineStyle(_width: number, _color: number, _alpha?: number): this { return this }
  strokeRect(_x: number, _y: number, _width: number, _height: number): this { return this }
}

const fakeScene = () => {
  const objects: FakeDisplayObject[] = []
  const own = <Value extends FakeDisplayObject>(value: Value): Value => {
    objects.push(value)
    return value
  }
  return {
    objects,
    scene: {
      add: {
        ellipse: () => own(new FakeDisplayObject()),
        graphics: () => own(new FakeGraphics()),
        rectangle: () => own(new FakeDisplayObject()),
      },
    },
  }
}

describe('N-9 Depot owned presentation lifecycles', () => {
  it('renders a deterministic wet rail yard with functional lock/reset/dispose behavior', () => {
    const first = fakeScene()
    const second = fakeScene()
    const left = new ZoneRenderer(first.scene as never, n9DepotZone.arena)
    const right = new ZoneRenderer(second.scene as never, n9DepotZone.arena)

    expect(left.snapshot().depthLayerCount).toBeGreaterThanOrEqual(3)
    expect(left.snapshot()).toMatchObject({
      locked: true,
      elapsedMs: 0,
      hasRails: true,
      hasRain: true,
      hasTungstenPools: true,
      hasCyanReflections: true,
      hasWarningRed: true,
    })
    left.update(750)
    right.update(750)
    expect(left.snapshot()).toEqual(right.snapshot())

    left.setLocked(false)
    expect(left.snapshot().locked).toBe(false)
    left.reset()
    expect(left.snapshot()).toMatchObject({ locked: true, elapsedMs: 0 })

    left.dispose()
    expect(first.objects.every((object) => object.destroyed)).toBe(true)
    expect(left.snapshot().ownedObjectCount).toBe(0)
  })

  it('expires telegraphs, clears guard/removal markers, resets, and never applies damage', () => {
    const host = fakeScene()
    const hazards = new HazardView(host.scene as never)
    const actor = { hp: 42 }

    hazards.showTelegraph('enemy-a', { x: 300, y: 240 }, { x: 64, y: 24 }, 300)
    hazards.setGuard('enemy-a', { x: 300, y: 240 }, true)
    hazards.update(299)
    expect(hazards.snapshot()).toMatchObject({ telegraphCount: 1, guardCount: 1 })
    expect(actor.hp).toBe(42)

    hazards.update(1)
    expect(hazards.snapshot()).toMatchObject({ telegraphCount: 0, guardCount: 1 })
    hazards.clearEnemy('enemy-a')
    expect(hazards.snapshot()).toMatchObject({ telegraphCount: 0, guardCount: 0 })

    hazards.showTelegraph('enemy-b', { x: 320, y: 250 }, { x: 72, y: 34 }, 500)
    hazards.reset()
    expect(hazards.snapshot()).toMatchObject({ telegraphCount: 0, guardCount: 0 })

    hazards.dispose()
    expect(host.objects.every((object) => object.destroyed)).toBe(true)
    expect(hazards.snapshot().ownedObjectCount).toBe(0)
  })
})

type DisposableView = { dispose(): void }

type CombatSceneHarness = {
  state: CombatState
  runState: RunState
  waveRuntime: ZoneWaveRuntime
  waveIndex: number
  zonePhase: 'active' | 'inter-wave' | 'zone-clear'
  interWaveRemainingMs: number
  transitionRemainingMs: number
  pendingDefeatedEnemyIds: Set<string>
  enemyBrains: Map<string, EnemyBrainState>
  enemyRngs: Map<string, unknown>
  enemyVariantIds: Map<string, string>
  returningEnemyIds: Set<string>
  lastRecoveryPositions: Map<string, { x: number; y: number }>
  actorViews: Map<string, DisposableView>
  hazardView: HazardView | null
  zoneRenderer: ZoneRenderer | null
  zoneClearText: { visible: boolean } | null
  inputAdapter: { dispose(): void } | null
  scene: { start: ReturnType<typeof vi.fn> }
  input: { keyboard?: { off: ReturnType<typeof vi.fn> } }
  create(): void
  stepDomain(): void
  recordEnemyDefeats(enemyIds: readonly string[]): void
  applyPlayerFacingAssist(command: Readonly<CombatCommand>): void
  applyEnemyIntent(enemyId: string, intent: Readonly<EnemyIntent>): Partial<CombatCommand>
  applyEnemyGuardState(
    enemyId: string,
    brain: Readonly<EnemyBrainState>,
    variant: Readonly<EnemyVariantDefinition>,
  ): void
  applyWaveDirectorEvents(events: readonly WaveDirectorEvent[]): void
  activeEnemyObservations(): Array<{
    enemyId: string
    position: { x: number; y: number }
    madeRecoveryProgress?: boolean
  }>
  buildEnemyCommands(): CombatCommand[]
  tryContinue(): void
  dispose(): void
}

const createLiveScene = () => {
  const services = new GameServices()
  services.enterBootScene()
  services.enterScene(SCENE_KEYS.Title)
  services.enterScene(SCENE_KEYS.CharacterSelect)
  services.confirmCharacter('han', 0)
  const scene = new CombatScene(services) as unknown as CombatSceneHarness
  scene.create()
  return { scene, services }
}

const stepUntil = (
  scene: CombatSceneHarness,
  predicate: () => boolean,
  maxSteps = 900,
): void => {
  for (let step = 0; step < maxSteps && !predicate(); step += 1) scene.stepDomain()
  expect(predicate()).toBe(true)
}

const clearCurrentWave = (scene: CombatSceneHarness): void => {
  const authoredOrderCount = n9DepotZone.waves[scene.waveIndex].orders.length
  stepUntil(
    scene,
    () => scene.waveRuntime.wave.emittedOrderIds.length === authoredOrderCount,
  )
  scene.recordEnemyDefeats(scene.waveRuntime.wave.spawnedEnemyIds)
  scene.stepDomain()
}

describe('CombatScene N-9 Depot orchestration', () => {
  it('assists only a neutral-move attack toward the nearest in-range enemy with stable ties', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const player = scene.state.actors.han
    const spawnedEnemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    const spawnedEnemy = scene.state.actors[spawnedEnemyId]
    player.position = { x: 250, y: 248, z: 0 }
    player.facing = 1
    spawnedEnemy.position = { x: 200, y: 248, z: 0 }

    scene.applyPlayerFacingAssist({
      actorId: 'han',
      moveX: 0,
      moveY: 0,
      attackId: 'han-right-foot',
    })
    expect(player.facing).toBe(-1)

    scene.state.actors['a-stable-tie'] = {
      ...spawnedEnemy,
      id: 'a-stable-tie',
      position: { x: 300, y: 248, z: 0 },
      velocity: { ...spawnedEnemy.velocity },
      body: { ...spawnedEnemy.body },
    }
    player.facing = -1
    scene.applyPlayerFacingAssist({
      actorId: 'han',
      moveX: 0,
      moveY: 0,
      attackId: 'han-right-foot',
    })
    expect(player.facing).toBe(1)

    player.facing = -1
    scene.applyPlayerFacingAssist({
      actorId: 'han',
      moveX: 1,
      moveY: 0,
      attackId: 'han-right-foot',
    })
    expect(player.facing).toBe(-1)

    spawnedEnemy.position = { x: 431, y: 248, z: 0 }
    scene.state.actors['a-stable-tie'].mode = 'defeated'
    scene.applyPlayerFacingAssist({
      actorId: 'han',
      moveX: 0,
      moveY: 0,
      attackId: 'han-right-foot',
    })
    expect(player.facing).toBe(-1)

    spawnedEnemy.position = { x: 300, y: 309, z: 0 }
    scene.applyPlayerFacingAssist({
      actorId: 'han',
      moveX: 0,
      moveY: 0,
      attackId: 'han-right-foot',
    })
    expect(player.facing).toBe(-1)
  })

  it('arrives ready, spawns the first enemy, unlocks only between waves, and finishes after the card', () => {
    const { scene, services } = createLiveScene()
    expect(services.combatInputReadyWithin(n9DepotZone.inputReadyWithinMs)).toBe(true)
    expect(scene.zonePhase).toBe('active')
    expect(scene.zoneRenderer?.snapshot().locked).toBe(true)

    scene.stepDomain()
    expect(services.enemySpawnedWithin(n9DepotZone.firstSpawnWithinMs)).toBe(true)
    expect(scene.waveRuntime.wave.emittedOrderIds).toEqual(['entry-patrol'])

    const invariantRunState = {
      zoneStartWaveId: scene.runState.zoneStartWaveId,
      lives: scene.runState.lives,
      continueUsed: scene.runState.continueUsed,
      inventory: scene.runState.inventory,
    }

    clearCurrentWave(scene)
    expect(scene.zonePhase).toBe('inter-wave')
    expect(scene.zoneRenderer?.snapshot().locked).toBe(false)
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)

    stepUntil(scene, () => scene.waveIndex === 1 && scene.zonePhase === 'active')
    expect(scene.runState).toMatchObject({
      ...invariantRunState,
      currentWaveId: 'n9-depot-wave-2',
    })
    expect(scene.zoneRenderer?.snapshot().locked).toBe(true)

    clearCurrentWave(scene)
    expect(scene.zonePhase).toBe('inter-wave')
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)

    stepUntil(scene, () => scene.waveIndex === 2 && scene.zonePhase === 'active')
    clearCurrentWave(scene)
    expect(scene.zonePhase).toBe('zone-clear')
    expect(scene.transitionRemainingMs).toBe(n9DepotZone.transitionDurationMs)
    expect(scene.zoneClearText?.visible).toBe(true)
    expect(services.result).toBeNull()

    const stepsBeforeExpiry = Math.ceil(n9DepotZone.transitionDurationMs / fixedStepMs) - 1
    for (let step = 0; step < stepsBeforeExpiry; step += 1) scene.stepDomain()
    expect(services.result).toBeNull()
    scene.stepDomain()
    expect(services.result).toBe('enemy-defeated')
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Results)
  })

  it('clamps living actors while locked and releases the combat clamp between waves', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    scene.state.actors.han.position.x = 900
    scene.stepDomain()
    expect(scene.state.actors.han.position.x).toBe(n9DepotZone.arena.maxX)

    clearCurrentWave(scene)
    expect(scene.zonePhase).toBe('inter-wave')
    scene.state.actors.han.position.x = 900
    scene.stepDomain()
    expect(scene.state.actors.han.position.x).toBeGreaterThan(n9DepotZone.arena.maxX)
  })

  it('keeps terminal Game Over above a same-tick final-enemy defeat', () => {
    const { scene, services } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.state.actors[enemyId].hp = 0
    scene.state.actors[enemyId].mode = 'defeated'
    scene.runState = { ...scene.runState, lives: 1, hp: 0 }

    scene.stepDomain()
    expect(scene.runState).toMatchObject({
      lives: 0,
      status: 'game-over',
      continueAvailable: true,
    })
    expect(services.result).toBeNull()
    expect(scene.scene.start).not.toHaveBeenCalledWith(SCENE_KEYS.Results)
  })

  it('shows an attack telegraph before a mapped enemy attack can damage HAN', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    const enemy = scene.state.actors[enemyId]
    enemy.position = { x: 290, y: 248, z: 0 }
    enemy.facing = -1
    scene.state.actors.han.position = { x: 250, y: 248, z: 0 }
    scene.enemyBrains.set(enemyId, createEnemyBrainState('chase'))
    const hpBefore = scene.state.actors.han.hp

    scene.stepDomain()
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(1)
    expect(scene.state.actors.han.hp).toBe(hpBefore)
    const telegraphAtMs = scene.state.elapsedMs

    stepUntil(scene, () => scene.state.actors.han.hp < hpBefore, 120)
    expect(scene.state.elapsedMs).toBeGreaterThan(telegraphAtMs)
  })

  it('mirrors bulwark guard into reducer invulnerability and removes it exactly at expiry', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    const actor = scene.state.actors[enemyId]
    actor.position = { x: 290, y: 248, z: 0 }
    actor.maxHp = 76
    actor.hp = 76
    const variant = getEnemyVariant('bulwark-sentinel')
    const guardIntent: EnemyIntent = { type: 'guard', durationMs: variant.guardDurationMs }

    scene.applyEnemyIntent(enemyId, guardIntent)
    expect(actor.wakeInvulnerabilityRemainingMs).toBe(variant.guardDurationMs)
    expect(scene.hazardView?.snapshot().guardCount).toBe(1)

    let guardedState = combatReducer(
      scene.state,
      [{ actorId: 'han', moveX: 0, moveY: 0, attackId: 'han-right-hand' }],
      100,
    )
    expect(guardedState.actors[enemyId].hp).toBe(76)

    scene.state = guardedState
    scene.applyEnemyGuardState(
      enemyId,
      { mode: 'guard', attackId: null, elapsedMs: variant.guardDurationMs },
      variant,
    )
    expect(scene.state.actors[enemyId].wakeInvulnerabilityRemainingMs).toBe(0)
    expect(scene.hazardView?.snapshot().guardCount).toBe(0)
    guardedState = combatReducer(scene.state, [], 1)
    expect(guardedState.actors[enemyId].hp).toBeLessThan(76)
  })

  it('wires return steering and the director-provided safe forced re-entry point', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.state.actors[enemyId].position = { x: 700, y: 248, z: 0 }

    scene.applyWaveDirectorEvents([{ type: 'enemy-return-requested', enemyId }])
    expect(scene.returningEnemyIds.has(enemyId)).toBe(true)
    expect(scene.buildEnemyCommands()).toContainEqual(
      expect.objectContaining({ actorId: enemyId, moveX: -1 }),
    )

    const safePosition = { x: n9DepotZone.arena.maxX, y: n9DepotZone.arena.minY }
    scene.applyWaveDirectorEvents([
      { type: 'enemy-force-repositioned', enemyId, position: safePosition },
    ])
    expect(scene.state.actors[enemyId].position).toEqual({ ...safePosition, z: 0 })
    expect(scene.returningEnemyIds.has(enemyId)).toBe(false)
  })

  it('counts recovery progress only toward the arena and releases return steering on re-entry', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.state.actors[enemyId].position = { x: 700, y: 248, z: 0 }
    scene.activeEnemyObservations()

    scene.state.actors[enemyId].position.x = 720
    expect(scene.activeEnemyObservations()[0].madeRecoveryProgress).toBe(false)
    scene.state.actors[enemyId].position.x = 680
    expect(scene.activeEnemyObservations()[0].madeRecoveryProgress).toBe(true)

    scene.applyWaveDirectorEvents([{ type: 'enemy-return-requested', enemyId }])
    expect(scene.returningEnemyIds.has(enemyId)).toBe(true)
    scene.state.actors[enemyId].position.x = 500
    scene.activeEnemyObservations()
    expect(scene.returningEnemyIds.has(enemyId)).toBe(false)
  })

  it('pauses and discards enemy attack state while down, then resumes from chase', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.enemyBrains.set(enemyId, {
      mode: 'telegraph',
      attackId: 'scout-patrol-kick',
      elapsedMs: 250,
    })
    scene.applyEnemyIntent(enemyId, {
      type: 'telegraph',
      attackId: 'scout-patrol-kick',
      durationMs: 300,
      range: { x: 70, y: 26 },
    })
    scene.state.actors[enemyId].mode = 'knocked-down'

    expect(scene.buildEnemyCommands()).toContainEqual({
      actorId: enemyId,
      moveX: 0,
      moveY: 0,
    })
    expect(scene.enemyBrains.get(enemyId)).toEqual(createEnemyBrainState('down'))
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(0)

    scene.state.actors[enemyId].mode = 'getting-up'
    scene.buildEnemyCommands()
    expect(scene.enemyBrains.get(enemyId)?.mode).toBe('down')

    scene.state.actors[enemyId].mode = 'idle'
    scene.state.actors[enemyId].position.x = 560
    const resumed = scene.buildEnemyCommands().find((command) => command.actorId === enemyId)
    expect(scene.enemyBrains.get(enemyId)?.mode).toBe('chase')
    expect(resumed?.attackId).toBeUndefined()
  })

  it('retains living enemy HP on same-wave respawn and rebuilds fresh wave 1 on Continue', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.state.actors[enemyId].hp = 7
    scene.state.actors.han.hp = 0
    scene.state.actors.han.mode = 'defeated'
    scene.runState = { ...scene.runState, hp: 0, lives: 2 }

    scene.stepDomain()
    expect(scene.runState).toMatchObject({ lives: 1, currentWaveId: 'n9-depot-wave-1' })
    expect(scene.state.actors[enemyId].hp).toBe(7)
    expect(scene.state.actors.han).toMatchObject({ hp: 100, mode: 'idle' })

    scene.runState = {
      ...scene.runState,
      currentWaveId: 'n9-depot-wave-3',
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
    }
    scene.tryContinue()
    expect(scene.runState).toMatchObject({
      currentWaveId: 'n9-depot-wave-1',
      lives: 2,
      continueUsed: true,
      status: 'playing',
    })
    expect(scene.waveIndex).toBe(0)
    expect(scene.zonePhase).toBe('active')
    expect(Object.keys(scene.state.actors)).toEqual(['han'])
    expect(scene.enemyBrains.size).toBe(0)
    expect(scene.enemyRngs.size).toBe(0)
    expect(scene.pendingDefeatedEnemyIds.size).toBe(0)
    expect(scene.hazardView?.snapshot()).toMatchObject({ telegraphCount: 0, guardCount: 0 })
    expect(scene.zoneRenderer?.snapshot()).toMatchObject({ locked: true, elapsedMs: 0 })

    scene.stepDomain()
    const rebuiltEnemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    expect(scene.state.actors[rebuiltEnemyId].hp).toBe(
      getEnemyBaseBody('scout-frame').maxHp,
    )
  })

  it('symmetrically clears defeated enemy resources and every owned shutdown listener/view', () => {
    const { scene } = createLiveScene()
    scene.stepDomain()
    const enemyId = scene.waveRuntime.wave.spawnedEnemyIds[0]
    scene.applyEnemyIntent(enemyId, {
      type: 'telegraph',
      attackId: 'scout-patrol-kick',
      durationMs: 300,
      range: { x: 70, y: 26 },
    })
    expect(scene.actorViews.has(enemyId)).toBe(true)
    expect(scene.enemyBrains.has(enemyId)).toBe(true)
    expect(scene.enemyRngs.has(enemyId)).toBe(true)

    const enemyView = scene.actorViews.get(enemyId)
    const enemyDispose = vi.spyOn(enemyView as DisposableView, 'dispose')
    scene.recordEnemyDefeats([enemyId])
    expect(enemyDispose).toHaveBeenCalledOnce()
    expect(scene.actorViews.has(enemyId)).toBe(false)
    expect(scene.enemyBrains.has(enemyId)).toBe(false)
    expect(scene.enemyRngs.has(enemyId)).toBe(false)
    expect(scene.hazardView?.snapshot().telegraphCount).toBe(0)

    const playerView = scene.actorViews.get('han')
    const playerDispose = vi.spyOn(playerView as DisposableView, 'dispose')
    const inputAdapter = scene.inputAdapter
    const inputDispose = vi.spyOn(inputAdapter as { dispose(): void }, 'dispose')
    const renderer = scene.zoneRenderer
    const rendererDispose = vi.spyOn(renderer as ZoneRenderer, 'dispose')
    const hazards = scene.hazardView
    const hazardDispose = vi.spyOn(hazards as HazardView, 'dispose')

    scene.dispose()
    expect(playerDispose).toHaveBeenCalledOnce()
    expect(inputDispose).toHaveBeenCalledOnce()
    expect(rendererDispose).toHaveBeenCalledOnce()
    expect(hazardDispose).toHaveBeenCalledOnce()
    expect(scene.actorViews.size).toBe(0)
    expect(scene.enemyBrains.size).toBe(0)
    expect(scene.enemyRngs.size).toBe(0)
    expect(scene.input.keyboard?.off).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
