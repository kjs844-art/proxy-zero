import type { ComboRecipe, ComboResolverProfile } from '../domain/combat/comboResolver'
import type { LimbInput } from '../domain/combat/types'

export type CharacterId = 'han' | 'mina' | 'jin'

export interface CharacterDefinition extends ComboResolverProfile {
  id: CharacterId
  maxHp: number
  damageScale: number
  attackSpeedScale: number
  moveSpeedScale: number
  normalAttackIds: Readonly<Record<LimbInput, string>>
  techniqueRecipes: readonly [ComboRecipe, ComboRecipe]
  jumpAttackId: string
  superAttackId: string
  superRecipe: ComboRecipe
}

const technique = (
  id: string,
  inputs: readonly LimbInput[],
  attackId: string,
  maxGapMs: number,
): ComboRecipe => ({
  id,
  inputs,
  attackId,
  maxGapMs,
  meterCost: 0,
  groundedOnly: true,
  airborneOnly: false,
  requiresFullMeter: false,
})

const superRecipe = (
  id: string,
  inputs: readonly LimbInput[],
  attackId: string,
): ComboRecipe => ({
  id,
  inputs,
  attackId,
  maxGapMs: 300,
  meterCost: 100,
  groundedOnly: true,
  airborneOnly: false,
  requiresFullMeter: true,
})

export const characters: readonly CharacterDefinition[] = [
  {
    id: 'han',
    maxHp: 100,
    damageScale: 1,
    attackSpeedScale: 1,
    moveSpeedScale: 1,
    normalAttackIds: {
      'right-hand': 'han-right-hand',
      'left-hand': 'han-left-hand',
      'right-foot': 'han-right-foot',
      'left-foot': 'han-left-foot',
    },
    techniqueRecipes: [
      technique('han-cross-strike-combo', ['right-hand', 'left-hand'], 'han-cross-strike', 260),
      technique(
        'han-rising-kick-combo',
        ['left-foot', 'right-foot', 'right-hand'],
        'han-rising-kick',
        280,
      ),
    ],
    jumpAttackId: 'han-jump-kick',
    superAttackId: 'han-iron-tempest',
    superRecipe: superRecipe(
      'han-iron-tempest-combo',
      ['right-hand', 'left-hand', 'right-foot', 'left-foot'],
      'han-iron-tempest',
    ),
  },
  {
    id: 'mina',
    maxHp: 85,
    damageScale: 0.82,
    attackSpeedScale: 1.22,
    moveSpeedScale: 1.18,
    normalAttackIds: {
      'right-hand': 'mina-right-hand',
      'left-hand': 'mina-left-hand',
      'right-foot': 'mina-right-foot',
      'left-foot': 'mina-left-foot',
    },
    techniqueRecipes: [
      technique('mina-flash-step-combo', ['right-hand', 'right-foot'], 'mina-flash-step', 220),
      technique(
        'mina-sky-needle-combo',
        ['left-foot', 'right-hand', 'left-foot'],
        'mina-sky-needle',
        240,
      ),
    ],
    jumpAttackId: 'mina-jump-heel',
    superAttackId: 'mina-prism-rush',
    superRecipe: superRecipe(
      'mina-prism-rush-combo',
      ['left-hand', 'right-hand', 'left-foot', 'right-foot'],
      'mina-prism-rush',
    ),
  },
  {
    id: 'jin',
    maxHp: 125,
    damageScale: 1.28,
    attackSpeedScale: 0.78,
    moveSpeedScale: 0.84,
    normalAttackIds: {
      'right-hand': 'jin-right-hand',
      'left-hand': 'jin-left-hand',
      'right-foot': 'jin-right-foot',
      'left-foot': 'jin-left-foot',
    },
    techniqueRecipes: [
      technique('jin-anchor-blow-combo', ['left-hand', 'right-hand'], 'jin-anchor-blow', 300),
      technique(
        'jin-fault-line-combo',
        ['right-foot', 'left-foot', 'right-hand'],
        'jin-fault-line',
        320,
      ),
    ],
    jumpAttackId: 'jin-jump-crush',
    superAttackId: 'jin-zero-breaker',
    superRecipe: superRecipe(
      'jin-zero-breaker-combo',
      ['right-foot', 'left-foot', 'left-hand', 'right-hand'],
      'jin-zero-breaker',
    ),
  },
]
