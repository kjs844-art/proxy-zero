import { describe, expect, it } from 'vitest'

import {
  createRunState,
  runReducer,
  type RunCheckpoint,
  type RunState,
} from '../../src/domain/run/runReducer'

const emptyInventory = () => ({
  itemId: null,
  count: 0,
  available: false,
} as const)

const createRun = (overrides: Partial<RunState> = {}): RunState => ({
  ...createRunState({
    characterId: 'han',
    zoneId: 'n9-depot',
    waveId: 'n9-depot-wave-1',
    maxHp: 100,
    inventory: emptyInventory(),
  }),
  ...overrides,
})

const checkpoint = (): RunCheckpoint => ({
  schemaVersion: 1,
  characterId: 'mina',
  zoneId: 'service-train',
  zoneStartWaveId: 'service-train-wave-1',
  inventory: {
    itemId: 'emp',
    count: 1,
    available: true,
  },
})

describe('runReducer', () => {
  it('starts a fresh run with LIFE x2 and no downgrade', () => {
    const state = createRun()

    expect(state).toMatchObject({
      lives: 2,
      continueUsed: false,
      hp: 100,
      maxHp: 100,
      respawnInvulnerabilityRemainingMs: 0,
      score: 0,
      rankCap: null,
      status: 'playing',
    })
  })

  it('uses one life and requests a same-wave respawn without a zone rebuild', () => {
    const inventory = { itemId: 'repair-kit', count: 1, available: false } as const
    const before = createRun({
      hp: 0,
      score: 4_200,
      currentWaveId: 'n9-depot-wave-3',
      inventory,
    })

    const result = runReducer(before, { type: 'player-defeated' })

    expect(result.state).toMatchObject({
      lives: 1,
      hp: 100,
      score: 4_200,
      currentWaveId: 'n9-depot-wave-3',
      inventory,
      respawnInvulnerabilityRemainingMs: 1_200,
      status: 'playing',
    })
    expect(result.effects).toEqual([
      { type: 'same-wave-respawn', waveId: 'n9-depot-wave-3' },
    ])
  })

  it('advances respawn invulnerability only by explicit simulated delta and clamps at zero', () => {
    const respawned = createRun({
      lives: 1,
      respawnInvulnerabilityRemainingMs: 1_200,
    })

    const partial = runReducer(respawned, { type: 'advance-time', deltaMs: 417 })
    const complete = runReducer(partial.state, { type: 'advance-time', deltaMs: 10_000 })

    expect(partial.state.respawnInvulnerabilityRemainingMs).toBe(783)
    expect(complete.state.respawnInvulnerabilityRemainingMs).toBe(0)
  })

  it('tracks player HP through a deterministic clamped command', () => {
    const damaged = runReducer(createRun(), { type: 'player-hp-changed', hp: 37 })
    const defeated = runReducer(damaged.state, { type: 'player-hp-changed', hp: -50 })

    expect(damaged.state.hp).toBe(37)
    expect(defeated.state.hp).toBe(0)
  })

  it('enters Game Over on the second defeat and exposes Continue once', () => {
    const before = createRun({ lives: 1, hp: 0 })

    const result = runReducer(before, { type: 'player-defeated' })

    expect(result.state).toMatchObject({
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueUsed: false,
    })
    expect(result.state.continueAvailable).toBe(true)
    expect(result.effects).toEqual([])
  })

  it('continues from the zone checkpoint with fresh lives and a C rank cap', () => {
    const saved = checkpoint()
    const gameOver = createRun({
      lives: 0,
      hp: 0,
      score: 99_999,
      status: 'game-over',
      continueAvailable: true,
      currentWaveId: 'n9-depot-wave-3',
      inventory: { itemId: 'repair-kit', count: 1, available: true },
    })

    const result = runReducer(gameOver, {
      type: 'continue-from-checkpoint',
      checkpoint: saved,
    })

    expect(result.state).toMatchObject({
      characterId: 'mina',
      zoneId: 'service-train',
      currentWaveId: 'service-train-wave-1',
      lives: 2,
      hp: 100,
      score: 0,
      rankCap: 'C',
      continueUsed: true,
      continueAvailable: false,
      respawnInvulnerabilityRemainingMs: 0,
      status: 'playing',
      inventory: { itemId: 'emp', count: 1, available: true },
    })
    expect(result.effects).toEqual([
      {
        type: 'rebuild-zone',
        zoneId: 'service-train',
        waveId: 'service-train-wave-1',
      },
    ])

    saved.inventory.available = false
    expect(result.state.inventory.available).toBe(true)
  })

  it('keeps exhausted post-Continue Game Over terminal and ignores another Continue', () => {
    const terminal = createRun({
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueUsed: true,
    })

    const result = runReducer(terminal, {
      type: 'continue-from-checkpoint',
      checkpoint: checkpoint(),
    })

    expect(result.state).toEqual(terminal)
    expect(result.state.continueAvailable).toBe(false)
    expect(result.effects).toEqual([])
  })
})
