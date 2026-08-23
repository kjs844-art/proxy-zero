import type { EnemyPoint, WaveDefinition, WaveSpawnOrder } from '../enemies/types'

export interface ArenaBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

export interface PlayerSafeSeparation {
  readonly x: number
  readonly y: number
}

export interface EnemyRecoveryObservation {
  readonly enemyId: string
  readonly position: Readonly<EnemyPoint>
  readonly down?: boolean
  readonly defeated?: boolean
  readonly madeRecoveryProgress?: boolean
}

export interface EnemyRecoveryState {
  readonly offscreenMs: number
  readonly noProgressMs: number
  readonly returnRequested: boolean
  readonly forcedRepositioned: boolean
}

export interface WaveDirectorState {
  readonly waveId: string
  readonly initialSeed: number
  readonly definition: WaveDefinition
  readonly elapsedMs: number
  readonly emittedOrderIds: readonly string[]
  readonly spawnedEnemyIds: readonly string[]
  readonly defeatedEnemyIds: readonly string[]
  readonly recoveryByEnemyId: Readonly<Record<string, EnemyRecoveryState>>
  readonly cleared: boolean
}

export interface WaveDirectorInput {
  readonly deltaMs: number
  readonly defeatedEnemyIds?: readonly string[]
  readonly activeEnemies: readonly EnemyRecoveryObservation[]
  readonly arena: Readonly<ArenaBounds>
  readonly playerPosition: Readonly<EnemyPoint>
  readonly playerSafeSeparation: Readonly<PlayerSafeSeparation>
}

export type WaveDirectorEvent =
  | {
      readonly type: 'enemy-spawned'
      readonly waveId: string
      readonly orderId: string
      readonly enemyId: string
      readonly enemyVariantId: string
    }
  | { readonly type: 'enemy-return-requested'; readonly enemyId: string }
  | {
      readonly type: 'enemy-force-repositioned'
      readonly enemyId: string
      readonly position: EnemyPoint
    }
  | { readonly type: 'wave-cleared'; readonly waveId: string }

export interface WaveDirectorResult {
  readonly state: WaveDirectorState
  readonly events: readonly WaveDirectorEvent[]
}

const RETURN_AFTER_MS = 2_000
const FORCE_REPOSITION_AFTER_MS = 8_000

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const normalizedSeed = (seed: number): number =>
  Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0

const orderEnemyId = (waveId: string, orderId: string): string => `${waveId}:${orderId}`

const cloneDefinition = (definition: Readonly<WaveDefinition>): WaveDefinition => ({
  id: definition.id,
  orders: definition.orders.map((order) => ({ ...order })),
})

const freshRecoveryState = (): EnemyRecoveryState => ({
  offscreenMs: 0,
  noProgressMs: 0,
  returnRequested: false,
  forcedRepositioned: false,
})

export const createWaveDirectorState = (
  definition: Readonly<WaveDefinition>,
  initialSeed: number,
): WaveDirectorState => ({
  waveId: definition.id,
  initialSeed: normalizedSeed(initialSeed),
  definition: cloneDefinition(definition),
  elapsedMs: 0,
  emittedOrderIds: [],
  spawnedEnemyIds: [],
  defeatedEnemyIds: [],
  recoveryByEnemyId: {},
  cleared: false,
})

/** Rebuilds only authored wave runtime; no prior HP, AI phase, or timers are accepted. */
export const resetWaveDirector = createWaveDirectorState

export const isInsideArena = (
  point: Readonly<EnemyPoint>,
  arena: Readonly<ArenaBounds>,
): boolean =>
  point.x >= arena.minX &&
  point.x <= arena.maxX &&
  point.y >= arena.minY &&
  point.y <= arena.maxY

export const isOutsidePlayerSafeArea = (
  point: Readonly<EnemyPoint>,
  playerPosition: Readonly<EnemyPoint>,
  separation: Readonly<PlayerSafeSeparation>,
): boolean =>
  Math.abs(point.x - playerPosition.x) >= finiteNonNegative(separation.x) ||
  Math.abs(point.y - playerPosition.y) >= finiteNonNegative(separation.y)

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/**
 * Chooses a reproducible legal arena point. An impossible authored safe area
 * returns null instead of silently placing an enemy on the player.
 */
export const chooseForcedReentryPosition = (
  enemyPosition: Readonly<EnemyPoint>,
  playerPosition: Readonly<EnemyPoint>,
  arena: Readonly<ArenaBounds>,
  separation: Readonly<PlayerSafeSeparation>,
): EnemyPoint | null => {
  const preferredX = enemyPosition.x <= playerPosition.x ? arena.minX : arena.maxX
  const otherX = preferredX === arena.minX ? arena.maxX : arena.minX
  const preferredY = enemyPosition.y <= playerPosition.y ? arena.minY : arena.maxY
  const otherY = preferredY === arena.minY ? arena.maxY : arena.minY
  const clampedX = clamp(enemyPosition.x, arena.minX, arena.maxX)
  const clampedY = clamp(enemyPosition.y, arena.minY, arena.maxY)
  const candidates: readonly EnemyPoint[] = [
    { x: preferredX, y: clampedY },
    { x: otherX, y: clampedY },
    { x: clampedX, y: preferredY },
    { x: clampedX, y: otherY },
    { x: preferredX, y: preferredY },
    { x: otherX, y: otherY },
  ]

  return (
    candidates.find(
      (candidate) =>
        isInsideArena(candidate, arena) &&
        isOutsidePlayerSafeArea(candidate, playerPosition, separation),
    ) ?? null
  )
}

const authoredOrder = (
  definition: Readonly<WaveDefinition>,
  emittedOrderIds: ReadonlySet<string>,
  elapsedMs: number,
): readonly WaveSpawnOrder[] =>
  definition.orders
    .map((order, index) => ({ order, index }))
    .filter(
      ({ order }) =>
        !emittedOrderIds.has(order.id) && finiteNonNegative(order.delayMs) <= elapsedMs,
    )
    .sort(
      (left, right) =>
        finiteNonNegative(left.order.delayMs) - finiteNonNegative(right.order.delayMs) ||
        left.index - right.index,
    )
    .map(({ order }) => order)

const cloneRecovery = (
  records: Readonly<Record<string, EnemyRecoveryState>>,
): Record<string, EnemyRecoveryState> =>
  Object.fromEntries(
    Object.entries(records).map(([enemyId, state]) => [enemyId, { ...state }]),
  )

const updateRecovery = (
  recovery: Record<string, EnemyRecoveryState>,
  observation: Readonly<EnemyRecoveryObservation>,
  input: Readonly<WaveDirectorInput>,
  deltaMs: number,
  events: WaveDirectorEvent[],
): void => {
  const enemyId = observation.enemyId
  if (observation.down || observation.defeated) {
    delete recovery[enemyId]
    return
  }

  if (isInsideArena(observation.position, input.arena)) {
    recovery[enemyId] = freshRecoveryState()
    return
  }

  const prior = recovery[enemyId] ?? freshRecoveryState()
  const offscreenMs = prior.offscreenMs + deltaMs
  const noProgressMs = observation.madeRecoveryProgress ? 0 : prior.noProgressMs + deltaMs
  const returnRequested = prior.returnRequested || offscreenMs >= RETURN_AFTER_MS
  let forcedRepositioned = prior.forcedRepositioned

  if (!prior.returnRequested && returnRequested) {
    events.push({ type: 'enemy-return-requested', enemyId })
  }

  if (!forcedRepositioned && noProgressMs >= FORCE_REPOSITION_AFTER_MS) {
    const position = chooseForcedReentryPosition(
      observation.position,
      input.playerPosition,
      input.arena,
      input.playerSafeSeparation,
    )
    if (position) {
      forcedRepositioned = true
      events.push({ type: 'enemy-force-repositioned', enemyId, position })
    }
  }

  recovery[enemyId] = { offscreenMs, noProgressMs, returnRequested, forcedRepositioned }
}

/**
 * Advances spawn, clear, and offscreen recovery from explicit caller-supplied time.
 * It clones all runtime collections and never mutates authored content or prior state.
 */
export const advanceWaveDirector = (
  incoming: Readonly<WaveDirectorState>,
  input: Readonly<WaveDirectorInput>,
): WaveDirectorResult => {
  const definition = incoming.definition
  if (incoming.waveId !== definition.id) {
    throw new Error(`Wave runtime ${incoming.waveId} cannot use definition ${definition.id}.`)
  }

  const deltaMs = finiteNonNegative(input.deltaMs)
  const elapsedMs = incoming.elapsedMs + deltaMs
  const emittedOrderIds = [...incoming.emittedOrderIds]
  const spawnedEnemyIds = [...incoming.spawnedEnemyIds]
  const defeatedEnemyIds = new Set(incoming.defeatedEnemyIds)
  const recoveryByEnemyId = cloneRecovery(incoming.recoveryByEnemyId)
  const events: WaveDirectorEvent[] = []
  const emitted = new Set(emittedOrderIds)

  for (const order of authoredOrder(definition, emitted, elapsedMs)) {
    const enemyId = orderEnemyId(definition.id, order.id)
    emitted.add(order.id)
    emittedOrderIds.push(order.id)
    spawnedEnemyIds.push(enemyId)
    events.push({
      type: 'enemy-spawned',
      waveId: definition.id,
      orderId: order.id,
      enemyId,
      enemyVariantId: order.enemyVariantId,
    })
  }

  const spawned = new Set(spawnedEnemyIds)
  for (const enemyId of input.defeatedEnemyIds ?? []) {
    if (spawned.has(enemyId)) {
      defeatedEnemyIds.add(enemyId)
      delete recoveryByEnemyId[enemyId]
    }
  }

  const activeById = new Map(input.activeEnemies.map((entry) => [entry.enemyId, entry]))
  for (const enemyId of spawnedEnemyIds) {
    if (defeatedEnemyIds.has(enemyId)) continue
    const observation = activeById.get(enemyId)
    if (observation) updateRecovery(recoveryByEnemyId, observation, input, deltaMs, events)
  }

  const allOrdersEmitted = emittedOrderIds.length === definition.orders.length
  const allSpawnedDefeated = spawnedEnemyIds.every((enemyId) => defeatedEnemyIds.has(enemyId))
  const cleared = incoming.cleared || (allOrdersEmitted && allSpawnedDefeated)
  if (!incoming.cleared && cleared) events.push({ type: 'wave-cleared', waveId: definition.id })

  return {
    state: {
      waveId: incoming.waveId,
      initialSeed: incoming.initialSeed,
      definition: cloneDefinition(definition),
      elapsedMs,
      emittedOrderIds,
      spawnedEnemyIds,
      defeatedEnemyIds: [...defeatedEnemyIds],
      recoveryByEnemyId,
      cleared,
    },
    events,
  }
}
