import type { EmpTargetClass } from './items'

export type BossAttackId = 'boss-dredger-slam' | 'boss-floodline-charge'
export type BossPhase = 1 | 2 | 3

export interface BossPatternDefinition {
  readonly id: BossAttackId
  readonly range: { readonly x: number; readonly y: number }
}

export interface BossPhaseDefinition {
  readonly phase: BossPhase
  readonly order: readonly [BossAttackId, BossAttackId]
  readonly telegraphMsByAttackId: Readonly<Record<BossAttackId, number>>
  readonly chaseSpeed: number
  readonly attackSpeedScale: number
}

export interface BossDefinition {
  readonly id: 'boss-silo-dredger'
  readonly baseBodyId: 'bulwark-frame'
  readonly maxHp: 960
  readonly radius: number
  readonly damageScale: 1
  readonly targetClass: EmpTargetClass
  readonly appearance: { readonly scale: number; readonly tint: number }
  readonly patterns: readonly [BossPatternDefinition, BossPatternDefinition]
  readonly phases: readonly [BossPhaseDefinition, BossPhaseDefinition, BossPhaseDefinition]
}

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

export const bossDefinitions: readonly BossDefinition[] = deepFreeze([
  {
    id: 'boss-silo-dredger',
    baseBodyId: 'bulwark-frame',
    maxHp: 960,
    radius: 38,
    damageScale: 1,
    targetClass: 'boss',
    appearance: { scale: 1.5, tint: 0xf97316 },
    patterns: [
      { id: 'boss-dredger-slam', range: { x: 96, y: 46 } },
      { id: 'boss-floodline-charge', range: { x: 190, y: 26 } },
    ],
    phases: [
      {
        phase: 1,
        order: ['boss-dredger-slam', 'boss-floodline-charge'],
        telegraphMsByAttackId: {
          'boss-dredger-slam': 850,
          'boss-floodline-charge': 1_100,
        },
        chaseSpeed: 72,
        attackSpeedScale: 1,
      },
      {
        phase: 2,
        order: ['boss-floodline-charge', 'boss-dredger-slam'],
        telegraphMsByAttackId: {
          'boss-dredger-slam': 650,
          'boss-floodline-charge': 850,
        },
        chaseSpeed: 88,
        attackSpeedScale: 1.1,
      },
      {
        phase: 3,
        order: ['boss-dredger-slam', 'boss-floodline-charge'],
        telegraphMsByAttackId: {
          'boss-dredger-slam': 500,
          'boss-floodline-charge': 650,
        },
        chaseSpeed: 104,
        attackSpeedScale: 1.25,
      },
    ],
  },
])

export const getBossDefinition = (id: string): BossDefinition => {
  const definition = bossDefinitions.find((entry) => entry.id === id)
  if (!definition) throw new Error(`Unknown boss: ${id}`)
  return {
    ...definition,
    appearance: { ...definition.appearance },
    patterns: definition.patterns.map((pattern) => ({
      ...pattern,
      range: { ...pattern.range },
    })) as unknown as BossDefinition['patterns'],
    phases: definition.phases.map((phase) => ({
      ...phase,
      order: [...phase.order],
      telegraphMsByAttackId: { ...phase.telegraphMsByAttackId },
    })) as unknown as BossDefinition['phases'],
  }
}

export const isBossDefinitionId = (id: string): id is BossDefinition['id'] =>
  id === 'boss-silo-dredger'
