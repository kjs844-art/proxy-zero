import type { ItemId } from '../domain/items/types'

export const ITEM_PICKUP_RADIUS_PX = 48
export const EMP_RADIUS_PX = 150
export const EMP_BASE_DURATION_MS = 2_000
export const REPAIR_AMOUNT_HP = 45

export const ITEM_ORDER = Object.freeze(['emp', 'repair-kit'] as const)

export type EmpTargetClass = 'normal' | 'elite' | 'boss'

export interface ItemDefinition {
  id: ItemId
  label: string
}

export const EMP_DURATION_SCALE: Readonly<Record<EmpTargetClass, number>> = Object.freeze({
  normal: 1,
  elite: 0.65,
  boss: 0.35,
})

export const itemCatalog: readonly Readonly<ItemDefinition>[] = Object.freeze([
  Object.freeze({ id: 'emp', label: 'EMP' }),
  Object.freeze({ id: 'repair-kit', label: 'REPAIR' }),
])
