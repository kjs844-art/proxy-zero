import { describe, expect, it } from 'vitest'

import { getBossDefinition } from '../../src/content/bosses'
import {
  createBossBrainState,
  interruptBossBrain,
  stepBossBrain,
} from '../../src/domain/enemies/bossBrain'

const definition = getBossDefinition('boss-silo-dredger')
const snapshot = (
  state = createBossBrainState(),
  overrides: Partial<Parameters<typeof stepBossBrain>[0]> = {},
) => ({
  state,
  definition,
  hp: definition.maxHp,
  position: { x: 300, y: 240 },
  playerPosition: { x: 250, y: 240 },
  activeDeltaMs: 0,
  actorActiveAttackId: null,
  acceptedAttackId: null,
  empRemainingMs: 0,
  ...overrides,
})

describe('SILO DREDGER deterministic two-move brain', () => {
  it('enters exact phases, skips thresholds immediately, and never regresses', () => {
    const phase2 = stepBossBrain(snapshot(createBossBrainState(), { hp: 640 }))
    expect(phase2.state.phase).toBe(2)
    const phase3 = stepBossBrain(snapshot(phase2.state, { hp: 320 }))
    expect(phase3.state.phase).toBe(3)
    const noRegression = stepBossBrain(snapshot(phase3.state, { hp: 900 }))
    expect(noRegression.state.phase).toBe(3)

    const skipped = stepBossBrain(snapshot(createBossBrainState(), { hp: 300 }))
    expect(skipped.state.phase).toBe(3)
    expect(stepBossBrain(snapshot(createBossBrainState(), { hp: 641 })).state.phase).toBe(1)
    expect(stepBossBrain(snapshot(createBossBrainState(), { hp: 321 })).state.phase).toBe(2)
  })

  it('advances A/B only after the reducer accepts the requested attack', () => {
    const telegraph = stepBossBrain(snapshot())
    expect(telegraph.state).toMatchObject({ mode: 'telegraph', cursor: 'A' })
    const durationMs = definition.phases[0].telegraphMsByAttackId['boss-dredger-slam']
    const pending = stepBossBrain(snapshot(telegraph.state, { activeDeltaMs: durationMs }))
    expect(pending.intents).toEqual([
      { type: 'attack-requested', attackId: 'boss-dredger-slam', attackSpeedScale: 1 },
    ])
    const rejected = stepBossBrain(snapshot(pending.state, { acceptedAttackId: null }))
    expect(rejected.state.cursor).toBe('A')
    const accepted = stepBossBrain(snapshot(rejected.state, {
      acceptedAttackId: 'boss-dredger-slam',
      actorActiveAttackId: 'boss-dredger-slam',
    }))
    expect(accepted.state).toMatchObject({ mode: 'await-completion', cursor: 'B' })
  })

  it('uses exactly two attacks while materially varying all three phases', () => {
    expect(definition.patterns.map((pattern) => pattern.id)).toEqual([
      'boss-dredger-slam',
      'boss-floodline-charge',
    ])
    expect(new Set(definition.phases.map((phase) => JSON.stringify({
      order: phase.order,
      chaseSpeed: phase.chaseSpeed,
      attackSpeedScale: phase.attackSpeedScale,
      telegraphs: phase.telegraphMsByAttackId,
    }))).size).toBe(3)

    const phase2 = stepBossBrain(snapshot(createBossBrainState(), { hp: 500 }))
    expect(phase2.intents[0]).toMatchObject({
      type: 'telegraph', attackId: 'boss-floodline-charge',
    })
  })

  it('EMP interrupts a telegraph for the external 700ms timer and preserves phase/cursor', () => {
    const telegraph = createBossBrainState({
      phase: 3, cursor: 'B', mode: 'telegraph',
      attackId: 'boss-floodline-charge', elapsedMs: 250,
    })
    const interrupted = interruptBossBrain(telegraph)
    expect(interrupted).toMatchObject({ phase: 3, cursor: 'B', mode: 'chase' })
    const frozen = stepBossBrain(snapshot(interrupted, {
      hp: 200, activeDeltaMs: 699, empRemainingMs: 700,
    }))
    expect(frozen.state).toEqual(interrupted)
    expect(frozen.intents).toEqual([])
    const resumed = stepBossBrain(snapshot(frozen.state, { hp: 200, empRemainingMs: 0 }))
    expect(resumed.state).toMatchObject({ phase: 3, cursor: 'B', mode: 'telegraph' })
  })

  it('is large/split-delta deterministic through telegraph progression', () => {
    const started = stepBossBrain(snapshot()).state
    const durationMs = definition.phases[0].telegraphMsByAttackId['boss-dredger-slam']
    const large = stepBossBrain(snapshot(started, { activeDeltaMs: durationMs }))
    const splitA = stepBossBrain(snapshot(started, { activeDeltaMs: 200 }))
    const splitB = stepBossBrain(snapshot(splitA.state, { activeDeltaMs: durationMs - 200 }))
    expect(splitB).toEqual(large)
  })
})
