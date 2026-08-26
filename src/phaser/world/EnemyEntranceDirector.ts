import type { Vec3 } from '../../domain/shared/types'
import type { ArenaBounds } from '../../domain/waves/waveDirector'

export const ENEMY_ENTRANCE_KINDS = [
  'side-left',
  'side-right',
  'doorway',
  'overhead',
] as const

export type EnemyEntranceKind = (typeof ENEMY_ENTRANCE_KINDS)[number]

/** Zero-based wave/enemy indexes keep the planner aligned with CombatScene runtime state. */
export interface EnemyEntranceRequest {
  readonly zoneId: string
  readonly waveIndex: number
  readonly enemyIndex: number
  readonly arena: Readonly<ArenaBounds>
}

/**
 * `delayMs` elapses before the directional cue. `landingDurationMs` is the
 * start-to-target travel window; for overhead entrances it is the actual fall.
 */
export interface EnemyEntrancePlan {
  readonly kind: EnemyEntranceKind
  readonly startPosition: Readonly<Vec3>
  readonly targetPosition: Readonly<Vec3>
  readonly delayMs: number
  readonly telegraphDurationMs: number
  readonly landingDurationMs: number
}

interface EntranceTiming {
  readonly telegraphDurationMs: number
  readonly landingDurationMs: number
}

const ENTRANCE_TIMINGS: Readonly<Record<EnemyEntranceKind, EntranceTiming>> = Object.freeze({
  'side-left': Object.freeze({ telegraphDurationMs: 90, landingDurationMs: 200 }),
  'side-right': Object.freeze({ telegraphDurationMs: 90, landingDurationMs: 200 }),
  doorway: Object.freeze({ telegraphDurationMs: 120, landingDurationMs: 230 }),
  overhead: Object.freeze({ telegraphDurationMs: 150, landingDurationMs: 260 }),
})

const LANE_RATIOS = [0.22, 0.5, 0.78] as const

const hashText = (value: string): number => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

const entranceSeed = (zoneId: string, waveIndex: number, enemyIndex: number): number =>
  (
    hashText(zoneId) ^
    Math.imul(waveIndex + 1, 0x9e37_79b1) ^
    Math.imul(enemyIndex + 1, 0x85eb_ca6b)
  ) >>> 0

const assertIndex = (label: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`)
  }
}

const assertArena = (arena: Readonly<ArenaBounds>): void => {
  if (![arena.minX, arena.maxX, arena.minY, arena.maxY].every(Number.isFinite)) {
    throw new RangeError('Enemy entrance arena bounds must be finite.')
  }
  if (arena.maxX <= arena.minX || arena.maxY <= arena.minY) {
    throw new RangeError('Enemy entrance arena bounds must have positive width and height.')
  }
}

const laneCoordinate = (minimum: number, maximum: number, lane: number): number =>
  Math.round(minimum + (maximum - minimum) * LANE_RATIOS[lane])

const freezePosition = (x: number, y: number, z: number): Readonly<Vec3> =>
  Object.freeze({ x, y, z })

/**
 * Pure deterministic belt-scroll entrance planner. It owns no timers, actors,
 * scaling, explosions, or Phaser objects, so callers retain normal-sized actor
 * readability while scheduling and rendering the returned motion independently.
 */
export const planEnemyEntrance = (
  request: Readonly<EnemyEntranceRequest>,
): EnemyEntrancePlan => {
  const zoneId = request.zoneId.trim()
  if (zoneId.length === 0) throw new Error('Enemy entrance zoneId must be non-empty.')
  assertIndex('Enemy entrance waveIndex', request.waveIndex)
  assertIndex('Enemy entrance enemyIndex', request.enemyIndex)
  assertArena(request.arena)

  const seed = entranceSeed(zoneId, request.waveIndex, request.enemyIndex)
  const kind = ENEMY_ENTRANCE_KINDS[seed & 3]
  const timing = ENTRANCE_TIMINGS[kind]
  const horizontalLane = (seed >>> 4) % LANE_RATIOS.length
  const depthLane = (seed >>> 8) % LANE_RATIOS.length
  const width = request.arena.maxX - request.arena.minX
  const height = request.arena.maxY - request.arena.minY
  const sideMargin = Math.max(48, Math.min(72, Math.round(width * 0.16)))
  const doorwayMargin = Math.max(42, Math.min(64, Math.round(height * 0.4)))
  const edgeInset = Math.max(28, Math.min(64, Math.round(width * 0.12)))
  const targetY = laneCoordinate(request.arena.minY, request.arena.maxY, depthLane)
  const delayMs = (request.enemyIndex % 4) * 45

  let startPosition: Readonly<Vec3>
  let targetPosition: Readonly<Vec3>

  if (kind === 'side-left') {
    startPosition = freezePosition(request.arena.minX - sideMargin, targetY, 0)
    targetPosition = freezePosition(request.arena.minX + edgeInset, targetY, 0)
  } else if (kind === 'side-right') {
    startPosition = freezePosition(request.arena.maxX + sideMargin, targetY, 0)
    targetPosition = freezePosition(request.arena.maxX - edgeInset, targetY, 0)
  } else if (kind === 'doorway') {
    const targetX = laneCoordinate(request.arena.minX, request.arena.maxX, horizontalLane)
    const doorwayDepth = Math.max(24, Math.min(40, Math.round(height * 0.24)))
    startPosition = freezePosition(targetX, request.arena.minY - doorwayMargin, 0)
    targetPosition = freezePosition(targetX, request.arena.minY + doorwayDepth, 0)
  } else {
    const targetX = laneCoordinate(request.arena.minX, request.arena.maxX, horizontalLane)
    const dropHeight = 144 + ((seed >>> 12) % 3) * 24
    targetPosition = freezePosition(targetX, targetY, 0)
    startPosition = freezePosition(targetX, targetY, dropHeight)
  }

  return Object.freeze({
    kind,
    startPosition,
    targetPosition,
    delayMs,
    telegraphDurationMs: timing.telegraphDurationMs,
    landingDurationMs: timing.landingDurationMs,
  })
}
