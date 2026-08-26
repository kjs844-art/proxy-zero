import { describe, expect, it } from 'vitest'

import {
  ENEMY_ENTRANCE_KINDS,
  planEnemyEntrance,
  type EnemyEntranceKind,
} from '../../src/phaser/world/EnemyEntranceDirector'
import type { ArenaBounds } from '../../src/domain/waves/waveDirector'

const arena: ArenaBounds = { minX: 48, maxX: 592, minY: 188, maxY: 320 }

const planFor = (
  enemyIndex: number,
  overrides: Partial<Parameters<typeof planEnemyEntrance>[0]> = {},
) => planEnemyEntrance({
  zoneId: 'n9-depot',
  waveIndex: 0,
  enemyIndex,
  arena,
  ...overrides,
})

const plansByKind = (): ReadonlyMap<EnemyEntranceKind, ReturnType<typeof planEnemyEntrance>> =>
  new Map(Array.from({ length: 4 }, (_, enemyIndex) => {
    const plan = planFor(enemyIndex)
    return [plan.kind, plan] as const
  }))

describe('EnemyEntranceDirector', () => {
  it('returns the same immutable plan for the same inputs without mutating arena bounds', () => {
    const before = structuredClone(arena)
    const first = planFor(2)
    const second = planFor(2)

    expect(second).toEqual(first)
    expect(arena).toEqual(before)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.startPosition)).toBe(true)
    expect(Object.isFrozen(first.targetPosition)).toBe(true)
  })

  it('covers all four entrance directions across four enemy indexes', () => {
    const kinds = Array.from(plansByKind().keys()).sort()

    expect(kinds).toEqual([...ENEMY_ENTRANCE_KINDS].sort())
  })

  it('places every target on the arena floor and starts each kind from its readable origin', () => {
    const byKind = plansByKind()

    for (const plan of byKind.values()) {
      expect(plan.targetPosition.x).toBeGreaterThanOrEqual(arena.minX)
      expect(plan.targetPosition.x).toBeLessThanOrEqual(arena.maxX)
      expect(plan.targetPosition.y).toBeGreaterThanOrEqual(arena.minY)
      expect(plan.targetPosition.y).toBeLessThanOrEqual(arena.maxY)
      expect(plan.targetPosition.z).toBe(0)
    }

    const sideLeft = byKind.get('side-left')
    expect(sideLeft?.startPosition.x).toBeLessThan(arena.minX)
    expect(sideLeft?.startPosition.z).toBe(0)
    const sideRight = byKind.get('side-right')
    expect(sideRight?.startPosition.x).toBeGreaterThan(arena.maxX)
    expect(sideRight?.startPosition.z).toBe(0)
    const doorway = byKind.get('doorway')
    expect(doorway?.startPosition.y).toBeLessThan(arena.minY)
    expect(doorway?.startPosition.z).toBe(0)
    const overhead = byKind.get('overhead')
    expect(overhead?.startPosition.x).toBe(overhead?.targetPosition.x)
    expect(overhead?.startPosition.y).toBe(overhead?.targetPosition.y)
    expect(overhead?.startPosition.z).toBeGreaterThan(0)
  })

  it('keeps entrance cues brief while giving overhead drops the clearest warning', () => {
    const byKind = plansByKind()
    const expected = {
      'side-left': { telegraphDurationMs: 90, landingDurationMs: 200 },
      'side-right': { telegraphDurationMs: 90, landingDurationMs: 200 },
      doorway: { telegraphDurationMs: 120, landingDurationMs: 230 },
      overhead: { telegraphDurationMs: 150, landingDurationMs: 260 },
    } as const

    for (const kind of ENEMY_ENTRANCE_KINDS) {
      expect(byKind.get(kind)).toMatchObject(expected[kind])
    }
    expect(Array.from({ length: 4 }, (_, enemyIndex) => planFor(enemyIndex).delayMs)).toEqual([
      0, 45, 90, 135,
    ])
  })

  it('preserves its layout when the arena is translated to a later scrolling section', () => {
    const shiftedArena: ArenaBounds = {
      minX: arena.minX + 640,
      maxX: arena.maxX + 640,
      minY: arena.minY,
      maxY: arena.maxY,
    }
    const base = planFor(1)
    const shifted = planFor(1, { arena: shiftedArena })

    expect(shifted.kind).toBe(base.kind)
    expect(shifted.startPosition).toEqual({
      ...base.startPosition,
      x: base.startPosition.x + 640,
    })
    expect(shifted.targetPosition).toEqual({
      ...base.targetPosition,
      x: base.targetPosition.x + 640,
    })
  })

  it('rejects malformed indexes, zone IDs, and arena bounds at the integration boundary', () => {
    expect(() => planFor(0, { zoneId: '  ' })).toThrowError(
      'Enemy entrance zoneId must be non-empty.',
    )
    expect(() => planFor(0, { waveIndex: -1 })).toThrowError(
      'Enemy entrance waveIndex must be a non-negative safe integer.',
    )
    expect(() => planFor(0, { enemyIndex: 0.5 })).toThrowError(
      'Enemy entrance enemyIndex must be a non-negative safe integer.',
    )
    expect(() => planFor(0, {
      arena: { ...arena, maxX: Number.NaN },
    })).toThrowError('Enemy entrance arena bounds must be finite.')
    expect(() => planFor(0, {
      arena: { ...arena, minY: arena.maxY },
    })).toThrowError('Enemy entrance arena bounds must have positive width and height.')
  })
})
