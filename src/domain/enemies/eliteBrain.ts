import type { EliteDefinition, ElitePatternDefinition } from '../../content/elites'
import type { EnemyPoint } from './types'

export type ElitePatternCursor = 'A' | 'B'
export type EliteBrainMode = 'chase' | 'telegraph' | 'pending-start' | 'await-completion'

export interface EliteBrainState {
  readonly mode: EliteBrainMode
  readonly cursor: ElitePatternCursor
  readonly attackId: ElitePatternDefinition['id'] | null
  readonly elapsedMs: number
}

export interface EliteBrainSnapshot {
  readonly state: Readonly<EliteBrainState>
  readonly definition: Readonly<EliteDefinition>
  readonly position: Readonly<EnemyPoint>
  readonly playerPosition: Readonly<EnemyPoint>
  readonly activeDeltaMs: number
  readonly actorActiveAttackId: string | null
  readonly acceptedAttackId: string | null
  /** Task 10's ItemRuntimeState remains the sole live EMP timer authority. */
  readonly empRemainingMs: number
}

export type EliteIntent =
  | { readonly type: 'move'; readonly target: EnemyPoint; readonly speed: number }
  | {
      readonly type: 'telegraph'
      readonly attackId: ElitePatternDefinition['id']
      readonly durationMs: number
      readonly range: { readonly x: number; readonly y: number }
    }
  | { readonly type: 'attack-requested'; readonly attackId: ElitePatternDefinition['id'] }

export interface EliteBrainResult {
  readonly state: EliteBrainState
  readonly intents: readonly EliteIntent[]
}

const patternFor = (
  definition: Readonly<EliteDefinition>,
  cursor: ElitePatternCursor,
): Readonly<ElitePatternDefinition> => {
  const pattern = definition.patterns[cursor === 'A' ? 0 : 1]
  if (!pattern || definition.patterns.length !== 2) {
    throw new Error('Elite requires exactly two authored patterns.')
  }
  return pattern
}

export const createEliteBrainState = (
  cursor: ElitePatternCursor = 'A',
  mode: EliteBrainMode = 'chase',
  attackId: ElitePatternDefinition['id'] | null = null,
  elapsedMs = 0,
): EliteBrainState => ({ mode, cursor, attackId, elapsedMs })

export const interruptEliteBrain = (
  state: Readonly<EliteBrainState>,
): EliteBrainState => createEliteBrainState(state.cursor)

const inRange = (
  position: Readonly<EnemyPoint>,
  playerPosition: Readonly<EnemyPoint>,
  pattern: Readonly<ElitePatternDefinition>,
): boolean =>
  Math.abs(position.x - playerPosition.x) <= pattern.range.x &&
  Math.abs(position.y - playerPosition.y) <= pattern.range.y

/** Pure accepted-start-driven A/B elite brain. Combat owns active and recovery timing. */
export const stepEliteBrain = (
  snapshot: Readonly<EliteBrainSnapshot>,
): EliteBrainResult => {
  if (snapshot.empRemainingMs > 0) {
    return { state: interruptEliteBrain(snapshot.state), intents: [] }
  }

  const deltaMs = Number.isFinite(snapshot.activeDeltaMs)
    ? Math.max(0, snapshot.activeDeltaMs)
    : 0
  const pattern = patternFor(snapshot.definition, snapshot.state.cursor)

  if (snapshot.state.mode === 'await-completion') {
    if (snapshot.actorActiveAttackId !== null) {
      return { state: { ...snapshot.state }, intents: [] }
    }
    return { state: createEliteBrainState(snapshot.state.cursor), intents: [] }
  }

  if (snapshot.state.mode === 'pending-start') {
    if (snapshot.acceptedAttackId === snapshot.state.attackId) {
      return {
        state: createEliteBrainState(
          snapshot.state.cursor === 'A' ? 'B' : 'A',
          'await-completion',
          snapshot.state.attackId,
        ),
        intents: [],
      }
    }
    return {
      state: { ...snapshot.state },
      intents: [{ type: 'attack-requested', attackId: pattern.id }],
    }
  }

  if (snapshot.state.mode === 'telegraph') {
    const elapsedMs = snapshot.state.elapsedMs + deltaMs
    if (elapsedMs < pattern.telegraphMs) {
      return {
        state: createEliteBrainState(snapshot.state.cursor, 'telegraph', pattern.id, elapsedMs),
        intents: [],
      }
    }
    return {
      state: createEliteBrainState(snapshot.state.cursor, 'pending-start', pattern.id),
      intents: [{ type: 'attack-requested', attackId: pattern.id }],
    }
  }

  if (inRange(snapshot.position, snapshot.playerPosition, pattern)) {
    return {
      state: createEliteBrainState(snapshot.state.cursor, 'telegraph', pattern.id),
      intents: [{
        type: 'telegraph',
        attackId: pattern.id,
        durationMs: pattern.telegraphMs,
        range: { ...pattern.range },
      }],
    }
  }

  return {
    state: createEliteBrainState(snapshot.state.cursor),
    intents: [{
      type: 'move',
      target: { ...snapshot.playerPosition },
      speed: snapshot.definition.moveSpeed,
    }],
  }
}
