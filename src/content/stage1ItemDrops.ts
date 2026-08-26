import type {
  ItemPickupSnapshot,
  ItemPoint,
} from '../domain/items/itemReducer'
import type { ItemId } from '../domain/items/types'

/**
 * Guaranteed Stage 1 drops keyed by the wave director's exact
 * `${waveId}:${orderId}` runtime enemy identity.
 */
export const STAGE1_ITEM_DROP_TABLE: Readonly<Record<string, ItemId>> = Object.freeze({
  'n9-depot-wave-1:entry-patrol': 'repair-kit',
  'n9-depot-wave-2:anchor-sentinel': 'emp',
  'n9-depot-wave-5:last-enforcer': 'repair-kit',
  'service-train-wave-1:train-striker': 'repair-kit',
  'service-train-wave-2:train-enforcer': 'emp',
  'service-train-wave-4:train-final-enforcer': 'repair-kit',
  'flooded-tunnel-wave-1:tunnel-striker': 'repair-kit',
  'flooded-tunnel-wave-1:tunnel-sentinel': 'emp',
  'flooded-tunnel-wave-3:tunnel-final-enforcer': 'emp',
})

export const stageOneEnemyDropPickupId = (enemyId: string): string =>
  `stage1-drop:${enemyId}`

/** Returns a fresh runtime pickup at the defeated enemy's final position. */
export const createStageOneEnemyDropPickup = (
  enemyId: string,
  position: Readonly<ItemPoint>,
): ItemPickupSnapshot | null => {
  if (!Object.hasOwn(STAGE1_ITEM_DROP_TABLE, enemyId)) return null
  return {
    id: stageOneEnemyDropPickupId(enemyId),
    itemId: STAGE1_ITEM_DROP_TABLE[enemyId],
    position: { x: position.x, y: position.y },
    consumed: false,
  }
}
