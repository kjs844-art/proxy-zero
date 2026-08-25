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
  readonly lineStyles: Array<{ width: number; color: number; alpha: number | undefined }> = []
  readonly fillStyles: Array<{ color: number; alpha: number | undefined }> = []
  readonly lineSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  lineSegmentCount = 0

  clear(): this { return this }
  fillCircle(_x: number, _y: number, _radius: number): this { return this }
  fillRect(_x: number, _y: number, _width: number, _height: number): this { return this }
  fillStyle(color: number, alpha?: number): this {
    this.fillStyles.push({ color, alpha })
    return this
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.lineSegmentCount += 1
    this.lineSegments.push({ x1, y1, x2, y2 })
    return this
  }
  lineStyle(width: number, color: number, alpha?: number): this {
    this.lineStyles.push({ width, color, alpha })
    return this
  }
}

const fakeScene = () => {
  const graphics: FakeGraphics[] = []
  return {
    add: {
      graphics: () => {
        const object = new FakeGraphics()
        graphics.push(object)
        return object
      },
      text: () => new FakeDisplay(),
    },
    cameras: { main: { scrollX: 0, scrollY: 0, setScroll: () => undefined } },
    graphics,
  }
}

const points: Readonly<Record<string, ActorPresentationPoint>> = {
  han: { x: 220, y: 220, facing: 1 },
  enemy: { x: 270, y: 220, facing: -1 },
}

const hit = (strength: number, damage = 12): CombatEvent => ({
  type: 'hit-confirmed', atMs: 100, attackerId: 'han', targetId: 'enemy',
  attackId: 'han-right-hand', strength, damage,
})

const attackStarted = (attackId: string, strength = 1): CombatEvent => ({
  type: 'attack-started',
  atMs: 100,
  actorId: 'han',
  attackId,
  strength,
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

  it('layers a finisher spark, impact ring, trail, restrained afterimage, and brief shake', () => {
    const normal = planPresentationBatch({
      events: [attackStarted('han-iron-tempest', 3), hit(3)],
      itemEffects: [], warningIds: [], points, playerId: 'han', lowEffect: false,
    })
    const low = planPresentationBatch({
      events: [attackStarted('han-iron-tempest', 3), hit(3)],
      itemEffects: [], warningIds: [], points, playerId: 'han', lowEffect: true,
    })

    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'burst', strength: 3, particleCount: 12,
    }))
    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'ring', radius: 32, durationMs: 125,
    }))
    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'trail', strength: 3,
    }))
    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'afterimage', strength: 3, durationMs: 145,
    }))
    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'screen-flash', alpha: 0.14, durationMs: 55,
    }))
    expect(normal.effects).toContainEqual(expect.objectContaining({
      type: 'shake', strength: 3, amplitude: 4.2, durationMs: 105,
    }))

    expect(low.effects.some((effect) => effect.type === 'afterimage')).toBe(false)
    expect(low.effects).toContainEqual(expect.objectContaining({
      type: 'screen-flash', alpha: 0.06,
    }))
    expect(low.effects).toContainEqual(expect.objectContaining({
      type: 'shake', strength: 3, amplitude: 1.26, durationMs: 105,
    }))
  })

  it('sends each anatomical limb cue toward the fighter-facing direction', () => {
    const forward = planPresentationBatch({
      events: [attackStarted('han-left-foot')],
      itemEffects: [],
      warningIds: [],
      points: { han: { x: 220, y: 220, facing: 1 } },
      lowEffect: false,
    }).effects.find((effect) => effect.type === 'trail')
    const backward = planPresentationBatch({
      events: [attackStarted('han-right-hand')],
      itemEffects: [],
      warningIds: [],
      points: { han: { x: 220, y: 220, facing: -1 } },
      lowEffect: false,
    }).effects.find((effect) => effect.type === 'trail')

    expect(forward).toMatchObject({ type: 'trail', from: { x: 220 }, to: { x: 258 } })
    expect(backward).toMatchObject({ type: 'trail', from: { x: 220 }, to: { x: 194 } })
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

  it('renders hot-core spark layers and the finisher echo with graphics primitives', () => {
    const scene = fakeScene()
    const renderer = new CombatVfx(scene as never)
    const plan = planPresentationBatch({
      events: [attackStarted('han-iron-tempest', 3), hit(3)],
      itemEffects: [], warningIds: [], points, playerId: 'han', lowEffect: false,
    })

    expect(renderer.consume(1, plan)).toBe(true)
    renderer.update(16)

    const world = scene.graphics[0]
    expect(Math.max(...world.lineStyles.map((entry) => entry.width))).toBeGreaterThanOrEqual(6)
    expect(world.lineStyles).toContainEqual(expect.objectContaining({ color: 0xffffff }))
    expect(world.fillStyles).toContainEqual(expect.objectContaining({ color: 0xffffff }))
    expect(world.lineSegmentCount).toBeGreaterThan(30)
    expect(Math.max(...world.lineSegments.flatMap((segment) => [segment.y1, segment.y2]))).toBe(
      points.han.y + 43,
    )
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

  it('caps active afterimages and total graphics effects during noisy batches', () => {
    const renderer = new CombatVfx(fakeScene() as never)
    const finisher = planPresentationBatch({
      events: [attackStarted('han-iron-tempest', 3)],
      itemEffects: [], warningIds: [], points, playerId: 'han', lowEffect: false,
    })
    for (let batchId = 1; batchId <= 5; batchId += 1) {
      expect(renderer.consume(batchId, finisher)).toBe(true)
    }
    expect(renderer.snapshot()).toMatchObject({
      activeAfterimageCount: 3,
      activeTrailCount: 5,
    })

    const warningIds = Array.from({ length: 50 }, (): 'train-gap' => 'train-gap')
    const noise = planPresentationBatch({
      events: [], itemEffects: [], warningIds, points, playerId: 'han', lowEffect: false,
    })
    expect(renderer.consume(6, noise)).toBe(true)
    expect(renderer.snapshot().activeEffectCount).toBe(32)
  })

  it('disposes safely after Phaser has already released the scene camera', () => {
    const scene = fakeScene()
    const renderer = new CombatVfx(scene as never)
    Reflect.deleteProperty(scene.cameras, 'main')

    expect(() => renderer.dispose()).not.toThrow()
  })
})
