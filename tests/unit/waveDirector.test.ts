import { describe, expect, it } from 'vitest'
import {
  advanceWaveDirector,
  createZoneWaveRuntime,
  createWaveDirectorState,
  resetZoneWaveRuntime,
  resetWaveDirector,
  type EnemyContentResolver,
  type WaveDirectorInput,
} from '../../src/domain/waves/waveDirector'
import type { WaveDefinition } from '../../src/domain/enemies/types'
import { getEnemyBaseBody, getEnemyVariant } from '../../src/content/enemies'

const wave: WaveDefinition = {
  id: 'n9-depot-wave-1',
  orders: [
    { id: 'first', enemyVariantId: 'scout-striker', delayMs: 0 },
    { id: 'tie-a', enemyVariantId: 'bulwark-sentinel', delayMs: 500 },
    { id: 'tie-b', enemyVariantId: 'scout-patrol', delayMs: 500 },
    { id: 'last', enemyVariantId: 'bulwark-enforcer', delayMs: 1_000 },
  ],
}

const arena = { minX: -120, maxX: 120, minY: -80, maxY: 80 }
const playerPosition = { x: 0, y: 0 }

const input = (overrides: Partial<WaveDirectorInput> = {}): WaveDirectorInput => ({
  deltaMs: 0,
  playerPosition,
  arena,
  playerSafeSeparation: { x: 40, y: 28 },
  activeEnemies: [],
  ...overrides,
})

const spawnedIds = (events: ReturnType<typeof advanceWaveDirector>['events']) =>
  events
    .filter((event) => event.type === 'enemy-spawned')
    .map((event) => event.enemyId)

const enemyContent: EnemyContentResolver = {
  getVariant: getEnemyVariant,
  getBaseBody: getEnemyBaseBody,
}

describe('deterministic wave director', () => {
  it('emits authored spawn orders once by delay with stable authored tie order', () => {
    let state = createWaveDirectorState(wave, 24)

    let result = advanceWaveDirector(state, input())
    expect(spawnedIds(result.events)).toEqual(['n9-depot-wave-1:first'])
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 500 }))
    expect(spawnedIds(result.events)).toEqual([
      'n9-depot-wave-1:tie-a',
      'n9-depot-wave-1:tie-b',
    ])
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 500 }))
    expect(spawnedIds(result.events)).toEqual(['n9-depot-wave-1:last'])
    expect(result.state.emittedOrderIds).toEqual(['first', 'tie-a', 'tie-b', 'last'])
  })

  it('does not clear until every order has spawned and every spawned enemy is defeated', () => {
    let state = createWaveDirectorState(wave, 24)
    let result = advanceWaveDirector(state, input())
    state = result.state

    result = advanceWaveDirector(
      state,
      input({ defeatedEnemyIds: ['n9-depot-wave-1:first'] }),
    )
    expect(result.events.some((event) => event.type === 'wave-cleared')).toBe(false)
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 1_000 }))
    state = result.state
    const ids = state.spawnedEnemyIds

    result = advanceWaveDirector(state, input({ defeatedEnemyIds: ids }))
    expect(result.events).toContainEqual({ type: 'wave-cleared', waveId: wave.id })
    expect(result.state.cleared).toBe(true)
  })

  it('fails fast for invalid authored wave IDs, order IDs, variants, and delays', () => {
    expect(() => createWaveDirectorState({ ...wave, id: '' }, 1)).toThrowError(
      'Invalid wave ID: expected a non-empty string.',
    )
    expect(() =>
      createWaveDirectorState(
        { ...wave, orders: [{ id: '', enemyVariantId: 'scout-striker', delayMs: 0 }] },
        1,
      ),
    ).toThrowError('Invalid wave spawn order ID at index 0: expected a non-empty string.')
    expect(() =>
      createWaveDirectorState(
        { ...wave, orders: [{ id: 'first', enemyVariantId: ' ', delayMs: 0 }] },
        1,
      ),
    ).toThrowError('Invalid enemy variant ID for order "first": expected a non-empty string.')
    expect(() =>
      createWaveDirectorState(
        {
          ...wave,
          orders: [
            { id: 'first', enemyVariantId: 'scout-striker', delayMs: 0 },
            { id: 'first', enemyVariantId: 'bulwark-sentinel', delayMs: 1 },
          ],
        },
        1,
      ),
    ).toThrowError('Duplicate wave spawn order ID: "first".')

    for (const delayMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createWaveDirectorState(
          { ...wave, orders: [{ id: 'first', enemyVariantId: 'scout-striker', delayMs }] },
          1,
        ),
      ).toThrowError(
        'Invalid wave spawn delay for order "first": expected a finite non-negative number.',
      )
    }
  })

  it('requests return after two seconds and force-repositions only after eight seconds without progress', () => {
    let state = createWaveDirectorState(wave, 24)
    state = advanceWaveDirector(state, input()).state
    const activeEnemies = [
      {
        enemyId: 'n9-depot-wave-1:first',
        position: { x: 400, y: 100 },
        down: false,
        defeated: false,
        madeRecoveryProgress: false,
      },
    ]

    let result = advanceWaveDirector(state, input({ deltaMs: 1_999, activeEnemies }))
    expect(result.events.some((event) => event.type === 'enemy-return-requested')).toBe(false)
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 1, activeEnemies }))
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'enemy-return-requested', enemyId: 'n9-depot-wave-1:first' }),
    )
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 5_999, activeEnemies }))
    expect(result.events.some((event) => event.type === 'enemy-force-repositioned')).toBe(false)
    state = result.state

    result = advanceWaveDirector(state, input({ deltaMs: 1, activeEnemies }))
    const forced = result.events.find((event) => event.type === 'enemy-force-repositioned')
    expect(forced).toBeDefined()
    if (forced?.type === 'enemy-force-repositioned') {
      expect(forced.position.x).toBeGreaterThanOrEqual(arena.minX)
      expect(forced.position.x).toBeLessThanOrEqual(arena.maxX)
      expect(forced.position.y).toBeGreaterThanOrEqual(arena.minY)
      expect(forced.position.y).toBeLessThanOrEqual(arena.maxY)
      expect(
        Math.abs(forced.position.x - playerPosition.x) >= 40 ||
          Math.abs(forced.position.y - playerPosition.y) >= 28,
      ).toBe(true)
    }
  })

  it('resets recovery timers for progress or a return inside the arena, and ignores down enemies', () => {
    let state = createWaveDirectorState(wave, 24)
    state = advanceWaveDirector(state, input()).state
    const outside = {
      enemyId: 'n9-depot-wave-1:first',
      position: { x: 400, y: 100 },
      down: false,
      defeated: false,
      madeRecoveryProgress: false,
    }

    state = advanceWaveDirector(state, input({ deltaMs: 2_000, activeEnemies: [outside] })).state
    state = advanceWaveDirector(
      state,
      input({ deltaMs: 1, activeEnemies: [{ ...outside, madeRecoveryProgress: true }] }),
    ).state
    let result = advanceWaveDirector(state, input({ deltaMs: 7_999, activeEnemies: [outside] }))
    expect(result.events.some((event) => event.type === 'enemy-force-repositioned')).toBe(false)
    state = result.state

    result = advanceWaveDirector(
      state,
      input({ deltaMs: 2_000, activeEnemies: [{ ...outside, down: true }] }),
    )
    expect(result.events.some((event) => event.type.includes('return'))).toBe(false)
    expect(result.events.some((event) => event.type.includes('reposition'))).toBe(false)

    state = advanceWaveDirector(
      state,
      input({ activeEnemies: [{ ...outside, position: { x: 0, y: 0 } }] }),
    ).state
    expect(state.recoveryByEnemyId['n9-depot-wave-1:first']).toEqual({
      offscreenMs: 0,
      noProgressMs: 0,
      returnRequested: false,
      forcedRepositioned: false,
    })
  })

  it('reconstructs isolated full-health enemy and wave runtime from authored content and seed', () => {
    const original = createZoneWaveRuntime(wave, 4_242, enemyContent)
    const firstId = 'n9-depot-wave-1:first'
    const originalEnemy = original.enemiesById[firstId]
    const used = {
      ...original,
      wave: advanceWaveDirector(
        original.wave,
        input({
          deltaMs: 2_000,
          activeEnemies: [
            {
              enemyId: firstId,
              position: { x: 400, y: 100 },
              madeRecoveryProgress: false,
            },
          ],
        }),
      ).state,
      enemiesById: {
        ...original.enemiesById,
        [firstId]: {
          ...originalEnemy,
          hp: 1,
          defeated: true,
          brain: {
            mode: 'telegraph',
            attackId: 'scout-striker-jab',
            elapsedMs: 123,
          },
          recovery: {
            offscreenMs: 2_000,
            noProgressMs: 2_000,
            returnRequested: true,
            forcedRepositioned: false,
          },
        },
      },
    }

    const rebuilt = resetZoneWaveRuntime(wave, 4_242, enemyContent)
    const rebuiltEnemy = rebuilt.enemiesById[firstId]
    expect(rebuilt).not.toBe(used)
    expect(rebuilt.wave).not.toBe(used.wave)
    expect(rebuiltEnemy).not.toBe(used.enemiesById[firstId])
    expect(rebuiltEnemy.brain).not.toBe(used.enemiesById[firstId].brain)
    expect(rebuiltEnemy.recovery).not.toBe(used.enemiesById[firstId].recovery)
    expect(rebuilt.wave).toEqual(createWaveDirectorState(wave, 4_242))
    expect(rebuiltEnemy).toEqual({
      enemyId: firstId,
      orderId: 'first',
      enemyVariantId: 'scout-striker',
      baseBodyId: 'scout-frame',
      seed: originalEnemy.seed,
      hp: getEnemyBaseBody('scout-frame').maxHp,
      maxHp: getEnemyBaseBody('scout-frame').maxHp,
      brain: { mode: 'patrol', attackId: null, elapsedMs: 0 },
      defeated: false,
      recovery: {
        offscreenMs: 0,
        noProgressMs: 0,
        returnRequested: false,
        forcedRepositioned: false,
      },
    })

    const rebuiltDirector = resetWaveDirector(wave, 4_242)
    expect(rebuiltDirector).toEqual(createWaveDirectorState(wave, 4_242))
  })
})
