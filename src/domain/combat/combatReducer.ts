import {
  combatAttackCatalog,
  calculateCancelStartMs,
  type AttackDefinition,
} from '../../content/attacks'
import type { Vec3 } from '../shared/types'
import { fixedStepMs } from './tuning'
import { resolveHitTargets } from './hitResolver'

export type Facing = -1 | 1
export type AttackPhase = 'startup' | 'active' | 'recovery'
export type ActorMode =
  | 'idle'
  | 'moving'
  | 'airborne'
  | 'attacking'
  | 'hitstun'
  | 'knocked-down'
  | 'getting-up'
  | 'defeated'

export interface BodyExtents {
  halfWidth: number
  halfDepth: number
  height: number
}

export interface HitRecord {
  count: number
  lastHitAtMs: number
}

export interface ActiveAttackState {
  attackId: string
  elapsedMs: number
  phase: AttackPhase
  hitRecords: Record<string, HitRecord>
}

export interface ReactionSource {
  attackerId: string
  attackId: string
  strength: number
}

export interface CombatActor {
  id: string
  team: string
  position: Vec3
  velocity: Vec3
  facing: Facing
  body: BodyExtents
  hp: number
  maxHp: number
  meter: number
  damageScale: number
  attackSpeedScale: number
  moveSpeedScale: number
  moveSpeed: number
  jumpSpeed: number
  gravity: number
  mode: ActorMode
  activeAttack: ActiveAttackState | null
  hitstunRemainingMs: number
  knockdownRemainingMs: number
  wakeInvulnerabilityRemainingMs: number
  pendingKnockdown: boolean
  reactionSource: ReactionSource | null
}

export interface ComboHitState {
  hitCount: number
  lastHitAtMs: number | null
  lastAttackerId: string | null
  lastTargetId: string | null
}

export type CombatEvent =
  | {
      type: 'attack-started'
      atMs: number
      actorId: string
      attackId: string
      strength: number
    }
  | {
      type: 'hit-confirmed'
      atMs: number
      attackerId: string
      targetId: string
      attackId: string
      strength: number
      damage: number
    }
  | {
      type: 'actor-knocked-down'
      atMs: number
      actorId: string
      attackerId: string | null
      attackId: string | null
      strength: number | null
    }
  | {
      type: 'actor-defeated'
      atMs: number
      actorId: string
      attackerId: string
      attackId: string
      strength: number
    }
  | {
      type: 'actor-healed'
      atMs: number
      actorId: string
      amount: number
    }
  | {
      type: 'actor-interrupted'
      atMs: number
      actorId: string
    }
  | {
      type: 'environmental-impact'
      atMs: number
      actorId: string
      damage: number
    }

export interface CombatState {
  elapsedMs: number
  hitstopRemainingMs: number
  playerId: string
  actors: Record<string, CombatActor>
  combo: ComboHitState
  events: CombatEvent[]
}

export interface CombatCommand {
  actorId: string
  moveX: -1 | 0 | 1
  moveY: -1 | 0 | 1
  jump?: boolean
  attackId?: string
  healAmount?: number
  interruptAttack?: boolean
  suppressActions?: boolean
  clearGuard?: boolean
  environmentalImpact?: {
    damage: number
    recoveryPosition: Vec3
    knockdownMs: number
  }
}

const KNOCKDOWN_MS = 850
const WAKE_INVULNERABILITY_MS = 450

const attackById = new Map(combatAttackCatalog.map((attack) => [attack.id, attack]))

const cloneActor = (actor: Readonly<CombatActor>): CombatActor => ({
  ...actor,
  position: { ...actor.position },
  velocity: { ...actor.velocity },
  body: { ...actor.body },
  activeAttack: actor.activeAttack
    ? {
        ...actor.activeAttack,
        hitRecords: Object.fromEntries(
          Object.entries(actor.activeAttack.hitRecords).map(([targetId, record]) => [
            targetId,
            { ...record },
          ]),
        ),
      }
    : null,
  reactionSource: actor.reactionSource ? { ...actor.reactionSource } : null,
})

const cloneState = (state: Readonly<CombatState>): CombatState => ({
  elapsedMs: state.elapsedMs,
  hitstopRemainingMs: state.hitstopRemainingMs,
  playerId: state.playerId,
  actors: Object.fromEntries(
    Object.entries(state.actors).map(([actorId, actor]) => [actorId, cloneActor(actor)]),
  ),
  combo: { ...state.combo },
  events: [],
})

const safeScale = (scale: number): number => (Number.isFinite(scale) && scale > 0 ? scale : 1)

const scaledTiming = (attack: Readonly<AttackDefinition>, scale: number) => {
  const divisor = safeScale(scale)
  return {
    startupMs: attack.startupMs / divisor,
    activeMs: attack.activeMs / divisor,
    recoveryMs: attack.recoveryMs / divisor,
    cancelStartMs: calculateCancelStartMs(attack) / divisor,
  }
}

const phaseAt = (
  elapsedMs: number,
  timing: ReturnType<typeof scaledTiming>,
): AttackPhase | null => {
  if (elapsedMs < timing.startupMs) return 'startup'
  if (elapsedMs <= timing.startupMs + timing.activeMs) return 'active'
  if (elapsedMs < timing.startupMs + timing.activeMs + timing.recoveryMs) return 'recovery'
  return null
}

const isGrounded = (actor: Readonly<CombatActor>): boolean => actor.position.z === 0

const isActionable = (actor: Readonly<CombatActor>): boolean =>
  actor.mode === 'idle' || actor.mode === 'moving' || actor.mode === 'airborne'

const commandsByActorId = (
  commands: readonly Readonly<CombatCommand>[],
): Map<string, CombatCommand> => {
  const merged = new Map<string, CombatCommand>()
  for (const command of commands) {
    const prior = merged.get(command.actorId)
    merged.set(command.actorId, {
      ...(prior ?? { actorId: command.actorId, moveX: 0, moveY: 0 }),
      ...command,
      healAmount: (prior?.healAmount ?? 0) + (command.healAmount ?? 0),
      interruptAttack: prior?.interruptAttack === true || command.interruptAttack === true,
      suppressActions: prior?.suppressActions === true || command.suppressActions === true,
      clearGuard: prior?.clearGuard === true || command.clearGuard === true,
      environmentalImpact: command.environmentalImpact ?? prior?.environmentalImpact,
    })
  }
  return merged
}

const applyImmediateCommand = (
  state: CombatState,
  actor: CombatActor,
  command: Readonly<CombatCommand> | undefined,
): void => {
  if (!command || actor.mode === 'defeated' || actor.hp <= 0) return

  const impact = command.environmentalImpact
  if (
    impact &&
    Number.isFinite(impact.damage) &&
    impact.damage > 0 &&
    Number.isFinite(impact.recoveryPosition.x) &&
    Number.isFinite(impact.recoveryPosition.y) &&
    Number.isFinite(impact.recoveryPosition.z) &&
    Number.isFinite(impact.knockdownMs) &&
    impact.knockdownMs > 0
  ) {
    const damage = Math.min(actor.hp, impact.damage)
    actor.hp = Math.max(0, actor.hp - damage)
    actor.position = { ...impact.recoveryPosition }
    actor.velocity = { x: 0, y: 0, z: 0 }
    actor.activeAttack = null
    actor.hitstunRemainingMs = 0
    actor.wakeInvulnerabilityRemainingMs = 0
    actor.pendingKnockdown = false
    actor.reactionSource = null
    if (actor.hp === 0) {
      actor.mode = 'defeated'
      actor.knockdownRemainingMs = 0
    } else {
      actor.mode = 'knocked-down'
      actor.knockdownRemainingMs = impact.knockdownMs
    }
    state.events.push({
      type: 'environmental-impact',
      atMs: state.elapsedMs,
      actorId: actor.id,
      damage,
    })
    return
  }

  const requestedHeal = Number.isFinite(command.healAmount)
    ? Math.max(0, command.healAmount ?? 0)
    : 0
  if (requestedHeal > 0 && actor.hp < actor.maxHp) {
    const oldHp = actor.hp
    actor.hp = Math.min(actor.maxHp, actor.hp + requestedHeal)
    state.events.push({
      type: 'actor-healed',
      atMs: state.elapsedMs,
      actorId: actor.id,
      amount: actor.hp - oldHp,
    })
  }

  if (command.interruptAttack) {
    const interrupted = actor.activeAttack !== null
    actor.activeAttack = null
    if (actor.mode === 'attacking') {
      actor.mode = isGrounded(actor) ? 'idle' : 'airborne'
    }
    if (interrupted) {
      state.events.push({
        type: 'actor-interrupted',
        atMs: state.elapsedMs,
        actorId: actor.id,
      })
    }
  }

  if (command.clearGuard && actor.mode !== 'getting-up') {
    actor.wakeInvulnerabilityRemainingMs = 0
  }

  if (command.suppressActions && (isActionable(actor) || actor.mode === 'attacking')) {
    actor.velocity.x = 0
    actor.velocity.y = 0
  }
}

const canStartForPosition = (
  actor: Readonly<CombatActor>,
  attack: Readonly<AttackDefinition>,
): boolean => {
  const grounded = isGrounded(actor)
  return !(attack.groundedOnly && !grounded) && !(attack.airborneOnly && grounded)
}

const canCancelCurrent = (actor: Readonly<CombatActor>): boolean => {
  if (!actor.activeAttack) return false
  const current = attackById.get(actor.activeAttack.attackId)
  if (!current) return false
  const timing = scaledTiming(current, actor.attackSpeedScale)
  return (
    actor.activeAttack.elapsedMs >= timing.cancelStartMs &&
    actor.activeAttack.elapsedMs <= timing.startupMs + timing.activeMs
  )
}

const startAttack = (
  state: CombatState,
  actor: CombatActor,
  attack: Readonly<AttackDefinition>,
): void => {
  actor.meter -= attack.meterCost
  actor.activeAttack = {
    attackId: attack.id,
    elapsedMs: 0,
    phase: 'startup',
    hitRecords: {},
  }
  actor.mode = 'attacking'
  state.events.push({
    type: 'attack-started',
    atMs: state.elapsedMs,
    actorId: actor.id,
    attackId: attack.id,
    strength: attack.hit.strength,
  })
}

const tryStartAttack = (
  state: CombatState,
  actor: CombatActor,
  attackId: string | undefined,
): void => {
  if (!attackId || actor.mode === 'defeated') return
  const attack = attackById.get(attackId)
  if (!attack || actor.meter < attack.meterCost || !canStartForPosition(actor, attack)) return

  if (actor.activeAttack) {
    if (canCancelCurrent(actor)) startAttack(state, actor, attack)
    return
  }

  if (isActionable(actor)) startAttack(state, actor, attack)
}

const enterKnockdown = (state: CombatState, actor: CombatActor): void => {
  const source = actor.reactionSource
  actor.mode = 'knocked-down'
  actor.activeAttack = null
  actor.hitstunRemainingMs = 0
  actor.knockdownRemainingMs = KNOCKDOWN_MS
  actor.wakeInvulnerabilityRemainingMs = 0
  actor.pendingKnockdown = false
  actor.velocity = { x: 0, y: 0, z: 0 }
  state.events.push({
    type: 'actor-knocked-down',
    atMs: state.elapsedMs,
    actorId: actor.id,
    attackerId: source?.attackerId ?? null,
    attackId: source?.attackId ?? null,
    strength: source?.strength ?? null,
  })
}

const advanceLifecycle = (state: CombatState, actor: CombatActor, deltaMs: number): boolean => {
  if (actor.mode === 'defeated') return false

  if (actor.mode === 'knocked-down') {
    if (deltaMs < actor.knockdownRemainingMs) {
      actor.knockdownRemainingMs -= deltaMs
    } else {
      const wakeElapsedMs = deltaMs - actor.knockdownRemainingMs
      actor.knockdownRemainingMs = 0
      actor.mode = 'getting-up'
      actor.wakeInvulnerabilityRemainingMs = Math.max(
        0,
        WAKE_INVULNERABILITY_MS - wakeElapsedMs,
      )
      actor.reactionSource = null
      if (actor.wakeInvulnerabilityRemainingMs === 0) actor.mode = 'idle'
    }
    return false
  }

  if (actor.mode === 'getting-up') {
    actor.wakeInvulnerabilityRemainingMs = Math.max(
      0,
      actor.wakeInvulnerabilityRemainingMs - deltaMs,
    )
    if (actor.wakeInvulnerabilityRemainingMs === 0) actor.mode = 'idle'
    return false
  }

  if (actor.hitstunRemainingMs > 0) {
    actor.hitstunRemainingMs = Math.max(0, actor.hitstunRemainingMs - deltaMs)
    if (actor.hitstunRemainingMs === 0 && actor.pendingKnockdown && isGrounded(actor)) {
      enterKnockdown(state, actor)
      return false
    }
    if (actor.hitstunRemainingMs === 0 && !actor.pendingKnockdown && isGrounded(actor)) {
      actor.mode = 'idle'
      actor.reactionSource = null
    }
  }

  return true
}

const advanceAttack = (actor: CombatActor, deltaMs: number): void => {
  if (!actor.activeAttack) return
  const attack = attackById.get(actor.activeAttack.attackId)
  if (!attack) {
    actor.activeAttack = null
    if (actor.mode === 'attacking') actor.mode = isGrounded(actor) ? 'idle' : 'airborne'
    return
  }

  actor.activeAttack.elapsedMs += deltaMs
  const phase = phaseAt(
    actor.activeAttack.elapsedMs,
    scaledTiming(attack, actor.attackSpeedScale),
  )
  if (phase) {
    actor.activeAttack.phase = phase
  } else {
    actor.activeAttack = null
    if (actor.mode === 'attacking') actor.mode = isGrounded(actor) ? 'idle' : 'airborne'
  }
}

const applyMovementAndPhysics = (
  state: CombatState,
  actor: CombatActor,
  command: Readonly<CombatCommand> | undefined,
  deltaMs: number,
): void => {
  const deltaSeconds = deltaMs / 1_000
  const canControl = isActionable(actor) && actor.hitstunRemainingMs === 0

  if (canControl && command?.jump && isGrounded(actor) && actor.mode !== 'airborne') {
    actor.velocity.z = actor.jumpSpeed
    actor.mode = 'airborne'
  }

  if (canControl && command) {
    const speed = actor.moveSpeed * actor.moveSpeedScale
    actor.velocity.x = command.moveX * speed
    actor.velocity.y = command.moveY * speed
    actor.position.x += actor.velocity.x * deltaSeconds
    actor.position.y += actor.velocity.y * deltaSeconds
    if (command.moveX !== 0) actor.facing = command.moveX < 0 ? -1 : 1
    if (actor.mode !== 'airborne') {
      actor.mode = command.moveX === 0 && command.moveY === 0 ? 'idle' : 'moving'
    }
  } else if (actor.mode === 'hitstun') {
    actor.position.x += actor.velocity.x * deltaSeconds
    actor.position.y += actor.velocity.y * deltaSeconds
  }

  if (actor.position.z > 0 || actor.velocity.z > 0 || actor.mode === 'airborne') {
    actor.velocity.z -= actor.gravity * deltaSeconds
    actor.position.z += actor.velocity.z * deltaSeconds
    if (actor.position.z <= 0) {
      actor.position.z = 0
      actor.velocity.z = 0
      if (actor.pendingKnockdown) {
        enterKnockdown(state, actor)
      } else if (!actor.activeAttack && actor.hitstunRemainingMs === 0) {
        actor.mode = 'idle'
      }
    }
  }
}

const hitstopForStrength = (strength: number): number => {
  if (strength === 3) return 110
  if (strength === 2) return 75
  return 45
}

const hasSuperArmor = (actor: Readonly<CombatActor>): boolean => {
  if (!actor.activeAttack) return false
  return attackById.get(actor.activeAttack.attackId)?.grantsSuperArmor === true
}

const canHitByRecord = (
  activeAttack: Readonly<ActiveAttackState>,
  targetId: string,
  attack: Readonly<AttackDefinition>,
  elapsedMs: number,
): boolean => {
  const record = activeAttack.hitRecords[targetId]
  if (!record) return true
  return (
    record.count < attack.hit.maxHitsPerTarget &&
    elapsedMs - record.lastHitAtMs >= attack.hit.hitIntervalMs
  )
}

const applyHit = (
  state: CombatState,
  attacker: CombatActor,
  target: CombatActor,
  attack: Readonly<AttackDefinition>,
): void => {
  const activeAttack = attacker.activeAttack
  if (!activeAttack) return
  const priorRecord = activeAttack.hitRecords[target.id]
  activeAttack.hitRecords[target.id] = {
    count: (priorRecord?.count ?? 0) + 1,
    lastHitAtMs: state.elapsedMs,
  }

  const damage = attack.hit.damage * attacker.damageScale
  const oldHp = target.hp
  target.hp = Math.max(0, target.hp - damage)
  attacker.meter = Math.min(100, attacker.meter + attack.meterGain)
  state.hitstopRemainingMs = Math.max(
    state.hitstopRemainingMs,
    hitstopForStrength(attack.hit.strength),
  )
  state.combo = {
    hitCount: state.combo.hitCount + 1,
    lastHitAtMs: state.elapsedMs,
    lastAttackerId: attacker.id,
    lastTargetId: target.id,
  }
  state.events.push({
    type: 'hit-confirmed',
    atMs: state.elapsedMs,
    attackerId: attacker.id,
    targetId: target.id,
    attackId: attack.id,
    strength: attack.hit.strength,
    damage,
  })

  if (target.hp === 0) {
    target.mode = 'defeated'
    target.activeAttack = null
    target.velocity = { x: 0, y: 0, z: 0 }
    target.hitstunRemainingMs = 0
    target.knockdownRemainingMs = 0
    target.wakeInvulnerabilityRemainingMs = 0
    target.pendingKnockdown = false
    target.reactionSource = null
    if (oldHp > 0) {
      state.events.push({
        type: 'actor-defeated',
        atMs: state.elapsedMs,
        actorId: target.id,
        attackerId: attacker.id,
        attackId: attack.id,
        strength: attack.hit.strength,
      })
    }
    return
  }

  if (hasSuperArmor(target)) return

  target.activeAttack = null
  target.mode = 'hitstun'
  target.hitstunRemainingMs = attack.hit.hitstunMs
  target.velocity.x = attack.hit.knockbackX * attacker.facing
  target.velocity.y = attack.hit.knockbackY
  target.velocity.z = attack.hit.launchZ
  target.pendingKnockdown = attack.hit.launchZ > 0 || attack.hit.strength === 3
  target.reactionSource = {
    attackerId: attacker.id,
    attackId: attack.id,
    strength: attack.hit.strength,
  }
}

const resolveActiveHits = (state: CombatState): void => {
  for (const attackerId of Object.keys(state.actors).sort()) {
    const attacker = state.actors[attackerId]
    const activeAttack = attacker.activeAttack
    if (!activeAttack || activeAttack.phase !== 'active' || attacker.mode === 'defeated') continue
    const attack = attackById.get(activeAttack.attackId)
    if (!attack) continue

    for (const targetId of resolveHitTargets(state.actors, attackerId, attack)) {
      if (!attacker.activeAttack) break
      if (!canHitByRecord(attacker.activeAttack, targetId, attack, state.elapsedMs)) continue
      applyHit(state, attacker, state.actors[targetId], attack)
    }
  }
}

/**
 * Advances deterministic combat by one caller-supplied fixed step.
 * The reducer clones the complete serializable state and never mutates its input.
 */
export const combatReducer = (
  incoming: Readonly<CombatState>,
  commands: readonly Readonly<CombatCommand>[] = [],
  deltaMs = fixedStepMs,
): CombatState => {
  const state = cloneState(incoming)
  const requestedDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
  const commandsByActor = commandsByActorId(commands)

  for (const actorId of Object.keys(state.actors).sort()) {
    applyImmediateCommand(state, state.actors[actorId], commandsByActor.get(actorId))
  }

  if (state.hitstopRemainingMs > 0) {
    const frozenMs = Math.min(state.hitstopRemainingMs, requestedDeltaMs)
    state.hitstopRemainingMs -= frozenMs
    if (frozenMs === requestedDeltaMs) return state
    deltaMs = requestedDeltaMs - frozenMs
  } else {
    deltaMs = requestedDeltaMs
  }

  state.elapsedMs += deltaMs

  for (const actorId of Object.keys(state.actors).sort()) {
    const actor = state.actors[actorId]
    const command = commandsByActor.get(actorId)
    const canAdvance = advanceLifecycle(state, actor, deltaMs)
    if (!canAdvance) continue
    if (!command?.suppressActions) tryStartAttack(state, actor, command?.attackId)
    advanceAttack(actor, deltaMs)
    applyMovementAndPhysics(
      state,
      actor,
      command?.suppressActions ? undefined : command,
      deltaMs,
    )
  }

  resolveActiveHits(state)
  return state
}

export const stepCombat = combatReducer
