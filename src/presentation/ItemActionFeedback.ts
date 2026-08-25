import { EMP_RADIUS_PX } from '../content/items'
import type { ActorMode, AttackPhase } from '../domain/combat/combatReducer'
import type {
  ItemEffect,
  ItemInventory,
  ItemPlayerSnapshot,
  ItemRuntimeState,
  ItemTargetSnapshot,
} from '../domain/items/itemReducer'
import type { ItemId } from '../domain/items/types'

const labelByItemId: Readonly<Record<ItemId, string>> = {
  emp: 'EMP',
  'repair-kit': 'REPAIR',
}

const squaredDistance = (
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): number => {
  const deltaX = left.x - right.x
  const deltaY = left.y - right.y
  return deltaX * deltaX + deltaY * deltaY
}

const heldItemIds = (inventory: Readonly<ItemInventory>): ItemId[] =>
  (Object.keys(inventory.counts) as ItemId[]).filter(
    (itemId) => inventory.counts[itemId] === 1,
  )

export const deriveCycleItemFeedback = (
  before: Readonly<ItemInventory>,
  after: Readonly<ItemInventory>,
): string => {
  const held = heldItemIds(after)
  if (held.length === 0 || after.selectedItemId === null) return 'NO ITEM'
  const selectedLabel = labelByItemId[after.selectedItemId]
  return before.selectedItemId === after.selectedItemId
    ? `${selectedLabel} READY`
    : `SELECTED ${selectedLabel}`
}

export interface ItemInteractionFeedbackInput {
  readonly stateBefore: Readonly<ItemRuntimeState>
  readonly player: Readonly<ItemPlayerSnapshot>
  readonly targets: readonly Readonly<ItemTargetSnapshot>[]
  readonly effects: readonly Readonly<ItemEffect>[]
}

export const deriveItemInteractionFeedback = (
  input: Readonly<ItemInteractionFeedbackInput>,
): string => {
  const pickup = input.effects.find((effect) => effect.type === 'pickup-acquired')
  if (pickup?.type === 'pickup-acquired') {
    return `PICKED UP ${labelByItemId[pickup.itemId]}`
  }
  const repair = input.effects.find((effect) => effect.type === 'repair-requested')
  if (repair?.type === 'repair-requested') return `REPAIRED +${repair.amount}`
  const emp = input.effects.find((effect) => effect.type === 'emp-applied')
  if (emp?.type === 'emp-applied') return `EMP HIT ${emp.targets.length}`

  if (!input.player.living || input.player.hp <= 0) return 'WAIT - RECOVER FIRST'
  const selected = input.stateBefore.inventory.selectedItemId
  if (
    selected === 'repair-kit' &&
    input.stateBefore.inventory.counts['repair-kit'] === 1 &&
    input.player.hp >= input.player.maxHp
  ) {
    return 'HP FULL'
  }
  if (selected === 'emp' && input.stateBefore.inventory.counts.emp === 1) {
    const maximumSquared = EMP_RADIUS_PX * EMP_RADIUS_PX
    const targetInRange = input.targets.some(
      (target) =>
        target.living &&
        squaredDistance(target.position, input.player.position) <= maximumSquared,
    )
    if (!targetInRange) return 'NO TARGET IN RANGE'
  }

  if (heldItemIds(input.stateBefore.inventory).length === 0) {
    return input.stateBefore.pickups.some((pickupEntry) => !pickupEntry.consumed)
      ? 'MOVE NEAR ITEM'
      : 'NO ITEM'
  }
  if (selected === null || input.stateBefore.inventory.counts[selected] === 0) {
    return 'Q SELECT ITEM'
  }
  return 'ITEM NOT READY'
}

export const deriveBlockedItemFeedback = (
  mode: ActorMode,
  attackPhase: AttackPhase | null,
  discardUse: boolean,
  zoneActive: boolean,
): string => {
  if (!zoneActive) return 'ITEMS LOCKED'
  if (discardUse || mode === 'hitstun' || mode === 'knocked-down' || mode === 'getting-up') {
    return 'WAIT - RECOVER FIRST'
  }
  if (mode === 'attacking') {
    return attackPhase === 'recovery'
      ? 'WAIT - ATTACK RECOVERY'
      : 'WAIT - FINISH ATTACK'
  }
  if (mode === 'defeated') return 'WAIT - RECOVER FIRST'
  return 'ITEM NOT READY'
}
