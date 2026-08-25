import { describe, expect, it } from 'vitest'
import {
  attackCatalog,
  calculateCancelStartMs,
  type AttackDefinition,
} from '../../src/content/attacks'
import { characters } from '../../src/content/characters'

const limbIds = (character: (typeof characters)[number]) =>
  Object.values(character.normalAttackIds)

const referencedAttackIds = (character: (typeof characters)[number]) => [
  ...limbIds(character),
  ...character.techniqueRecipes.map((entry) => entry.attackId),
  character.jumpAttackId,
  character.superAttackId,
]

const totalTiming = (attack: AttackDefinition) =>
  attack.startupMs + attack.activeMs + attack.recoveryMs

describe('character and attack content', () => {
  it('defines the exact approved stats and move counts', () => {
    expect(
      characters.map(({ id, maxHp, damageScale, attackSpeedScale, moveSpeedScale }) => ({
        id,
        maxHp,
        damageScale,
        attackSpeedScale,
        moveSpeedScale,
      })),
    ).toEqual([
      { id: 'han', maxHp: 100, damageScale: 1, attackSpeedScale: 1, moveSpeedScale: 1 },
      { id: 'mina', maxHp: 85, damageScale: 0.82, attackSpeedScale: 1.22, moveSpeedScale: 1.18 },
      { id: 'jin', maxHp: 125, damageScale: 1.28, attackSpeedScale: 0.78, moveSpeedScale: 0.84 },
    ])

    for (const character of characters) {
      expect(limbIds(character)).toHaveLength(4)
      expect(new Set(limbIds(character)).size).toBe(4)
      expect(character.techniqueRecipes).toHaveLength(2)
      expect(character.jumpAttackId).toMatch(new RegExp(`^${character.id}-[a-z0-9-]+$`))
      expect(character.superAttackId).toMatch(new RegExp(`^${character.id}-[a-z0-9-]+$`))
      expect(character.superRecipe.attackId).toBe(character.superAttackId)
      expect(character.superRecipe.meterCost).toBe(100)
    }
  })

  it('uses stable prefixed lower-kebab-case IDs and has no missing or unused attacks', () => {
    const allReferences = characters.flatMap(referencedAttackIds)

    expect(new Set(allReferences).size).toBe(allReferences.length)
    expect(new Set(attackCatalog.map((attack) => attack.id)).size).toBe(attackCatalog.length)
    expect([...allReferences].sort()).toEqual(attackCatalog.map((attack) => attack.id).sort())

    for (const character of characters) {
      for (const id of [
        ...referencedAttackIds(character),
        ...character.techniqueRecipes.map((entry) => entry.id),
        character.superRecipe.id,
      ]) {
        expect(id).toMatch(new RegExp(`^${character.id}-[a-z0-9]+(?:-[a-z0-9]+)*$`))
      }
    }
  })

  it('provides complete valid attack contracts and the exact cancel boundary helper', () => {
    for (const attack of attackCatalog) {
      expect(attack.bufferMs).toBeGreaterThanOrEqual(140)
      expect(attack.bufferMs).toBeLessThanOrEqual(220)
      expect(attack.activeMs).toBeGreaterThan(0)
      expect(attack.hitbox.halfWidth).toBeGreaterThan(0)
      expect(attack.hitbox.halfDepth).toBeGreaterThan(0)
      expect(attack.hit.maxHitsPerTarget).toBeGreaterThan(0)
      expect(attack.groundedOnly && attack.airborneOnly).toBe(false)

      const numericValues = [
        attack.startupMs,
        attack.activeMs,
        attack.recoveryMs,
        attack.bufferMs,
        ...Object.values(attack.hitbox),
        ...Object.values(attack.hit),
        attack.meterGain,
        attack.meterCost,
      ]
      expect(numericValues.every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
      expect(calculateCancelStartMs(attack)).toBe(
        attack.startupMs + attack.activeMs * (1 - 0.35),
      )
    }
  })

  it('limits super armor to JIN, charges supers 100 meter, and gives normals meter', () => {
    const attackById = new Map(attackCatalog.map((attack) => [attack.id, attack]))

    for (const character of characters) {
      for (const normalId of limbIds(character)) {
        expect(attackById.get(normalId)?.meterGain).toBeGreaterThan(0)
      }
      expect(attackById.get(character.superAttackId)?.meterCost).toBe(100)
    }

    expect(
      attackCatalog
        .filter((attack) => attack.grantsSuperArmor)
        .every((attack) => attack.id.startsWith('jin-')),
    ).toBe(true)
  })

  it('keeps hands quick and gives both direct feet the heavier impact tier', () => {
    const attackById = new Map(attackCatalog.map((attack) => [attack.id, attack]))

    for (const character of characters) {
      expect(attackById.get(character.normalAttackIds['left-hand'])?.hit.strength).toBe(1)
      expect(attackById.get(character.normalAttackIds['right-hand'])?.hit.strength).toBe(1)
      expect(attackById.get(character.normalAttackIds['left-foot'])?.hit.strength).toBe(2)
      expect(attackById.get(character.normalAttackIds['right-foot'])?.hit.strength).toBe(2)
    }
  })

  it('keeps scripted 10-second normal DPS within five percent of the mean', () => {
    const attackById = new Map(attackCatalog.map((attack) => [attack.id, attack]))
    const durationMs = 10_000
    const dps = characters.map((character) => {
      const normals = limbIds(character).map((id) => attackById.get(id)!)
      let elapsedMs = 0
      let totalDamage = 0
      let index = 0

      while (true) {
        const normal = normals[index % normals.length]
        const effectiveDuration = totalTiming(normal) / character.attackSpeedScale
        if (elapsedMs + effectiveDuration > durationMs) break
        elapsedMs += effectiveDuration
        totalDamage += normal.hit.damage * character.damageScale
        index += 1
      }

      return totalDamage / (durationMs / 1_000)
    })
    const mean = dps.reduce((sum, value) => sum + value, 0) / dps.length

    for (const value of dps) {
      expect(Math.abs(value - mean) / mean).toBeLessThanOrEqual(0.05)
    }
    expect(dps[0]).toBeCloseTo(20)
    expect(dps[1]).toBeCloseTo(19.68)
    expect(dps[2]).toBeCloseTo(19.2)
  })
})
