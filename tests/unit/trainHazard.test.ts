import { describe, expect, it } from 'vitest'

import {
  createTrainHazardState,
  getTrainHazardPhase,
  stepTrainHazard,
  type PlayerFellEffect,
} from '../../src/domain/world/trainHazard'

const player = (x: number, y: number, grounded = true) => ({ x, y, grounded })

describe('service-train deterministic fall hazard', () => {
  it('uses exact half-open phases and freezes on zero or invalid active deltas', () => {
    let state = createTrainHazardState()
    expect(getTrainHazardPhase(state)).toBe('safe')
    state = stepTrainHazard(state, { activeDeltaMs: 2_999, player: player(64, 236) }).state
    expect(getTrainHazardPhase(state)).toBe('safe')
    state = stepTrainHazard(state, { activeDeltaMs: 1, player: player(64, 236) }).state
    expect(getTrainHazardPhase(state)).toBe('warning')
    state = stepTrainHazard(state, { activeDeltaMs: 1_000, player: player(64, 236) }).state
    expect(getTrainHazardPhase(state)).toBe('open')
    state = stepTrainHazard(state, { activeDeltaMs: 1_500, player: player(64, 236) }).state
    expect(getTrainHazardPhase(state)).toBe('recover')
    state = stepTrainHazard(state, { activeDeltaMs: 500, player: player(64, 236) }).state
    expect(getTrainHazardPhase(state)).toBe('safe')

    const frozen = state
    for (const activeDeltaMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepTrainHazard(frozen, { activeDeltaMs, player: player(300, 280) })).toEqual({
        state: frozen,
        carryDeltaX: 0,
        effects: [],
      })
    }
  })

  it('moves a 112px platform on the exact 278..362 triangle and carries support riders', () => {
    const initial = createTrainHazardState()
    const right = stepTrainHazard(initial, { activeDeltaMs: 1_000, player: player(278, 280) })
    expect(right.state.platformCenterX).toBeCloseTo(334, 8)
    expect(right.carryDeltaX).toBeCloseTo(56, 8)

    const turn = stepTrainHazard(right.state, {
      activeDeltaMs: 1_000,
      player: player(334, 280),
    })
    expect(turn.state.platformCenterX).toBeCloseTo(334, 8)
    expect(turn.carryDeltaX).toBeCloseTo(0, 8)

    const splitA = stepTrainHazard(initial, { activeDeltaMs: 750, player: player(278, 280) })
    const splitB = stepTrainHazard(splitA.state, {
      activeDeltaMs: 1_250,
      player: player(278 + splitA.carryDeltaX, 280),
    })
    expect(splitA.carryDeltaX + splitB.carryDeltaX).toBeCloseTo(
      right.carryDeltaX + turn.carryDeltaX,
      8,
    )
    expect(splitB.state).toEqual(turn.state)
  })

  it('keeps the upper lane safe and emits one fall outside platform support in open phase', () => {
    const open = stepTrainHazard(createTrainHazardState(), {
      activeDeltaMs: 4_000,
      player: player(394, 244),
    }).state
    const safeLane = stepTrainHazard(open, { activeDeltaMs: 100, player: player(300, 244) })
    expect(safeLane.effects).toEqual([])

    const fell = stepTrainHazard(open, { activeDeltaMs: 0.001, player: player(394, 280) })
    expect(fell.effects).toEqual([
      {
        type: 'player-fell',
        damage: 18,
        recoveryPosition: { x: 394, y: 236, z: 0 },
        knockdownMs: 850,
      },
    ])
    expect(fell.state.retriggerImmunityRemainingMs).toBeCloseTo(1_499.999, 8)

    const immune = stepTrainHazard(fell.state, {
      activeDeltaMs: 100,
      player: player(394, 280),
    })
    expect(immune.effects).toEqual([])
  })

  it('matches one large step with split steps across wraparound and freezes full hitstop', () => {
    const initial = createTrainHazardState()
    const large = stepTrainHazard(initial, { activeDeltaMs: 6_250, player: player(394, 280) })

    let splitState = initial
    let x = 394
    const splitEffects: PlayerFellEffect[] = []
    for (const delta of [3_000, 1_000, 1_500, 500, 250]) {
      const result = stepTrainHazard(splitState, { activeDeltaMs: delta, player: player(x, 280) })
      splitState = result.state
      x += result.carryDeltaX
      splitEffects.push(...result.effects)
    }
    expect(splitState).toEqual(large.state)
    expect(splitEffects).toEqual(large.effects)

    const frozen = stepTrainHazard(large.state, { activeDeltaMs: 0, player: player(x, 280) })
    expect(frozen.state).toBe(large.state)
    expect(frozen.carryDeltaX).toBe(0)
    expect(frozen.effects).toEqual([])
  })

  it('keeps large and split deltas identical when immunity expires during an open phase', () => {
    const immuneOpen = {
      elapsedMs: 4_100,
      platformCenterX: 339.6,
      retriggerImmunityRemainingMs: 100,
    }
    const large = stepTrainHazard(immuneOpen, {
      activeDeltaMs: 101,
      player: player(246, 280),
    })
    const splitA = stepTrainHazard(immuneOpen, {
      activeDeltaMs: 100,
      player: player(246, 280),
    })
    const splitB = stepTrainHazard(splitA.state, {
      activeDeltaMs: 1,
      player: player(246 + splitA.carryDeltaX, 280),
    })

    expect(large.state).toEqual(splitB.state)
    expect(large.carryDeltaX).toBeCloseTo(splitA.carryDeltaX + splitB.carryDeltaX, 8)
    expect(large.effects).toEqual(splitB.effects)
    expect(large.effects).toHaveLength(1)
  })
})
