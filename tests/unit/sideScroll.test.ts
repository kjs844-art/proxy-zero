import { describe, expect, it } from 'vitest'

import {
  cameraTargetX,
  clampCameraTargetX,
  hasCrossedGate,
  isPastGate,
  normalizeWorldBounds,
  resolveCameraFollowX,
  segmentAt,
  segmentClampBounds,
  worldToScreenX,
  type SideScrollSegment,
} from '../../src/domain/world/sideScroll'

const world = { minX: 0, maxX: 1_920 }
const segments: readonly SideScrollSegment[] = [
  { id: 'a', minX: 0, maxX: 640 },
  { id: 'b', minX: 640, maxX: 1_280 },
  { id: 'c', minX: 1_280, maxX: 1_920 },
]

describe('deterministic side-scroll helpers', () => {
  it('normalizes reversed and non-finite world bounds defensively', () => {
    expect(normalizeWorldBounds({ minX: 400, maxX: 100 })).toEqual({ minX: 100, maxX: 400 })
    expect(normalizeWorldBounds({ minX: Number.NaN, maxX: Number.POSITIVE_INFINITY })).toEqual({
      minX: 0,
      maxX: 0,
    })
  })

  it('centers the followed point and clamps the camera to both world edges', () => {
    expect(cameraTargetX(320)).toBe(0)
    expect(resolveCameraFollowX(320, world)).toBe(0)
    expect(resolveCameraFollowX(1_600, world)).toBe(1_280)
    expect(resolveCameraFollowX(-100, world)).toBe(0)
    expect(resolveCameraFollowX(960, { minX: 0, maxX: 500 })).toBe(0)
    expect(clampCameraTargetX(Number.NaN, world)).toBe(0)
  })

  it('supports finite viewport and follow offsets without allowing invalid values through', () => {
    expect(cameraTargetX(500, 400, 20)).toBe(320)
    expect(resolveCameraFollowX(500, world, 400, 20)).toBe(320)
    expect(resolveCameraFollowX(Number.NaN, world, Number.NaN, Number.POSITIVE_INFINITY)).toBe(0)
    expect(worldToScreenX(1_000, 640)).toBe(360)
    expect(worldToScreenX(Number.NaN, Number.NaN)).toBe(0)
  })

  it('finds the authored segment deterministically at contiguous boundaries', () => {
    expect(segmentAt(0, segments)?.id).toBe('a')
    expect(segmentAt(640, segments)?.id).toBe('a')
    expect(segmentAt(641, segments)?.id).toBe('b')
    expect(segmentAt(1_920, segments)?.id).toBe('c')
    expect(segmentAt(Number.NaN, segments)).toBeNull()
    expect(segmentAt(2_000, segments)).toBeNull()
  })

  it('clips segment movement to world bounds and collapses a disjoint segment safely', () => {
    expect(segmentClampBounds({ minX: 500, maxX: 900 }, world)).toEqual({ minX: 500, maxX: 900 })
    expect(segmentClampBounds({ minX: -100, maxX: 100 }, world)).toEqual({ minX: 0, maxX: 100 })
    expect(segmentClampBounds({ minX: 2_000, maxX: 2_100 }, world)).toEqual({ minX: 0, maxX: 0 })
    expect(segmentClampBounds({ minX: 900, maxX: 500 })).toEqual({ minX: 500, maxX: 900 })
  })

  it('detects forward, backward, and bidirectional gate crossings exactly once', () => {
    expect(hasCrossedGate(639, 640, 640)).toBe(true)
    expect(hasCrossedGate(640, 641, 640)).toBe(false)
    expect(hasCrossedGate(641, 640, 640, 'backward')).toBe(true)
    expect(hasCrossedGate(640, 639, 640, 'backward')).toBe(false)
    expect(hasCrossedGate(641, 639, 640, 'either')).toBe(true)
    expect(hasCrossedGate(Number.NaN, 641, 640)).toBe(false)
  })

  it('reports whether the current point is already past a gate', () => {
    expect(isPastGate(640, 640)).toBe(true)
    expect(isPastGate(639, 640)).toBe(false)
    expect(isPastGate(640, 640, 'backward')).toBe(true)
    expect(isPastGate(641, 640, 'backward')).toBe(false)
    expect(isPastGate(640, 640, 'either')).toBe(false)
    expect(isPastGate(Number.POSITIVE_INFINITY, 640)).toBe(false)
  })
})
