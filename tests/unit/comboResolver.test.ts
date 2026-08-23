import { describe, expect, it } from 'vitest'
import type { BufferedAction } from '../../src/domain/combat/inputBuffer'
import {
  resolveCombo,
  type ComboRecipe,
  type ComboResolverProfile,
} from '../../src/domain/combat/comboResolver'
import { characters } from '../../src/content/characters'

const attack = (
  limb: 'right-hand' | 'left-hand' | 'right-foot' | 'left-foot',
  enqueuedAtMs: number,
): BufferedAction => ({
  sequence: enqueuedAtMs + 1,
  edge: { type: 'attack', limb },
  attackCandidate: limb,
  enqueuedAtMs,
  expiresAtMs: enqueuedAtMs + 180,
})

const history = (...entries: Array<[Parameters<typeof attack>[0], number]>) =>
  entries.map(([limb, enqueuedAtMs]) => ({ limb, enqueuedAtMs }))

const recipe = (
  id: string,
  inputs: ComboRecipe['inputs'],
  attackId: string,
  overrides: Partial<ComboRecipe> = {},
): ComboRecipe => ({
  id,
  inputs,
  attackId,
  maxGapMs: 250,
  meterCost: 0,
  groundedOnly: true,
  airborneOnly: false,
  requiresFullMeter: false,
  ...overrides,
})

const profile: ComboResolverProfile = {
  normalAttackIds: {
    'right-hand': 'test-right-hand',
    'left-hand': 'test-left-hand',
    'right-foot': 'test-right-foot',
    'left-foot': 'test-left-foot',
  },
  jumpAttackId: 'test-jump-attack',
  techniqueRecipes: [
    recipe('test-short', ['right-hand', 'left-hand'], 'test-short-attack'),
    recipe(
      'test-long',
      ['right-foot', 'right-hand', 'left-hand'],
      'test-long-attack',
    ),
  ],
  superRecipe: recipe(
    'test-super',
    ['left-foot', 'right-foot', 'right-hand', 'left-hand'],
    'test-super-attack',
    { meterCost: 100, requiresFullMeter: true, groundedOnly: true },
  ),
}

describe('resolveCombo', () => {
  it('returns undefined for a non-attack buffered edge', () => {
    const jump: BufferedAction = {
      sequence: 1,
      edge: { type: 'jump' },
      enqueuedAtMs: 0,
      expiresAtMs: 180,
    }

    expect(resolveCombo(jump, [], profile, { airborne: false, meter: 0 })).toBeUndefined()
  })

  it('returns the normal immediately instead of waiting for a possible recipe', () => {
    expect(
      resolveCombo(attack('right-hand', 0), [], profile, {
        airborne: false,
        meter: 0,
      }),
    ).toEqual({ attackId: 'test-right-hand', meterCost: 0 })
  })

  it('appends the current edge by timestamp and chooses the longest completed suffix', () => {
    expect(
      resolveCombo(
        attack('left-hand', 400),
        history(['right-foot', 0], ['right-hand', 200]),
        profile,
        { airborne: false, meter: 0 },
      ),
    ).toEqual({
      attackId: 'test-long-attack',
      recipeId: 'test-long',
      meterCost: 0,
    })
  })

  it('rejects a completed sequence when any adjacent gap exceeds maxGapMs', () => {
    expect(
      resolveCombo(
        attack('left-hand', 501),
        history(['right-foot', 0], ['right-hand', 250]),
        profile,
        { airborne: false, meter: 0 },
      ),
    ).toEqual({ attackId: 'test-left-hand', meterCost: 0 })
  })

  it('rejects history that is later than the current edge timestamp', () => {
    expect(
      resolveCombo(
        attack('left-hand', 99),
        history(['right-hand', 100]),
        profile,
        { airborne: false, meter: 0 },
      ),
    ).toEqual({ attackId: 'test-left-hand', meterCost: 0 })
  })

  it('filters grounded, airborne, and full-meter requirements', () => {
    const superHistory = history(
      ['left-foot', 0],
      ['right-foot', 100],
      ['right-hand', 200],
    )

    expect(
      resolveCombo(attack('left-hand', 300), superHistory, profile, {
        airborne: false,
        meter: 99,
      }),
    ).toEqual({
      attackId: 'test-long-attack',
      recipeId: 'test-long',
      meterCost: 0,
    })

    expect(
      resolveCombo(attack('left-hand', 300), superHistory, profile, {
        airborne: true,
        meter: 100,
      }),
    ).toEqual({ attackId: 'test-jump-attack', meterCost: 0 })

    const airborneProfile: ComboResolverProfile = {
      ...profile,
      techniqueRecipes: [
        recipe(
          'test-airborne',
          ['right-hand', 'left-hand'],
          'test-airborne-attack',
          { groundedOnly: false, airborneOnly: true },
        ),
      ],
    }
    expect(
      resolveCombo(
        attack('left-hand', 300),
        history(['right-hand', 200]),
        airborneProfile,
        { airborne: true, meter: 0 },
      ),
    ).toMatchObject({ attackId: 'test-airborne-attack', recipeId: 'test-airborne' })

    expect(
      resolveCombo(attack('left-hand', 300), superHistory, profile, {
        airborne: false,
        meter: 100,
      }),
    ).toEqual({
      attackId: 'test-super-attack',
      recipeId: 'test-super',
      meterCost: 100,
    })
  })

  it('retains authored order when eligible recipes have equal length', () => {
    const authoredFirst = recipe(
      'test-first',
      ['right-hand', 'left-hand'],
      'test-first-attack',
    )
    const equalProfile: ComboResolverProfile = {
      ...profile,
      techniqueRecipes: [
        authoredFirst,
        recipe('test-second', authoredFirst.inputs, 'test-second-attack'),
      ],
    }

    expect(
      resolveCombo(
        attack('left-hand', 100),
        history(['right-hand', 0]),
        equalProfile,
        { airborne: false, meter: 0 },
      ),
    ).toMatchObject({ recipeId: 'test-first', attackId: 'test-first-attack' })
  })

  it('resolves every authored character profile directly', () => {
    for (const character of characters) {
      const result = resolveCombo(attack('right-hand', 0), [], character, {
        airborne: false,
        meter: 0,
      })
      expect(result?.attackId).toBe(character.normalAttackIds['right-hand'])
    }
  })
})
