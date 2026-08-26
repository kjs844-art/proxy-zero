import { describe, expect, it } from 'vitest'

import {
  canBossRangedPatternHitHeight,
  directBossAttack,
  type BossAttackDirectorInput,
} from '../../src/domain/combat/bossAttackDirector'

const planFor = (
  overrides: Partial<BossAttackDirectorInput> = {},
) => directBossAttack({
  enemyVariantId: 'boss-silo-dredger',
  elapsedMs: 0,
  enemyPosition: { x: 0, y: 0 },
  playerPosition: { x: 64, y: 0 },
  ...overrides,
})

describe('directBossAttack', () => {
  it('lets a jump clear the ground shockwave while aerial projectiles still connect', () => {
    expect(canBossRangedPatternHitHeight('ground-shockwave', 0)).toBe(true)
    expect(canBossRangedPatternHitHeight('ground-shockwave', 28)).toBe(false)
    expect(canBossRangedPatternHitHeight('straight-projectile', 28)).toBe(true)
    expect(canBossRangedPatternHitHeight('three-way-spread', 28)).toBe(true)
  })

  it('returns null for a normal enemy', () => {
    expect(planFor({ enemyVariantId: 'scout-striker' })).toBeNull()
  })

  it('cycles through straight, spread, and shockwave patterns by deterministic time buckets', () => {
    expect(planFor({ elapsedMs: 0 })?.pattern).toBe('straight-projectile')
    expect(planFor({ elapsedMs: 1_600 })?.pattern).toBe('three-way-spread')
    expect(planFor({ elapsedMs: 3_200 })?.pattern).toBe('ground-shockwave')
    expect(planFor({ elapsedMs: 4_800 })?.pattern).toBe('straight-projectile')
  })

  it('uses distance and player lane as deterministic pattern offsets', () => {
    const near = planFor({ playerPosition: { x: 64, y: 0 } })
    const distant = planFor({ playerPosition: { x: 385, y: 0 } })
    const upperLane = planFor({ playerPosition: { x: 64, y: 80 } })

    expect(near?.pattern).toBe('straight-projectile')
    expect(distant?.pattern).toBe('ground-shockwave')
    expect(upperLane?.pattern).toBe('three-way-spread')
  })

  it('returns bounded telegraphs, cooldowns, damage, ttl, and projectile velocities', () => {
    const plans = [
      planFor({ elapsedMs: 0 }),
      planFor({ elapsedMs: 1_600 }),
      planFor({ elapsedMs: 3_200 }),
      planFor({ enemyVariantId: 'elite-bulwark-frame', elapsedMs: 0 }),
    ]

    for (const plan of plans) {
      expect(plan).not.toBeNull()
      expect(plan?.telegraphMs).toBeGreaterThanOrEqual(480)
      expect(plan?.telegraphMs).toBeLessThanOrEqual(840)
      expect(plan?.cooldownMs).toBeGreaterThanOrEqual(1_650)
      expect(plan?.cooldownMs).toBeLessThanOrEqual(2_550)
      expect(plan?.projectiles).not.toHaveLength(0)
      for (const projectile of plan?.projectiles ?? []) {
        expect(projectile.damage).toBeGreaterThan(0)
        expect(projectile.hitstunMs).toBeGreaterThanOrEqual(150)
        expect(projectile.hitstunMs).toBeLessThanOrEqual(380)
        expect(projectile.ttlMs).toBeGreaterThanOrEqual(1_400)
        expect(projectile.ttlMs).toBeLessThanOrEqual(1_900)
        expect(Math.hypot(projectile.velocity.x, projectile.velocity.y)).toBeGreaterThan(100)
        expect(Math.hypot(projectile.velocity.x, projectile.velocity.y)).toBeLessThanOrEqual(250)
      }
    }
    expect(plans[1]?.projectiles).toHaveLength(3)
  })

  it('returns identical plans for identical input without mutating that input', () => {
    const input: BossAttackDirectorInput = {
      enemyVariantId: 'boss-silo-dredger',
      elapsedMs: 3_200,
      enemyPosition: { x: 420, y: 180 },
      playerPosition: { x: 130, y: 300 },
    }
    const snapshot = JSON.parse(JSON.stringify(input)) as BossAttackDirectorInput

    expect(directBossAttack(input)).toEqual(directBossAttack(input))
    expect(input).toEqual(snapshot)
  })
})
