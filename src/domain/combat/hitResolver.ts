import type { AttackDefinition } from '../../content/attacks'
import type { CombatActor } from './combatReducer'

const rangesOverlap = (aMin: number, aMax: number, bMin: number, bMax: number): boolean =>
  aMin <= bMax && bMin <= aMax

/** Pure authored-space AABB test. Actor Z is the floor position of its body. */
export const attackOverlapsTarget = (
  attacker: Readonly<CombatActor>,
  target: Readonly<CombatActor>,
  attack: Readonly<AttackDefinition>,
): boolean => {
  const hitboxX = attacker.position.x + attack.hitbox.offsetX * attacker.facing
  const hitboxY = attacker.position.y + attack.hitbox.offsetY
  const hitboxZMin = attacker.position.z + attack.hitbox.zMin
  const hitboxZMax = attacker.position.z + attack.hitbox.zMax

  return (
    Math.abs(hitboxX - target.position.x) <= attack.hitbox.halfWidth + target.body.halfWidth &&
    Math.abs(hitboxY - target.position.y) <= attack.hitbox.halfDepth + target.body.halfDepth &&
    rangesOverlap(
      hitboxZMin,
      hitboxZMax,
      target.position.z,
      target.position.z + target.body.height,
    )
  )
}

/** Returns eligible opposing targets in a stable order, independent of object insertion order. */
export const resolveHitTargets = (
  actors: Readonly<Record<string, Readonly<CombatActor>>>,
  attackerId: string,
  attack: Readonly<AttackDefinition>,
): readonly string[] => {
  const attacker = actors[attackerId]
  if (!attacker || attacker.hp <= 0 || attacker.mode === 'defeated') {
    return []
  }

  return Object.keys(actors)
    .sort()
    .filter((targetId) => {
      const target = actors[targetId]
      return (
        targetId !== attackerId &&
        target.team !== attacker.team &&
        target.hp > 0 &&
        target.mode !== 'defeated' &&
        target.wakeInvulnerabilityRemainingMs <= 0 &&
        target.mode !== 'getting-up' &&
        attackOverlapsTarget(attacker, target, attack)
      )
    })
}
