import { describe, expect, it } from 'vitest'

import {
  createRunState,
  runReducer,
  type DefeatedEnemyClass,
  type RunCheckpoint,
  type RunState,
} from '../../src/domain/run/runReducer'

const createRun = (overrides: Partial<RunState> = {}): RunState => ({
  ...createRunState({
    characterId: 'han',
    zoneId: 'n9-depot',
    waveId: 'n9-depot-wave-1',
    maxHp: 100,
  }),
  ...overrides,
})

const checkpoint = (): RunCheckpoint => ({
  schemaVersion: 2,
  characterId: 'han',
  zoneId: 'n9-depot',
  zoneStartWaveId: 'n9-depot-wave-1',
  inventory: {
    counts: { emp: 1, 'repair-kit': 0 },
    selectedItemId: 'emp',
  },
})

describe('runReducer', () => {
  it('enters a zone atomically while preserving run continuity fields', () => {
    const current = createRun({
      currentWaveId: 'n9-depot-wave-3', lives: 1, hp: 37, score: 8_400,
      continueUsed: true, rankCap: 'C',
    })
    const result = runReducer(current, {
      type: 'enter-zone',
      entry: { zoneId: 'service-train', zoneStartWaveId: 'service-train-wave-1' },
    })
    expect(result.state).toEqual({
      ...current,
      zoneId: 'service-train',
      zoneStartWaveId: 'service-train-wave-1',
      currentWaveId: 'service-train-wave-1',
    })
    expect(result.effects).toEqual([{
      type: 'zone-entered',
      entry: { zoneId: 'service-train', zoneStartWaveId: 'service-train-wave-1' },
    }])
  })
  it('starts a fresh run with LIFE x2 and no downgrade', () => {
    const state = createRun()

    expect(state).toMatchObject({
      lives: 2,
      zoneStartWaveId: 'n9-depot-wave-1',
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
    const before = createRun({
      hp: 0,
      score: 4_200,
      currentWaveId: 'n9-depot-wave-3',
    })

    const result = runReducer(before, { type: 'player-defeated' })

    expect(result.state).toMatchObject({
      lives: 1,
      hp: 100,
      score: 4_200,
      currentWaveId: 'n9-depot-wave-3',
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
    })

    const result = runReducer(gameOver, {
      type: 'continue-from-checkpoint',
      checkpoint: saved,
    })

    expect(result.state).toMatchObject({
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
      currentWaveId: 'n9-depot-wave-1',
      lives: 2,
      hp: 100,
      score: 0,
      rankCap: 'C',
      continueUsed: true,
      continueAvailable: false,
      respawnInvulnerabilityRemainingMs: 0,
      status: 'playing',
    })
    expect(result.effects).toEqual([
      {
        type: 'rebuild-zone',
        zoneId: 'n9-depot',
        waveId: 'n9-depot-wave-1',
        inventory: {
          counts: { emp: 1, 'repair-kit': 0 },
          selectedItemId: 'emp',
        },
      },
    ])

    saved.inventory.counts.emp = 0
    const effect = result.effects.find((entry) => entry.type === 'rebuild-zone')
    expect(effect?.inventory.counts.emp).toBe(1)
  })

  it('rejects a checkpoint that belongs to another run identity', () => {
    const gameOver = createRun({
      lives: 0,
      hp: 0,
      status: 'game-over',
      continueAvailable: true,
      currentWaveId: 'n9-depot-wave-3',
    })
    const staleCheckpoint: RunCheckpoint = {
      ...checkpoint(),
      characterId: 'mina',
      zoneId: 'service-train',
      zoneStartWaveId: 'service-train-wave-1',
    }

    const result = runReducer(gameOver, {
      type: 'continue-from-checkpoint',
      checkpoint: staleCheckpoint,
    })

    expect(result.state).toEqual(gameOver)
    expect(result.effects).toEqual([])
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
  it('initializes fresh ranking fields without expanding the checkpoint contract', () => {
    expect(createRun()).toMatchObject({
      activeTimeMs: 0,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 0,
      hitsTaken: 0,
      debugClearUsed: false,
    })
    expect(checkpoint()).toEqual({
      schemaVersion: 2,
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
      inventory: {
        counts: { emp: 1, 'repair-kit': 0 },
        selectedItemId: 'emp',
      },
    })
  })

  it('advances only supplied active time and expires combo at exactly 850 ms', () => {
    const running = createRun({
      respawnInvulnerabilityRemainingMs: 1_200,
      currentCombo: 2,
      lastPlayerHitAtMs: 0,
      maxCombo: 2,
    })

    const partial = runReducer(running, { type: 'advance-time', deltaMs: 849.5 })
    const boundary = runReducer(partial.state, { type: 'advance-time', deltaMs: 0.5 })
    const invalid = runReducer(boundary.state, {
      type: 'advance-time',
      deltaMs: Number.NaN,
    })

    expect(partial.state).toMatchObject({
      activeTimeMs: 849.5,
      respawnInvulnerabilityRemainingMs: 350.5,
      currentCombo: 2,
    })
    expect(boundary.state).toMatchObject({
      activeTimeMs: 850,
      respawnInvulnerabilityRemainingMs: 350,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 2,
    })
    expect(invalid.state).toEqual(boundary.state)
  })

  it('tracks supplied player hits and damage facts without using global combat combo', () => {
    const first = runReducer(createRun(), {
      type: 'record-combat-events',
      playerConfirmedHits: 2,
      playerDamageEvents: 2,
      defeatedEnemyClasses: [],
    })
    const within = runReducer(
      runReducer(first.state, { type: 'advance-time', deltaMs: 849 }).state,
      {
        type: 'record-combat-events',
        playerConfirmedHits: 3,
        playerDamageEvents: 0,
        defeatedEnemyClasses: [],
      },
    )
    const expired = runReducer(within.state, { type: 'advance-time', deltaMs: 850 })

    expect(first.state).toMatchObject({
      currentCombo: 2,
      lastPlayerHitAtMs: 0,
      maxCombo: 2,
      hitsTaken: 2,
    })
    expect(within.state).toMatchObject({
      activeTimeMs: 849,
      currentCombo: 5,
      lastPlayerHitAtMs: 849,
      maxCombo: 5,
      hitsTaken: 2,
    })
    expect(expired.state).toMatchObject({
      activeTimeMs: 1_699,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 5,
    })
  })

  it.each([
    ['normal', 500],
    ['elite', 2_500],
    ['boss', 5_000],
  ] as const)('scores one defeated %s exactly once', (enemyClass, score) => {
    const result = runReducer(createRun(), {
      type: 'record-combat-events',
      playerConfirmedHits: 0,
      playerDamageEvents: 0,
      defeatedEnemyClasses: [enemyClass],
    })

    expect(result.state.score).toBe(score)
  })

  it('scores the authored 15 normal, one elite, and one boss total', () => {
    const defeatedEnemyClasses: DefeatedEnemyClass[] = [
      ...Array.from({ length: 15 }, () => 'normal' as const),
      'elite',
      'boss',
    ]
    const result = runReducer(createRun(), {
      type: 'record-combat-events',
      playerConfirmedHits: 0,
      playerDamageEvents: 0,
      defeatedEnemyClasses,
    })

    expect(result.state.score).toBe(15_000)
  })

  it('preserves statistics but resets current combo on respawn and zone transition', () => {
    const statistics = {
      activeTimeMs: 42_000,
      score: 4_200,
      currentCombo: 7,
      lastPlayerHitAtMs: 41_900,
      maxCombo: 12,
      hitsTaken: 5,
      debugClearUsed: true,
    }
    const respawn = runReducer(createRun({ ...statistics, hp: 0 }), {
      type: 'player-defeated',
    })
    const zone = runReducer({
      ...respawn.state,
      currentCombo: 3,
      lastPlayerHitAtMs: 42_000,
    }, {
      type: 'enter-zone',
      entry: { zoneId: 'service-train', zoneStartWaveId: 'service-train-wave-1' },
    })

    expect(respawn.state).toMatchObject({
      activeTimeMs: 42_000,
      score: 4_200,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 12,
      hitsTaken: 5,
      debugClearUsed: true,
    })
    expect(zone.state).toMatchObject({
      activeTimeMs: 42_000,
      score: 4_200,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 12,
      hitsTaken: 5,
      debugClearUsed: true,
    })
  })

  it('marks debug clear idempotently and preserves the mark', () => {
    const marked = runReducer(createRun(), { type: 'mark-debug-clear-used' })
    const again = runReducer(marked.state, { type: 'mark-debug-clear-used' })
    const advanced = runReducer(again.state, { type: 'advance-time', deltaMs: 16 })

    expect(marked.state.debugClearUsed).toBe(true)
    expect(again.state.debugClearUsed).toBe(true)
    expect(advanced.state).toMatchObject({ debugClearUsed: true, activeTimeMs: 16 })
  })

  it('preserves same-tick boss score before terminal player defeat', () => {
    const recorded = runReducer(createRun({ lives: 1, hp: 0 }), {
      type: 'record-combat-events',
      playerConfirmedHits: 0,
      playerDamageEvents: 1,
      defeatedEnemyClasses: ['boss'],
    })
    const gameOver = runReducer(recorded.state, { type: 'player-defeated' })

    expect(gameOver.state).toMatchObject({
      status: 'game-over',
      score: 5_000,
      hitsTaken: 1,
    })
  })

  it('applies the approved Continue statistic preservation and reset matrix', () => {
    const gameOver = createRun({
      lives: 0,
      hp: 0,
      activeTimeMs: 123_000,
      score: 99_999,
      currentCombo: 11,
      lastPlayerHitAtMs: 122_900,
      maxCombo: 15,
      hitsTaken: 9,
      debugClearUsed: true,
      status: 'game-over',
      continueAvailable: true,
      currentWaveId: 'n9-depot-wave-3',
    })

    const result = runReducer(gameOver, {
      type: 'continue-from-checkpoint',
      checkpoint: checkpoint(),
    })

    expect(result.state).toMatchObject({
      activeTimeMs: 123_000,
      score: 0,
      currentCombo: 0,
      lastPlayerHitAtMs: null,
      maxCombo: 15,
      hitsTaken: 9,
      debugClearUsed: true,
      rankCap: 'C',
      continueUsed: true,
    })
  })

  it('ignores time and combat statistics after terminal Game Over', () => {
    const terminal = createRun({
      lives: 0,
      hp: 0,
      status: 'game-over',
      activeTimeMs: 500,
      score: 500,
      hitsTaken: 2,
    })
    const advanced = runReducer(terminal, { type: 'advance-time', deltaMs: 1_000 })
    const recorded = runReducer(advanced.state, {
      type: 'record-combat-events',
      playerConfirmedHits: 4,
      playerDamageEvents: 3,
      defeatedEnemyClasses: ['elite'],
    })

    expect(advanced.state).toEqual(terminal)
    expect(recorded.state).toEqual(terminal)
  })

})
