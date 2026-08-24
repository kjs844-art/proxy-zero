import type { Vec3 } from '../shared/types'

export type TrainHazardPhase = 'safe' | 'warning' | 'open' | 'recover'

export interface TrainHazardState {
  readonly elapsedMs: number
  readonly platformCenterX: number
  readonly retriggerImmunityRemainingMs: number
}

export interface TrainHazardPlayerSnapshot {
  readonly x: number
  readonly y: number
  readonly grounded: boolean
}

export interface PlayerFellEffect {
  readonly type: 'player-fell'
  readonly damage: 18
  readonly recoveryPosition: Vec3
  readonly knockdownMs: 850
}

export interface TrainHazardStepResult {
  readonly state: TrainHazardState
  readonly carryDeltaX: number
  readonly effects: readonly PlayerFellEffect[]
}

export const TRAIN_HAZARD_PERIOD_MS = 6_000
export const TRAIN_HAZARD_RECT = Object.freeze({
  minX: 246,
  maxX: 394,
  minY: 252,
  maxY: 320,
})
export const TRAIN_SAFE_LANE = Object.freeze({ minY: 188, maxY: 244 })
export const TRAIN_PLATFORM_WIDTH = 112
export const TRAIN_PLATFORM_MIN_X = 278
export const TRAIN_PLATFORM_MAX_X = 362
export const TRAIN_PLATFORM_SPEED_PX_PER_SECOND = 56
export const TRAIN_FALL_IMMUNITY_MS = 1_500

const platformCenterAt = (elapsedMs: number): number => {
  const local = ((elapsedMs % 3_000) + 3_000) % 3_000
  return local < 1_500
    ? TRAIN_PLATFORM_MIN_X + (local / 1_000) * TRAIN_PLATFORM_SPEED_PX_PER_SECOND
    : TRAIN_PLATFORM_MAX_X - ((local - 1_500) / 1_000) * TRAIN_PLATFORM_SPEED_PX_PER_SECOND
}

export const createTrainHazardState = (): TrainHazardState => ({
  elapsedMs: 0,
  platformCenterX: TRAIN_PLATFORM_MIN_X,
  retriggerImmunityRemainingMs: 0,
})

export const getTrainHazardPhase = (
  state: Readonly<TrainHazardState>,
): TrainHazardPhase => {
  const elapsed = ((state.elapsedMs % TRAIN_HAZARD_PERIOD_MS) + TRAIN_HAZARD_PERIOD_MS) %
    TRAIN_HAZARD_PERIOD_MS
  if (elapsed < 3_000) return 'safe'
  if (elapsed < 4_000) return 'warning'
  if (elapsed < 5_500) return 'open'
  return 'recover'
}

const nextPhaseBoundary = (elapsedMs: number): number => {
  if (elapsedMs < 3_000) return 3_000
  if (elapsedMs < 4_000) return 4_000
  if (elapsedMs < 5_500) return 5_500
  return 6_000
}

const nextPlatformBoundary = (elapsedMs: number): number => {
  const local = elapsedMs % 3_000
  return elapsedMs + (local < 1_500 ? 1_500 - local : 3_000 - local)
}

const inHazardLane = (player: Readonly<TrainHazardPlayerSnapshot>): boolean =>
  player.y >= TRAIN_HAZARD_RECT.minY && player.y <= TRAIN_HAZARD_RECT.maxY

const platformSupports = (
  playerX: number,
  player: Readonly<TrainHazardPlayerSnapshot>,
  platformCenterX: number,
): boolean =>
  player.grounded &&
  inHazardLane(player) &&
  playerX >= platformCenterX - TRAIN_PLATFORM_WIDTH / 2 &&
  playerX <= platformCenterX + TRAIN_PLATFORM_WIDTH / 2

const untilPlatformSupportEntry = (
  playerX: number,
  player: Readonly<TrainHazardPlayerSnapshot>,
  elapsedMs: number,
  platformCenterX: number,
): number => {
  if (
    !player.grounded ||
    !inHazardLane(player) ||
    platformSupports(playerX, player, platformCenterX)
  ) {
    return Number.POSITIVE_INFINITY
  }

  const halfWidth = TRAIN_PLATFORM_WIDTH / 2
  const speedPerMs = TRAIN_PLATFORM_SPEED_PX_PER_SECOND / 1_000
  const local = ((elapsedMs % 3_000) + 3_000) % 3_000
  if (local < 1_500) {
    const entryCenterX = playerX - halfWidth
    if (entryCenterX > platformCenterX && entryCenterX <= TRAIN_PLATFORM_MAX_X) {
      return (entryCenterX - platformCenterX) / speedPerMs
    }
  } else {
    const entryCenterX = playerX + halfWidth
    if (entryCenterX < platformCenterX && entryCenterX >= TRAIN_PLATFORM_MIN_X) {
      return (platformCenterX - entryCenterX) / speedPerMs
    }
  }

  return Number.POSITIVE_INFINITY
}

const canFall = (
  playerX: number,
  player: Readonly<TrainHazardPlayerSnapshot>,
  platformCenterX: number,
): boolean =>
  player.grounded &&
  playerX >= TRAIN_HAZARD_RECT.minX &&
  playerX <= TRAIN_HAZARD_RECT.maxX &&
  inHazardLane(player) &&
  !platformSupports(playerX, player, platformCenterX)

/** Pure post-hitstop hazard clock and effect emitter. */
export const stepTrainHazard = (
  incoming: Readonly<TrainHazardState>,
  input: {
    readonly activeDeltaMs: number
    readonly player: Readonly<TrainHazardPlayerSnapshot>
  },
): TrainHazardStepResult => {
  if (!Number.isFinite(input.activeDeltaMs) || input.activeDeltaMs <= 0) {
    return { state: incoming as TrainHazardState, carryDeltaX: 0, effects: [] }
  }

  let elapsedMs = incoming.elapsedMs
  let remainingMs = input.activeDeltaMs
  let immunityMs = Math.max(0, incoming.retriggerImmunityRemainingMs)
  let playerX = input.player.x
  let carryDeltaX = 0
  const effects: PlayerFellEffect[] = []

  while (remainingMs > 0) {
    const platformCenterX = platformCenterAt(elapsedMs)
    if (
      getTrainHazardPhase({
        elapsedMs,
        platformCenterX,
        retriggerImmunityRemainingMs: immunityMs,
      }) === 'open' &&
      immunityMs === 0 &&
      canFall(playerX, input.player, platformCenterX)
    ) {
      effects.push({
        type: 'player-fell',
        damage: 18,
        recoveryPosition: {
          x: Math.min(576, Math.max(64, input.player.x)),
          y: 236,
          z: 0,
        },
        knockdownMs: 850,
      })
      immunityMs = TRAIN_FALL_IMMUNITY_MS
    }

    const localElapsed = elapsedMs % TRAIN_HAZARD_PERIOD_MS
    const untilPhaseBoundary = nextPhaseBoundary(localElapsed) - localElapsed
    const untilPlatformBoundary = nextPlatformBoundary(elapsedMs) - elapsedMs
    const untilSupportEntry = untilPlatformSupportEntry(
      playerX,
      input.player,
      elapsedMs,
      platformCenterX,
    )
    const untilImmunityExpiry = immunityMs > 0 ? immunityMs : Number.POSITIVE_INFINITY
    const stepMs = Math.min(
      remainingMs,
      untilPhaseBoundary,
      untilPlatformBoundary,
      untilSupportEntry,
      untilImmunityExpiry,
    )
    const supported = platformSupports(playerX, input.player, platformCenterX)
    const nextElapsedMs = elapsedMs + stepMs
    const nextPlatformCenterX = platformCenterAt(nextElapsedMs)
    if (supported) {
      const carry = nextPlatformCenterX - platformCenterX
      playerX += carry
      carryDeltaX += carry
    }
    immunityMs = Math.max(0, immunityMs - stepMs)
    elapsedMs = nextElapsedMs
    remainingMs -= stepMs

    if (elapsedMs >= TRAIN_HAZARD_PERIOD_MS) elapsedMs %= TRAIN_HAZARD_PERIOD_MS
  }

  return {
    state: {
      elapsedMs,
      platformCenterX: platformCenterAt(elapsedMs),
      retriggerImmunityRemainingMs: immunityMs,
    },
    carryDeltaX,
    effects,
  }
}
