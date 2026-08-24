import type { EmpTargetClass } from './items'

export interface ElitePatternDefinition {
  readonly id: 'elite-rail-hammer' | 'elite-lane-charge'
  readonly telegraphMs: number
  readonly activeMs: number
  readonly recoveryMs: number
  readonly range: { readonly x: number; readonly y: number }
  readonly damage: number
}

export interface EliteDefinition {
  readonly id: 'elite-bulwark-frame'
  readonly baseBodyId: 'bulwark-frame'
  readonly maxHp: number
  readonly radius: number
  readonly moveSpeed: number
  readonly damageScale: number
  readonly targetClass: EmpTargetClass
  readonly appearance: { readonly scale: number; readonly tint: number }
  readonly patterns: readonly ElitePatternDefinition[]
}

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

export const eliteDefinitions: readonly EliteDefinition[] = deepFreeze([
  {
    id: 'elite-bulwark-frame', baseBodyId: 'bulwark-frame', maxHp: 360,
    radius: 30, moveSpeed: 88, damageScale: 1, targetClass: 'elite',
    appearance: { scale: 1.22, tint: 0xd8b4fe },
    patterns: [
      {
        id: 'elite-rail-hammer', telegraphMs: 650, activeMs: 150,
        recoveryMs: 550, range: { x: 88, y: 40 }, damage: 14,
      },
      {
        id: 'elite-lane-charge', telegraphMs: 900, activeMs: 220,
        recoveryMs: 700, range: { x: 180, y: 28 }, damage: 20,
      },
    ],
  },
])

export const getEliteDefinition = (id: string): EliteDefinition => {
  const definition = eliteDefinitions.find((entry) => entry.id === id)
  if (!definition) throw new Error(`Unknown elite: ${id}`)
  return {
    ...definition,
    appearance: { ...definition.appearance },
    patterns: definition.patterns.map((pattern) => ({ ...pattern, range: { ...pattern.range } })),
  }
}

export const isEliteDefinitionId = (id: string): id is EliteDefinition['id'] =>
  id === 'elite-bulwark-frame'
