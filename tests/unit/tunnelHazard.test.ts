import { describe, expect, it } from 'vitest'

import {
  createTunnelHazardState,
  getPuddlePhase,
  getTunnelTrainPhase,
  stepTunnelHazard,
  type TunnelHazardEffect,
} from '../../src/domain/world/tunnelHazard'

const player = (x: number, y: number, grounded = true) => ({
  id: 'han', x, y, grounded,
})
const boss = (x: number, y: number, grounded = true) => ({
  id: 'flooded-tunnel-wave-2:final-boss', x, y, grounded,
})

describe('flooded-tunnel deterministic hazard clock', () => {
  it('uses exact half-open puddle/train phases with no live overlap', () => {
    let state = createTunnelHazardState()
    const advance = (deltaMs: number) => {
      state = stepTunnelHazard(state, {
        activeDeltaMs: deltaMs,
        player: player(48, 188),
        bosses: [],
      }).state
    }

    expect([getPuddlePhase(state), getTunnelTrainPhase(state)]).toEqual(['safe', 'idle'])
    advance(2_999)
    expect(getPuddlePhase(state)).toBe('safe')
    advance(1)
    expect(getPuddlePhase(state)).toBe('warning')
    advance(1_000)
    expect(getPuddlePhase(state)).toBe('live')
    expect(getTunnelTrainPhase(state)).toBe('idle')
    advance(2_000)
    expect(getPuddlePhase(state)).toBe('recover')
    advance(1_000)
    expect(getPuddlePhase(state)).toBe('safe')
    advance(4_000)
    expect(getTunnelTrainPhase(state)).toBe('warning')
    advance(1_500)
    expect(getTunnelTrainPhase(state)).toBe('sweep')
    expect(getPuddlePhase(state)).toBe('safe')
    advance(800)
    expect(getTunnelTrainPhase(state)).toBe('recover')
    advance(700)
    expect([getPuddlePhase(state), getTunnelTrainPhase(state)]).toEqual(['safe', 'idle'])
  })

  it('freezes on inactive/full-hitstop deltas and never emits an effect', () => {
    const state = createTunnelHazardState()
    for (const activeDeltaMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepTunnelHazard(state, {
        activeDeltaMs,
        player: player(300, 280),
        bosses: [boss(300, 220)],
      })).toEqual({ state, effects: [] })
    }
  })

  it('hits the grounded lower-lane player once per puddle window and recovers upward', () => {
    const live = stepTunnelHazard(createTunnelHazardState(), {
      activeDeltaMs: 4_000,
      player: player(300, 280),
      bosses: [],
    }).state
    const hit = stepTunnelHazard(live, {
      activeDeltaMs: 1,
      player: player(300, 280),
      bosses: [],
    })
    expect(hit.effects).toEqual([{
      type: 'puddle-hit', actorId: 'han', damage: 12,
      recoveryPosition: { x: 300, y: 240, z: 0 },
      reaction: { type: 'hitstun', durationMs: 300 },
    }])
    expect(stepTunnelHazard(hit.state, {
      activeDeltaMs: 999,
      player: player(300, 280),
      bosses: [],
    }).effects).toEqual([])
    expect(stepTunnelHazard(live, {
      activeDeltaMs: 10,
      player: player(300, 280, false),
      bosses: [],
    }).effects).toEqual([])
    expect(stepTunnelHazard(live, {
      activeDeltaMs: 10,
      player: player(300, 220),
      bosses: [],
    }).effects).toEqual([])
  })

  it('hits each grounded upper-lane train target once with player/boss damage', () => {
    const sweep = stepTunnelHazard(createTunnelHazardState(), {
      activeDeltaMs: 12_500,
      player: player(300, 220),
      bosses: [boss(500, 220)],
    }).state
    const hit = stepTunnelHazard(sweep, {
      activeDeltaMs: 1,
      player: player(300, 220),
      bosses: [boss(500, 220)],
    })
    expect(hit.effects).toEqual([
      {
        type: 'train-hit', actorId: 'han', damage: 24,
        recoveryPosition: { x: 300, y: 264, z: 0 },
        reaction: { type: 'knockdown', durationMs: 850 },
      },
      {
        type: 'train-hit', actorId: 'flooded-tunnel-wave-2:final-boss', damage: 60,
        recoveryPosition: { x: 500, y: 264, z: 0 },
        reaction: { type: 'knockdown', durationMs: 850 },
      },
    ])
    expect(stepTunnelHazard(hit.state, {
      activeDeltaMs: 500,
      player: player(300, 220),
      bosses: [boss(500, 220)],
    }).effects).toEqual([])
  })

  it('matches one large step with equivalent split steps and effect ordering', () => {
    const initial = createTunnelHazardState()
    const large = stepTunnelHazard(initial, {
      activeDeltaMs: 13_301,
      player: player(300, 220),
      bosses: [boss(500, 220)],
    })

    let state = initial
    const effects: TunnelHazardEffect[] = []
    for (const activeDeltaMs of [3_000, 1_000, 2_000, 1_000, 4_000, 1_500, 800, 1]) {
      const result = stepTunnelHazard(state, {
        activeDeltaMs,
        player: player(300, 220),
        bosses: [boss(500, 220)],
      })
      state = result.state
      effects.push(...result.effects)
    }
    expect(state).toEqual(large.state)
    expect(effects).toEqual(large.effects)
  })
})
