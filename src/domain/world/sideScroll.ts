/** The logical width used by the arcade canvas and by camera calculations. */
export const SIDE_SCROLL_VIEWPORT_WIDTH = 640

export interface HorizontalBounds {
  readonly minX: number
  readonly maxX: number
}

/** A deterministic authored slice of a horizontally scrolling zone. */
export interface SideScrollSegment extends HorizontalBounds {
  readonly id?: string
}

export type GateDirection = 'forward' | 'backward' | 'either'

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback

const positiveOr = (value: number, fallback: number): number => {
  const finite = finiteOr(value, fallback)
  return finite > 0 ? finite : fallback
}

const orderedBounds = (bounds: Readonly<HorizontalBounds>): HorizontalBounds => {
  const first = finiteOr(bounds.minX, 0)
  const second = finiteOr(bounds.maxX, first)
  return second >= first
    ? { minX: first, maxX: second }
    : { minX: second, maxX: first }
}

/** Normalizes malformed or non-finite world bounds without throwing. */
export const normalizeWorldBounds = (
  bounds: Readonly<HorizontalBounds>,
): HorizontalBounds => orderedBounds(bounds)

/**
 * Clamps a camera's horizontal scroll target to the legal world range.
 *
 * `targetX` is the left edge of the viewport, not the player's center. A
 * world narrower than the viewport stays pinned to its minimum x coordinate.
 */
export const clampCameraTargetX = (
  targetX: number,
  worldBounds: Readonly<HorizontalBounds>,
  viewportWidth = SIDE_SCROLL_VIEWPORT_WIDTH,
): number => {
  const world = normalizeWorldBounds(worldBounds)
  const viewport = positiveOr(viewportWidth, SIDE_SCROLL_VIEWPORT_WIDTH)
  const maxScrollX = Math.max(world.minX, world.maxX - viewport)
  const target = finiteOr(targetX, world.minX)
  return Math.min(maxScrollX, Math.max(world.minX, target))
}

/** Returns the preferred left-edge scroll target for a followed world point. */
export const cameraTargetX = (
  followX: number,
  viewportWidth = SIDE_SCROLL_VIEWPORT_WIDTH,
  followOffsetX = 0,
): number => {
  const viewport = positiveOr(viewportWidth, SIDE_SCROLL_VIEWPORT_WIDTH)
  const follow = finiteOr(followX, viewport / 2)
  return follow - viewport / 2 + finiteOr(followOffsetX, 0)
}

/** Computes a clamped left-edge camera position from a followed world point. */
export const resolveCameraFollowX = (
  followX: number,
  worldBounds: Readonly<HorizontalBounds>,
  viewportWidth = SIDE_SCROLL_VIEWPORT_WIDTH,
  followOffsetX = 0,
): number => clampCameraTargetX(
  cameraTargetX(followX, viewportWidth, followOffsetX),
  worldBounds,
  viewportWidth,
)

/** Converts a world x coordinate into the camera's logical screen x coordinate. */
export const worldToScreenX = (worldX: number, cameraX: number): number =>
  finiteOr(worldX, 0) - finiteOr(cameraX, 0)

/** Returns the legal movement clamp for one authored segment, optionally clipped to the world. */
export const segmentClampBounds = (
  segment: Readonly<HorizontalBounds>,
  worldBounds?: Readonly<HorizontalBounds>,
): HorizontalBounds => {
  const segmentBounds = orderedBounds(segment)
  if (!worldBounds) return segmentBounds

  const world = normalizeWorldBounds(worldBounds)
  const minX = Math.max(segmentBounds.minX, world.minX)
  const maxX = Math.min(segmentBounds.maxX, world.maxX)
  return minX <= maxX
    ? { minX, maxX }
    : { minX: world.minX, maxX: world.minX }
}

/** Finds the authored segment containing a finite world x coordinate. */
export const segmentAt = (
  worldX: number,
  segments: readonly Readonly<SideScrollSegment>[],
): Readonly<SideScrollSegment> | null => {
  if (!Number.isFinite(worldX)) return null
  return segments.find((segment) => {
    const bounds = orderedBounds(segment)
    return worldX >= bounds.minX && worldX <= bounds.maxX
  }) ?? null
}

/** Returns whether movement crossed a gate during one deterministic step. */
export const hasCrossedGate = (
  previousX: number,
  currentX: number,
  gateX: number,
  direction: GateDirection = 'forward',
): boolean => {
  if (![previousX, currentX, gateX].every(Number.isFinite)) return false
  if (direction === 'forward') return previousX < gateX && currentX >= gateX
  if (direction === 'backward') return previousX > gateX && currentX <= gateX
  return (
    (previousX < gateX && currentX >= gateX) ||
    (previousX > gateX && currentX <= gateX)
  )
}

/** Returns whether a point is already beyond a gate in the requested direction. */
export const isPastGate = (
  worldX: number,
  gateX: number,
  direction: GateDirection = 'forward',
): boolean => {
  if (![worldX, gateX].every(Number.isFinite)) return false
  if (direction === 'backward') return worldX <= gateX
  if (direction === 'either') return worldX !== gateX
  return worldX >= gateX
}
