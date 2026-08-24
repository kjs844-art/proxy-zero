import { describe, expect, it } from 'vitest'

import { getEliteDefinition } from '../../src/content/elites'
import {
  createEliteBrainState,
  interruptEliteBrain,
  stepEliteBrain,
} from '../../src/domain/enemies/eliteBrain'

const elite = getEliteDefinition('elite-bulwark-frame')
const snapshot = (
  state = createEliteBrainState(),
  overrides: Partial<Parameters<typeof stepEliteBrain>[0]> = {},
) => ({
  state,
  definition: elite,
  position: { x: 300, y: 260 },
  playerPosition: { x: 250, y: 260 },
  activeDeltaMs: 0,
  actorActiveAttackId: null,
  acceptedAttackId: null,
  empRemainingMs: 0,
  ...overrides,
})

describe('elite deterministic two-pattern brain', () => {
  it('requests A after its telegraph and advances only after an accepted reducer start', () => {
    const chase = stepEliteBrain(snapshot())
    expect(chase.state).toMatchObject({ mode: 'telegraph', cursor: 'A' })
    expect(chase.intents).toEqual([
      expect.objectContaining({
        type: 'telegraph',
        attackId: 'elite-rail-hammer',
        durationMs: 650,
      }),
    ])

    const pending = stepEliteBrain(snapshot(chase.state, { activeDeltaMs: 650 }))
    expect(pending.state).toMatchObject({ mode: 'pending-start', cursor: 'A' })
    expect(pending.intents).toEqual([{ type: 'attack-requested', attackId: 'elite-rail-hammer' }])

    const rejected = stepEliteBrain(snapshot(pending.state, { activeDeltaMs: 400 }))
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.intents).toEqual([{ type: 'attack-requested', attackId: 'elite-rail-hammer' }])

    const accepted = stepEliteBrain(snapshot(rejected.state, {
      acceptedAttackId: 'elite-rail-hammer',
      actorActiveAttackId: 'elite-rail-hammer',
    }))
    expect(accepted.state).toMatchObject({ mode: 'await-completion', cursor: 'B' })
    expect(accepted.intents).toEqual([])
  })

  it('waits for combat-owned recovery, then requests B with no hidden third pattern', () => {
    const awaitingB = createEliteBrainState('B', 'await-completion', 'elite-rail-hammer')
    const stillBusy = stepEliteBrain(snapshot(awaitingB, {
      activeDeltaMs: 10_000,
      actorActiveAttackId: 'elite-rail-hammer',
    }))
    expect(stillBusy.state).toEqual(awaitingB)

    const chaseB = stepEliteBrain(snapshot(stillBusy.state, { actorActiveAttackId: null }))
    expect(chaseB.state).toMatchObject({ mode: 'chase', cursor: 'B' })
    const telegraphB = stepEliteBrain(snapshot(chaseB.state))
    expect(telegraphB.intents).toEqual([
      expect.objectContaining({
        type: 'telegraph',
        attackId: 'elite-lane-charge',
        durationMs: 900,
      }),
    ])
    const pendingB = stepEliteBrain(snapshot(telegraphB.state, { activeDeltaMs: 900 }))
    expect(pendingB.intents).toEqual([
      { type: 'attack-requested', attackId: 'elite-lane-charge' },
    ])
    const acceptedB = stepEliteBrain(snapshot(pendingB.state, {
      acceptedAttackId: 'elite-lane-charge',
      actorActiveAttackId: 'elite-lane-charge',
    }))
    expect(acceptedB.state.cursor).toBe('A')
    expect(elite.patterns.map((pattern) => pattern.id)).toEqual([
      'elite-rail-hammer',
      'elite-lane-charge',
    ])
  })

  it('clears telegraph on elite EMP, freezes for the external 1,300ms timer, and preserves cursor', () => {
    const telegraphB = createEliteBrainState('B', 'telegraph', 'elite-lane-charge', 450)
    const interrupted = interruptEliteBrain(telegraphB)
    expect(interrupted).toEqual(createEliteBrainState('B'))

    const frozen = stepEliteBrain(snapshot(interrupted, {
      activeDeltaMs: 1_299,
      empRemainingMs: 1_300,
    }))
    expect(frozen.state).toEqual(interrupted)
    expect(frozen.intents).toEqual([])

    const lastFrozen = stepEliteBrain(snapshot(frozen.state, {
      activeDeltaMs: 1,
      empRemainingMs: 1,
    }))
    expect(lastFrozen.state).toEqual(interrupted)
    const resumed = stepEliteBrain(snapshot(lastFrozen.state, { empRemainingMs: 0 }))
    expect(resumed.state).toMatchObject({ mode: 'telegraph', cursor: 'B' })
    expect(createEliteBrainState()).toMatchObject({ mode: 'chase', cursor: 'A' })
  })

  it('is split/large-delta deterministic through telegraph to a pending request', () => {
    const started = stepEliteBrain(snapshot()).state
    const large = stepEliteBrain(snapshot(started, { activeDeltaMs: 900 }))
    const splitA = stepEliteBrain(snapshot(started, { activeDeltaMs: 300 }))
    const splitB = stepEliteBrain(snapshot(splitA.state, { activeDeltaMs: 600 }))
    expect(splitB).toEqual(large)
  })
})
