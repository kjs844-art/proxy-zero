import type { Vec3 } from '../shared/types'

export type PuddlePhase = 'safe' | 'warning' | 'live' | 'recover'
export type TunnelTrainPhase = 'idle' | 'warning' | 'sweep' | 'recover'

export interface TunnelHazardState {
  readonly elapsedMs: number
  readonly puddleHitPlayer: boolean
  readonly trainHitTargetIds: readonly string[]
}

export interface TunnelHazardTargetSnapshot {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly grounded: boolean
}

export interface EnvironmentalReaction {
  readonly type: 'hitstun' | 'knockdown'
  readonly durationMs: number
}

export type TunnelHazardEffect =
  | {
      readonly type: 'puddle-hit'
      readonly actorId: string
      readonly damage: 12
      readonly recoveryPosition: Vec3
      readonly reaction: { readonly type: 'hitstun'; readonly durationMs: 300 }
    }
  | {
      readonly type: 'train-hit'
      readonly actorId: string
      readonly damage: 24 | 60
      readonly recoveryPosition: Vec3
      readonly reaction: { readonly type: 'knockdown'; readonly durationMs: 850 }
    }

export interface TunnelHazardResult {
  readonly state: TunnelHazardState
  readonly effects: readonly TunnelHazardEffect[]
}

export const TUNNEL_HAZARD_PERIOD_MS = 14_000
export const PUDDLE_RECT = Object.freeze({ minX: 80, maxX: 560, minY: 246, maxY: 320 })
export const PUDDLE_SAFE_LANE = Object.freeze({ minY: 188, maxY: 240 })
export const TUNNEL_TRAIN_RECT = Object.freeze({ minX: 48, maxX: 592, minY: 188, maxY: 244 })
export const TUNNEL_TRAIN_SAFE_LANE = Object.freeze({ minY: 246, maxY: 320 })

export const createTunnelHazardState = (): TunnelHazardState => ({
  elapsedMs: 0,
  puddleHitPlayer: false,
  trainHitTargetIds: [],
})

const localTime = (state: Readonly<TunnelHazardState>): number =>
  ((state.elapsedMs % TUNNEL_HAZARD_PERIOD_MS) + TUNNEL_HAZARD_PERIOD_MS) %
  TUNNEL_HAZARD_PERIOD_MS

export const getPuddlePhase = (state: Readonly<TunnelHazardState>): PuddlePhase => {
  const elapsedMs = localTime(state)
  if (elapsedMs < 3_000) return 'safe'
  if (elapsedMs < 4_000) return 'warning'
  if (elapsedMs < 6_000) return 'live'
  if (elapsedMs < 7_000) return 'recover'
  return 'safe'
}

export const getTunnelTrainPhase = (
  state: Readonly<TunnelHazardState>,
): TunnelTrainPhase => {
  const elapsedMs = localTime(state)
  if (elapsedMs < 11_000) return 'idle'
  if (elapsedMs < 12_500) return 'warning'
  if (elapsedMs < 13_300) return 'sweep'
  return 'recover'
}

const nextBoundary = (elapsedMs: number): number => {
  for (const boundary of [3_000, 4_000, 6_000, 7_000, 11_000, 12_500, 13_300, 14_000]) {
    if (elapsedMs < boundary) return boundary
  }
  return 14_000
}

const inside = (
  target: Readonly<TunnelHazardTargetSnapshot>,
  rect: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>,
): boolean =>
  target.grounded &&
  target.x >= rect.minX && target.x <= rect.maxX &&
  target.y >= rect.minY && target.y <= rect.maxY

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Pure post-hitstop clock. It emits immutable reducer commands but owns no HP. */
export const stepTunnelHazard = (
  incoming: Readonly<TunnelHazardState>,
  input: {
    readonly activeDeltaMs: number
    readonly player: Readonly<TunnelHazardTargetSnapshot>
    readonly bosses: readonly Readonly<TunnelHazardTargetSnapshot>[]
  },
): TunnelHazardResult => {
  if (!Number.isFinite(input.activeDeltaMs) || input.activeDeltaMs <= 0) {
    return { state: incoming as TunnelHazardState, effects: [] }
  }

  let elapsedMs = localTime(incoming)
  let remainingMs = input.activeDeltaMs
  let puddleHitPlayer = incoming.puddleHitPlayer
  let trainHitTargetIds = new Set(incoming.trainHitTargetIds)
  const effects: TunnelHazardEffect[] = []

  while (remainingMs > 0) {
    const phaseState: TunnelHazardState = {
      elapsedMs,
      puddleHitPlayer,
      trainHitTargetIds: [...trainHitTargetIds],
    }
    if (getPuddlePhase(phaseState) === 'live' && !puddleHitPlayer && inside(input.player, PUDDLE_RECT)) {
      effects.push({
        type: 'puddle-hit', actorId: input.player.id, damage: 12,
        recoveryPosition: {
          x: clamp(input.player.x, PUDDLE_RECT.minX, PUDDLE_RECT.maxX),
          y: PUDDLE_SAFE_LANE.maxY,
          z: 0,
        },
        reaction: { type: 'hitstun', durationMs: 300 },
      })
      puddleHitPlayer = true
    }

    if (getTunnelTrainPhase(phaseState) === 'sweep') {
      const targets = [
        input.player,
        ...[...input.bosses].sort((left, right) => left.id.localeCompare(right.id)),
      ].filter((target) => inside(target, TUNNEL_TRAIN_RECT))
      for (const target of targets) {
        if (trainHitTargetIds.has(target.id)) continue
        const isPlayer = target.id === input.player.id
        effects.push({
          type: 'train-hit', actorId: target.id, damage: isPlayer ? 24 : 60,
          recoveryPosition: {
            x: clamp(target.x, TUNNEL_TRAIN_RECT.minX, TUNNEL_TRAIN_RECT.maxX),
            y: 264,
            z: 0,
          },
          reaction: { type: 'knockdown', durationMs: 850 },
        })
        trainHitTargetIds.add(target.id)
      }
    }

    const untilBoundary = nextBoundary(elapsedMs) - elapsedMs
    const stepMs = Math.min(remainingMs, untilBoundary)
    elapsedMs += stepMs
    remainingMs -= stepMs
    if (elapsedMs >= TUNNEL_HAZARD_PERIOD_MS) {
      elapsedMs = 0
      puddleHitPlayer = false
      trainHitTargetIds = new Set()
    }
  }

  return {
    state: { elapsedMs, puddleHitPlayer, trainHitTargetIds: [...trainHitTargetIds].sort() },
    effects,
  }
}
