import type {
  BossAttackId,
  BossDefinition,
  BossPhase,
  BossPhaseDefinition,
} from '../../content/bosses'
import type { EnemyPoint } from './types'

export type BossPatternCursor = 'A' | 'B'
export type BossBrainMode = 'chase' | 'telegraph' | 'pending-start' | 'await-completion'

export interface BossBrainState {
  readonly mode: BossBrainMode
  readonly phase: BossPhase
  readonly cursor: BossPatternCursor
  readonly attackId: BossAttackId | null
  readonly elapsedMs: number
}

export interface CreateBossBrainStateOptions {
  readonly mode?: BossBrainMode
  readonly phase?: BossPhase
  readonly cursor?: BossPatternCursor
  readonly attackId?: BossAttackId | null
  readonly elapsedMs?: number
}

export interface BossBrainSnapshot {
  readonly state: Readonly<BossBrainState>
  readonly definition: Readonly<BossDefinition>
  readonly hp: number
  readonly position: Readonly<EnemyPoint>
  readonly playerPosition: Readonly<EnemyPoint>
  readonly activeDeltaMs: number
  readonly actorActiveAttackId: string | null
  readonly acceptedAttackId: string | null
  readonly empRemainingMs: number
}

export type BossIntent =
  | { readonly type: 'move'; readonly target: EnemyPoint; readonly speed: number }
  | {
      readonly type: 'telegraph'
      readonly attackId: BossAttackId
      readonly durationMs: number
      readonly range: { readonly x: number; readonly y: number }
    }
  | {
      readonly type: 'attack-requested'
      readonly attackId: BossAttackId
      readonly attackSpeedScale: number
    }

export interface BossBrainResult {
  readonly state: BossBrainState
  readonly intents: readonly BossIntent[]
}

export const createBossBrainState = (
  options: Readonly<CreateBossBrainStateOptions> = {},
): BossBrainState => ({
  mode: options.mode ?? 'chase',
  phase: options.phase ?? 1,
  cursor: options.cursor ?? 'A',
  attackId: options.attackId ?? null,
  elapsedMs: Number.isFinite(options.elapsedMs) ? Math.max(0, options.elapsedMs ?? 0) : 0,
})

export const interruptBossBrain = (
  state: Readonly<BossBrainState>,
): BossBrainState => createBossBrainState({ phase: state.phase, cursor: state.cursor })

const phaseForHp = (hp: number, current: BossPhase): BossPhase => {
  if (!Number.isFinite(hp) || hp <= 0) return current
  const candidate: BossPhase = hp <= 320 ? 3 : hp <= 640 ? 2 : 1
  return Math.max(current, candidate) as BossPhase
}

const phaseDefinition = (
  definition: Readonly<BossDefinition>,
  phase: BossPhase,
): Readonly<BossPhaseDefinition> => {
  const phaseEntry = definition.phases[phase - 1]
  if (!phaseEntry || phaseEntry.phase !== phase) {
    throw new Error(`Boss ${definition.id} is missing phase ${phase}.`)
  }
  return phaseEntry
}

const attackFor = (
  phase: Readonly<BossPhaseDefinition>,
  cursor: BossPatternCursor,
): BossAttackId => phase.order[cursor === 'A' ? 0 : 1]

const patternFor = (
  definition: Readonly<BossDefinition>,
  attackId: BossAttackId,
) => {
  if (definition.patterns.length !== 2) {
    throw new Error('Boss requires exactly two authored patterns.')
  }
  const pattern = definition.patterns.find((entry) => entry.id === attackId)
  if (!pattern) throw new Error(`Boss pattern is not authored: ${attackId}`)
  return pattern
}

const inRange = (
  position: Readonly<EnemyPoint>,
  playerPosition: Readonly<EnemyPoint>,
  range: { readonly x: number; readonly y: number },
): boolean =>
  Math.abs(position.x - playerPosition.x) <= range.x &&
  Math.abs(position.y - playerPosition.y) <= range.y

/** Pure boss clock. Combat owns active/recovery timing and confirms cursor changes. */
export const stepBossBrain = (
  snapshot: Readonly<BossBrainSnapshot>,
): BossBrainResult => {
  const phase = phaseForHp(snapshot.hp, snapshot.state.phase)
  const phaseData = phaseDefinition(snapshot.definition, phase)
  const stateWithPhase: BossBrainState = { ...snapshot.state, phase }

  if (snapshot.empRemainingMs > 0) {
    return { state: interruptBossBrain(stateWithPhase), intents: [] }
  }

  const activeDeltaMs = Number.isFinite(snapshot.activeDeltaMs)
    ? Math.max(0, snapshot.activeDeltaMs)
    : 0

  if (stateWithPhase.mode === 'await-completion') {
    if (snapshot.actorActiveAttackId !== null) {
      return { state: stateWithPhase, intents: [] }
    }
    return {
      state: createBossBrainState({ phase, cursor: stateWithPhase.cursor }),
      intents: [],
    }
  }

  if (stateWithPhase.mode === 'pending-start') {
    if (snapshot.acceptedAttackId === stateWithPhase.attackId) {
      return {
        state: createBossBrainState({
          phase,
          cursor: stateWithPhase.cursor === 'A' ? 'B' : 'A',
          mode: 'await-completion',
          attackId: stateWithPhase.attackId,
        }),
        intents: [],
      }
    }
    const attackId = stateWithPhase.attackId ?? attackFor(phaseData, stateWithPhase.cursor)
    return {
      state: stateWithPhase,
      intents: [{ type: 'attack-requested', attackId, attackSpeedScale: phaseData.attackSpeedScale }],
    }
  }

  const attackId = attackFor(phaseData, stateWithPhase.cursor)
  const pattern = patternFor(snapshot.definition, attackId)
  if (stateWithPhase.mode === 'telegraph') {
    const elapsedMs = stateWithPhase.elapsedMs + activeDeltaMs
    const telegraphMs = phaseData.telegraphMsByAttackId[attackId]
    if (elapsedMs < telegraphMs) {
      return {
        state: createBossBrainState({
          phase, cursor: stateWithPhase.cursor, mode: 'telegraph', attackId, elapsedMs,
        }),
        intents: [],
      }
    }
    return {
      state: createBossBrainState({
        phase, cursor: stateWithPhase.cursor, mode: 'pending-start', attackId,
      }),
      intents: [{ type: 'attack-requested', attackId, attackSpeedScale: phaseData.attackSpeedScale }],
    }
  }

  if (inRange(snapshot.position, snapshot.playerPosition, pattern.range)) {
    const durationMs = phaseData.telegraphMsByAttackId[attackId]
    return {
      state: createBossBrainState({
        phase, cursor: stateWithPhase.cursor, mode: 'telegraph', attackId,
      }),
      intents: [{
        type: 'telegraph', attackId, durationMs, range: { ...pattern.range },
      }],
    }
  }

  return {
    state: createBossBrainState({ phase, cursor: stateWithPhase.cursor }),
    intents: [{ type: 'move', target: { ...snapshot.playerPosition }, speed: phaseData.chaseSpeed }],
  }
}
