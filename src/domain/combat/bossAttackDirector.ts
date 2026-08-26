import { isBossDefinitionId } from '../../content/bosses'
import { isEliteDefinitionId } from '../../content/elites'

export type BossAttackDirectorClass = 'boss' | 'elite'
export type BossRangedPattern = 'straight-projectile' | 'three-way-spread' | 'ground-shockwave'

/** Ground shockwaves are intentionally jump-dodgeable in the belt-scroll plane. */
export const canBossRangedPatternHitHeight = (
  pattern: BossRangedPattern,
  targetZ: number,
): boolean => {
  const height = Number.isFinite(targetZ) ? Math.max(0, targetZ) : 0
  return pattern !== 'ground-shockwave' || height <= 10
}

export interface BossAttackDirectorPoint {
  readonly x: number
  readonly y: number
}

export interface BossAttackProjectilePlan {
  readonly velocity: BossAttackDirectorPoint
  readonly damage: number
  /** CombatScene can apply this on contact for a readable belt-scroll hit reaction. */
  readonly hitstunMs: number
  readonly ttlMs: number
}

/**
 * A presentation/runtime-ready attack description. The scene owns cooldown
 * bookkeeping and projectile lifetime; this module only selects a plan.
 */
export interface BossAttackPlan {
  readonly sourceClass: BossAttackDirectorClass
  readonly pattern: BossRangedPattern
  readonly telegraphMs: number
  readonly cooldownMs: number
  readonly origin: BossAttackDirectorPoint
  readonly target: BossAttackDirectorPoint
  readonly projectiles: readonly BossAttackProjectilePlan[]
}

export interface BossAttackDirectorInput {
  /** The CombatScene's existing enemy variant id, such as boss-silo-dredger. */
  readonly enemyVariantId: string
  /** Combat-owned elapsed domain time in milliseconds. */
  readonly elapsedMs: number
  readonly enemyPosition: Readonly<BossAttackDirectorPoint>
  readonly playerPosition: Readonly<BossAttackDirectorPoint>
}

interface AttackTuning {
  readonly speed: number
  readonly damage: number
  readonly telegraphMs: readonly [number, number, number]
  readonly cooldownMs: readonly [number, number, number]
  readonly ttlMs: readonly [number, number, number]
}

const PATTERNS: readonly BossRangedPattern[] = [
  'straight-projectile',
  'three-way-spread',
  'ground-shockwave',
]

const TUNING: Readonly<Record<BossAttackDirectorClass, AttackTuning>> = {
  boss: {
    speed: 250,
    damage: 6,
    telegraphMs: [480, 650, 780],
    cooldownMs: [1_650, 2_050, 2_350],
    ttlMs: [1_700, 1_500, 1_900],
  },
  elite: {
    speed: 210,
    damage: 1,
    telegraphMs: [560, 720, 840],
    cooldownMs: [1_850, 2_250, 2_550],
    ttlMs: [1_600, 1_400, 1_800],
  },
}

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0

const copyPoint = (point: Readonly<BossAttackDirectorPoint>): BossAttackDirectorPoint => ({
  x: finiteOrZero(point.x),
  y: finiteOrZero(point.y),
})

const sourceClassFor = (enemyVariantId: string): BossAttackDirectorClass | null => {
  if (isBossDefinitionId(enemyVariantId)) return 'boss'
  if (isEliteDefinitionId(enemyVariantId)) return 'elite'
  return null
}

const directionTo = (
  origin: Readonly<BossAttackDirectorPoint>,
  target: Readonly<BossAttackDirectorPoint>,
): BossAttackDirectorPoint => {
  const x = target.x - origin.x
  const y = target.y - origin.y
  const length = Math.hypot(x, y)
  return length > 0 ? { x: x / length, y: y / length } : { x: 1, y: 0 }
}

const rotate = (
  direction: Readonly<BossAttackDirectorPoint>,
  radians: number,
): BossAttackDirectorPoint => ({
  x: direction.x * Math.cos(radians) - direction.y * Math.sin(radians),
  y: direction.x * Math.sin(radians) + direction.y * Math.cos(radians),
})

const velocityFor = (
  direction: Readonly<BossAttackDirectorPoint>,
  speed: number,
): BossAttackDirectorPoint => ({ x: direction.x * speed, y: direction.y * speed })

/**
 * Selects a stateless boss/elite ranged plan. The pattern index advances every
 * 1.6 seconds and is offset by range and player lane, so replaying equal input
 * always produces equal output without adding CombatScene state.
 */
export const directBossAttack = (
  input: Readonly<BossAttackDirectorInput>,
): BossAttackPlan | null => {
  const sourceClass = sourceClassFor(input.enemyVariantId)
  if (!sourceClass) return null

  const origin = copyPoint(input.enemyPosition)
  const target = copyPoint(input.playerPosition)
  const direction = directionTo(origin, target)
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y)
  const timeBucket = Math.floor(Math.max(0, finiteOrZero(input.elapsedMs)) / 1_600)
  const distanceBucket = Math.floor(distance / 160)
  const laneBucket = Math.floor(Math.abs(target.y - origin.y) / 80)
  const patternIndex = (timeBucket + distanceBucket + laneBucket) % PATTERNS.length
  const pattern = PATTERNS[patternIndex]
  const tuning = TUNING[sourceClass]
  const ttlMs = tuning.ttlMs[patternIndex]
  const damage = tuning.damage
  const hitstunMs = pattern === 'ground-shockwave'
    ? sourceClass === 'boss' ? 380 : 300
    : pattern === 'three-way-spread'
      ? sourceClass === 'boss' ? 180 : 150
      : sourceClass === 'boss' ? 240 : 200

  const projectiles: readonly BossAttackProjectilePlan[] = pattern === 'three-way-spread'
    ? [-0.32, 0, 0.32].map((angle) => ({
        velocity: velocityFor(rotate(direction, angle), tuning.speed),
        damage: Math.max(1, Math.round(damage * 0.7)),
        hitstunMs,
        ttlMs,
      }))
    : [{
        velocity: velocityFor(direction, pattern === 'ground-shockwave' ? tuning.speed * 0.62 : tuning.speed),
        damage: pattern === 'ground-shockwave' ? Math.round(damage * 1.2) : damage,
        hitstunMs,
        ttlMs,
      }]

  return {
    sourceClass,
    pattern,
    telegraphMs: tuning.telegraphMs[patternIndex],
    cooldownMs: tuning.cooldownMs[patternIndex],
    origin,
    target,
    projectiles,
  }
}
