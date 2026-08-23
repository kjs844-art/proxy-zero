import type {
  EnemyAttackPattern,
  EnemyPoint,
  EnemyState,
  EnemyVariantDefinition,
} from './types'

export interface EnemyRandomSource {
  next(): number
}

export interface EnemyBrainState {
  readonly mode: EnemyState
  readonly elapsedMs: number
  readonly attackId: string | null
}

export interface EnemyBrainSnapshot {
  readonly enemyId: string
  readonly definition: Readonly<EnemyVariantDefinition>
  readonly state: Readonly<EnemyBrainState>
  readonly position: Readonly<EnemyPoint>
  readonly playerPosition: Readonly<EnemyPoint>
  readonly deltaMs: number
}

export type EnemyIntent =
  | { readonly type: 'move'; readonly target: EnemyPoint; readonly speed: number }
  | {
      readonly type: 'telegraph'
      readonly attackId: string
      readonly durationMs: number
      readonly range: { readonly x: number; readonly y: number }
    }
  | {
      readonly type: 'attack'
      readonly attackId: string
      readonly range: { readonly x: number; readonly y: number }
    }
  | { readonly type: 'guard'; readonly durationMs: number }

export interface EnemyBrainResult {
  readonly state: EnemyBrainState
  readonly intents: readonly EnemyIntent[]
}

const finiteElapsed = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const cloneState = (state: Readonly<EnemyBrainState>): EnemyBrainState => ({ ...state })

const stateFor = (mode: EnemyState, attackId: string | null = null, elapsedMs = 0): EnemyBrainState => ({
  mode,
  attackId,
  elapsedMs,
})

export const createEnemyBrainState = (mode: EnemyState = 'patrol'): EnemyBrainState =>
  stateFor(mode)

const distance = (left: Readonly<EnemyPoint>, right: Readonly<EnemyPoint>) => ({
  x: Math.abs(left.x - right.x),
  y: Math.abs(left.y - right.y),
})

const attackById = (
  definition: Readonly<EnemyVariantDefinition>,
  attackId: string | null,
): EnemyAttackPattern | undefined => definition.attacks.find((attack) => attack.id === attackId)

const attackInRange = (
  definition: Readonly<EnemyVariantDefinition>,
  position: Readonly<EnemyPoint>,
  playerPosition: Readonly<EnemyPoint>,
): readonly EnemyAttackPattern[] => {
  const delta = distance(position, playerPosition)
  return definition.attacks.filter(
    (attack) => delta.x <= attack.range.x && delta.y <= attack.range.y,
  )
}

const chooseWeighted = <Value extends { readonly weight: number }>(
  choices: readonly Value[],
  random: EnemyRandomSource,
): Value | undefined => {
  const weighted = choices.map((choice) => ({
    choice,
    weight: Number.isFinite(choice.weight) ? Math.max(0, choice.weight) : 0,
  }))
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return choices[0]

  let remaining = random.next() * total
  for (const entry of weighted) {
    remaining -= entry.weight
    if (remaining < 0) return entry.choice
  }
  return weighted.at(-1)?.choice
}

const moveIntent = (
  target: Readonly<EnemyPoint>,
  speed: number,
): EnemyIntent => ({ type: 'move', target: { ...target }, speed })

const telegraphIntent = (attack: Readonly<EnemyAttackPattern>): EnemyIntent => ({
  type: 'telegraph',
  attackId: attack.id,
  durationMs: attack.telegraphMs,
  range: { ...attack.range },
})

const attackIntent = (attack: Readonly<EnemyAttackPattern>): EnemyIntent => ({
  type: 'attack',
  attackId: attack.id,
  range: { ...attack.range },
})

const patrolTarget = (
  position: Readonly<EnemyPoint>,
  random: EnemyRandomSource,
): EnemyPoint => {
  const xDirection = random.next() < 0.5 ? -1 : 1
  const yDirection = random.next() < 0.5 ? -1 : 1
  return { x: position.x + xDirection * 48, y: position.y + yDirection * 24 }
}

const canChase = (snapshot: Readonly<EnemyBrainSnapshot>): boolean => {
  const delta = distance(snapshot.position, snapshot.playerPosition)
  return delta.x <= snapshot.definition.chaseDistance && delta.y <= snapshot.definition.chaseDistance
}

const shouldGuard = (
  definition: Readonly<EnemyVariantDefinition>,
  random: EnemyRandomSource,
): boolean => {
  const attackWeight = Math.max(0, definition.intentWeights.attack)
  const guardWeight = Math.max(0, definition.intentWeights.guard)
  if (guardWeight === 0 || definition.guardDurationMs <= 0) return false
  if (attackWeight === 0) return true
  return random.next() * (attackWeight + guardWeight) < guardWeight
}

/**
 * Advances an enemy's small deterministic decision state machine.
 * The snapshot is never changed; random choices are provided by the caller.
 */
export const stepEnemyBrain = (
  snapshot: Readonly<EnemyBrainSnapshot>,
  random: EnemyRandomSource,
): EnemyBrainResult => {
  const deltaMs = finiteElapsed(snapshot.deltaMs)
  const state = snapshot.state

  if (state.mode === 'down') return { state: cloneState(state), intents: [] }

  if (state.mode === 'patrol') {
    if (canChase(snapshot)) {
      return {
        state: stateFor('chase'),
        intents: [moveIntent(snapshot.playerPosition, snapshot.definition.moveSpeed)],
      }
    }
    return {
      state: stateFor('patrol'),
      intents: [moveIntent(patrolTarget(snapshot.position, random), snapshot.definition.moveSpeed)],
    }
  }

  if (state.mode === 'chase') {
    const eligibleAttacks = attackInRange(
      snapshot.definition,
      snapshot.position,
      snapshot.playerPosition,
    )
    if (eligibleAttacks.length > 0) {
      if (shouldGuard(snapshot.definition, random)) {
        return {
          state: stateFor('guard'),
          intents: [{ type: 'guard', durationMs: snapshot.definition.guardDurationMs }],
        }
      }
      const attack = chooseWeighted(eligibleAttacks, random)
      if (attack) {
        return {
          state: stateFor('telegraph', attack.id),
          intents: [telegraphIntent(attack)],
        }
      }
    }
    return {
      state: stateFor('chase'),
      intents: [moveIntent(snapshot.playerPosition, snapshot.definition.moveSpeed)],
    }
  }

  if (state.mode === 'telegraph') {
    const attack = attackById(snapshot.definition, state.attackId)
    if (!attack) return { state: stateFor('chase'), intents: [] }
    const elapsedMs = state.elapsedMs + deltaMs
    if (elapsedMs >= attack.telegraphMs) {
      return { state: stateFor('attack', attack.id), intents: [attackIntent(attack)] }
    }
    return {
      state: stateFor('telegraph', attack.id, elapsedMs),
      intents: [telegraphIntent(attack)],
    }
  }

  if (state.mode === 'attack') {
    const attack = attackById(snapshot.definition, state.attackId)
    if (!attack) return { state: stateFor('recover'), intents: [] }
    const elapsedMs = state.elapsedMs + deltaMs
    if (elapsedMs >= attack.activeMs) {
      return { state: stateFor('recover', attack.id), intents: [] }
    }
    return {
      state: stateFor('attack', attack.id, elapsedMs),
      intents: [attackIntent(attack)],
    }
  }

  if (state.mode === 'recover') {
    const attack = attackById(snapshot.definition, state.attackId)
    if (!attack) return { state: stateFor('chase'), intents: [] }
    const elapsedMs = state.elapsedMs + deltaMs
    if (elapsedMs >= attack.recoveryMs) {
      return { state: stateFor(canChase(snapshot) ? 'chase' : 'patrol'), intents: [] }
    }
    return { state: stateFor('recover', attack.id, elapsedMs), intents: [] }
  }

  const elapsedMs = state.elapsedMs + deltaMs
  if (elapsedMs >= snapshot.definition.guardDurationMs) {
    return { state: stateFor('chase'), intents: [] }
  }
  return { state: stateFor('guard', null, elapsedMs), intents: [] }
}
