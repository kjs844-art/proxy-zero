import { describe, expect, it } from 'vitest'

import type { CombatEvent } from '../../src/domain/combat/combatReducer'
import {
  CombatVfx,
  CombatVfxBatchGate,
  planPresentationBatch,
  type ActorPresentationPoint,
} from '../../src/presentation/CombatVfx'

class FakeDisplay {
  setAlpha(_value: number): this { return this }
  setDepth(_value: number): this { return this }
  setOrigin(_x: number, _y?: number): this { return this }
  setPosition(_x: number, _y: number): this { return this }
  setScrollFactor(_value: number): this { return this }
  destroy(): void {}
}

class FakeGraphics extends FakeDisplay {
  clear(): this { return this }
  fillCircle(_x: number, _y: number, _radius: number): this { return this }
  fillRect(_x: number, _y: number, _width: number, _height: number): this { return this }
  fillStyle(_color: number, _alpha?: number): this { return this }
  lineBetween(_x1: number, _y1: number, _x2: number, _y2: number): this { return this }
  lineStyle(_width: number, _color: number, _alpha?: number): this { return this }
}

const fakeScene = () => ({
  add: { graphics: () => new FakeGraphics(), text: () => new FakeDisplay() },
  cameras: { main: { scrollX: 0, scrollY: 0, setScroll: () => undefined } },
})

const points: Readonly<Record<string, ActorPresentationPoint>> = {
  han: { x: 220, y: 220, facing: 1 },
  enemy: { x: 270, y: 220, facing: -1 },
}

const hit = (strength: number, damage = 12): CombatEvent => ({
  type: 'hit-confirmed', atMs: 100, attackerId: 'han', targetId: 'enemy',
  attackId: 'han-right-hand', strength, damage,
})

describe('CombatVfx event planning', () => {
  it('maps final combat events to capped deterministic VFX, audio, and one strongest shake', () => {
    const events: CombatEvent[] = [hit(1), hit(2), hit(3), hit(2), {
      type: 'actor-defeated', atMs: 100, actorId: 'enemy', attackerId: 'han',
      attackId: 'han-right-foot', strength: 3,
    }]
    const plan = planPresentationBatch({ events, itemEffects: [], warningIds: [], points, lowEffect: false })

    expect(plan.effects.filter((effect) => effect.type === 'floating-text')).toHaveLength(3)
    expect(plan.effects.filter((effect) => effect.type === 'shake')).toEqual([
      expect.objectContaining({ strength: 3 }),
    ])
    expect(plan.effects.filter((effect) => effect.type === 'screen-flash')).toHaveLength(1)
    expect(plan.effects.filter((effect) => effect.type === 'burst').map((effect) =>
      effect.type === 'burst' ? effect.particleCount : 0,
    )).toEqual([6, 8, 12, 8, 12])
    expect(plan.confirmedHitCount).toBe(4)
    expect(plan.cues).toContain('defeat')
  })

  it('changes only burst particle count and shake amplitude in low-effect mode', () => {
    const normal = planPresentationBatch({ events: [hit(3)], itemEffects: [], warningIds: [], points, lowEffect: false })
    const low = planPresentationBatch({ events: [hit(3)], itemEffects: [], warningIds: [], points, lowEffect: true })

    expect(normal.effects).toContainEqual(expect.objectContaining({ type: 'burst', particleCount: 12 }))
    expect(low.effects).toContainEqual(expect.objectContaining({ type: 'burst', particleCount: 6 }))
    expect(low.effects.map((effect) => effect.type)).toEqual(
      normal.effects.map((effect) => effect.type),
    )
    expect(low.effects.filter((effect) => effect.type === 'trail')).toHaveLength(1)
    expect(low.effects.filter((effect) => effect.type === 'screen-flash')).toHaveLength(1)
    expect(low.effects.find((effect) => effect.type === 'burst')?.durationMs).toBe(
      normal.effects.find((effect) => effect.type === 'burst')?.durationMs,
    )
    expect(low.effects.find((effect) => effect.type === 'actor-flash')?.durationMs).toBe(
      normal.effects.find((effect) => effect.type === 'actor-flash')?.durationMs,
    )
    const normalShake = normal.effects.find((effect) => effect.type === 'shake')
    const lowShake = low.effects.find((effect) => effect.type === 'shake')
    expect(normalShake?.type === 'shake' ? normalShake.amplitude : 0).toBeGreaterThan(
      lowShake?.type === 'shake' ? lowShake.amplitude : 0,
    )
    expect(lowShake?.durationMs).toBe(normalShake?.durationMs)
    expect(low.cues).toEqual(normal.cues)
    expect(low.confirmedHitCount).toBe(normal.confirmedHitCount)
  })

  it('ignores duplicate or out-of-order presentation batch ids without resetting monotonicity', () => {
    const gate = new CombatVfxBatchGate()
    expect(gate.accept(1)).toBe(true)
    expect(gate.accept(1)).toBe(false)
    expect(gate.accept(0)).toBe(false)
    gate.resetTransient()
    expect(gate.accept(1)).toBe(false)
    expect(gate.accept(2)).toBe(true)
  })

  it('counts only player-confirmed hits for the presentation combo', () => {
    const enemyHit: CombatEvent = {
      type: 'hit-confirmed', atMs: 120, attackerId: 'enemy', targetId: 'han',
      attackId: 'enemy-jab', strength: 1, damage: 8,
    }
    const plan = planPresentationBatch({
      events: [hit(1), enemyHit], itemEffects: [], warningIds: [], points,
      playerId: 'han', lowEffect: false,
    })

    expect(plan.confirmedHitCount).toBe(1)
  })

  it('maps real warning edges once without mutating event or point snapshots', () => {
    const events = [hit(2)]
    const beforeEvents = structuredClone(events)
    const beforePoints = structuredClone(points)
    const plan = planPresentationBatch({
      events, itemEffects: [], warningIds: ['electric-puddle'], points,
      playerId: 'han', lowEffect: false,
    })

    expect(plan.effects).toContainEqual(expect.objectContaining({
      type: 'warning', warningId: 'electric-puddle',
    }))
    expect(plan.cues.filter((cue) => cue === 'hazard-warning')).toHaveLength(1)
    expect(events).toEqual(beforeEvents)
    expect(points).toEqual(beforePoints)
  })

  it('caps three overlapping strength-3 batches at 24 active spark particles', () => {
    const renderer = new CombatVfx(fakeScene() as never)
    const plan = planPresentationBatch({
      events: [hit(3)], itemEffects: [], warningIds: [], points,
      playerId: 'han', lowEffect: false,
    })

    expect(renderer.consume(1, plan)).toBe(true)
    expect(renderer.consume(2, plan)).toBe(true)
    expect(renderer.consume(3, plan)).toBe(true)
    expect(renderer.snapshot()).toMatchObject({
      activeBurstParticles: 24,
      activeTextCount: 3,
    })
  })
})
