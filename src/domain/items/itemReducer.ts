import {
  EMP_BASE_DURATION_MS,
  EMP_DURATION_SCALE,
  EMP_RADIUS_PX,
  ITEM_ORDER,
  ITEM_PICKUP_RADIUS_PX,
  REPAIR_AMOUNT_HP,
  type EmpTargetClass,
} from '../../content/items'
import type { ItemId } from './types'

export type { ItemId } from './types'

export type ItemCount = 0 | 1

export interface ItemInventory {
  counts: Record<ItemId, ItemCount>
  selectedItemId: ItemId | null
}

export interface ItemPoint {
  x: number
  y: number
}

export interface ItemPickupSnapshot {
  id: string
  itemId: ItemId
  position: ItemPoint
  consumed: boolean
}

export interface ItemTargetSnapshot {
  id: string
  position: ItemPoint
  living: boolean
  targetClass: EmpTargetClass
}

export interface ItemPlayerSnapshot {
  position: ItemPoint
  hp: number
  maxHp: number
  living: boolean
}

export interface ItemRuntimeState {
  inventory: ItemInventory
  pickups: ItemPickupSnapshot[]
  empRemainingMsByTargetId: Record<string, number>
}

export interface CreateItemRuntimeOptions {
  inventory?: Readonly<ItemInventory>
  pickups?: readonly Readonly<ItemPickupSnapshot>[]
  empRemainingMsByTargetId?: Readonly<Record<string, number>>
}

export type ItemCommand =
  | { type: 'cycle-item' }
  | {
      type: 'spawn-pickups'
      pickups: readonly Readonly<ItemPickupSnapshot>[]
    }
  | {
      type: 'interact-use'
      player: Readonly<ItemPlayerSnapshot>
      targets: readonly Readonly<ItemTargetSnapshot>[]
    }
  | { type: 'advance-time'; deltaMs: number }
  | { type: 'clear-emp' }
  | { type: 'remove-targets'; targetIds: readonly string[] }

export type ItemEffect =
  | { type: 'pickup-acquired'; pickupId: string; itemId: ItemId }
  | { type: 'repair-requested'; amount: number }
  | {
      type: 'emp-applied'
      targets: Array<{ targetId: string; durationMs: number }>
    }
  | { type: 'emp-expired'; targetIds: string[] }

export interface ItemReducerResult {
  state: ItemRuntimeState
  effects: ItemEffect[]
}

export const createEmptyItemInventory = (): ItemInventory => ({
  counts: { emp: 0, 'repair-kit': 0 },
  selectedItemId: null,
})

export const cloneItemInventory = (
  inventory: Readonly<ItemInventory>,
): ItemInventory => ({
  counts: {
    emp: inventory.counts.emp,
    'repair-kit': inventory.counts['repair-kit'],
  },
  selectedItemId: inventory.selectedItemId,
})

const isHeld = (inventory: Readonly<ItemInventory>, itemId: ItemId): boolean =>
  inventory.counts[itemId] === 1

const firstHeldItem = (inventory: Readonly<ItemInventory>): ItemId | null =>
  ITEM_ORDER.find((itemId) => isHeld(inventory, itemId)) ?? null

const hasValidSelection = (inventory: Readonly<ItemInventory>): boolean =>
  inventory.selectedItemId !== null && isHeld(inventory, inventory.selectedItemId)

const normalizeSelection = (inventory: ItemInventory): void => {
  if (inventory.selectedItemId !== null && !isHeld(inventory, inventory.selectedItemId)) {
    inventory.selectedItemId = firstHeldItem(inventory)
  }
}

const cloneState = (state: Readonly<ItemRuntimeState>): ItemRuntimeState => ({
  inventory: cloneItemInventory(state.inventory),
  pickups: state.pickups.map((entry) => ({
    ...entry,
    position: { ...entry.position },
  })),
  empRemainingMsByTargetId: { ...state.empRemainingMsByTargetId },
})

export const createItemRuntimeState = (
  options: Readonly<CreateItemRuntimeOptions> = {},
): ItemRuntimeState => {
  const inventory = options.inventory
    ? cloneItemInventory(options.inventory)
    : createEmptyItemInventory()
  normalizeSelection(inventory)
  return {
    inventory,
    pickups: (options.pickups ?? []).map((entry) => ({
      ...entry,
      position: { ...entry.position },
    })),
    empRemainingMsByTargetId: Object.fromEntries(
      Object.entries(options.empRemainingMsByTargetId ?? {}).filter(
        ([, remainingMs]) => Number.isFinite(remainingMs) && remainingMs > 0,
      ),
    ),
  }
}

const squaredDistance = (left: Readonly<ItemPoint>, right: Readonly<ItemPoint>): number => {
  const x = left.x - right.x
  const y = left.y - right.y
  return x * x + y * y
}

const nearestPickup = (
  pickups: readonly Readonly<ItemPickupSnapshot>[],
  playerPosition: Readonly<ItemPoint>,
  inventory: Readonly<ItemInventory>,
): Readonly<ItemPickupSnapshot> | undefined => {
  const maximumSquared = ITEM_PICKUP_RADIUS_PX * ITEM_PICKUP_RADIUS_PX
  return pickups
    .filter(
      (entry) =>
        !entry.consumed &&
        inventory.counts[entry.itemId] === 0 &&
        squaredDistance(entry.position, playerPosition) <= maximumSquared,
    )
    .sort((left, right) => {
      const distanceDifference =
        squaredDistance(left.position, playerPosition) -
        squaredDistance(right.position, playerPosition)
      return distanceDifference || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    })[0]
}

const consumeSelected = (inventory: ItemInventory): void => {
  const selected = inventory.selectedItemId
  if (selected === null) return
  inventory.counts[selected] = 0
  inventory.selectedItemId = firstHeldItem(inventory)
}

const cycleItem = (state: ItemRuntimeState): void => {
  const held = ITEM_ORDER.filter((itemId) => isHeld(state.inventory, itemId))
  if (held.length === 0) {
    state.inventory.selectedItemId = null
    return
  }
  const currentIndex = state.inventory.selectedItemId
    ? held.indexOf(state.inventory.selectedItemId)
    : -1
  state.inventory.selectedItemId = held[(currentIndex + 1) % held.length]
}

const spawnPickups = (
  state: ItemRuntimeState,
  pickups: readonly Readonly<ItemPickupSnapshot>[],
): void => {
  const knownPickupIds = new Set(state.pickups.map((pickup) => pickup.id))
  for (const pickup of pickups) {
    if (knownPickupIds.has(pickup.id)) continue
    state.pickups.push({
      ...pickup,
      position: { ...pickup.position },
    })
    knownPickupIds.add(pickup.id)
  }
}

const tryPickup = (
  state: ItemRuntimeState,
  player: Readonly<ItemPlayerSnapshot>,
  effects: ItemEffect[],
): boolean => {
  const selectedPickup = nearestPickup(state.pickups, player.position, state.inventory)
  if (!selectedPickup) return false

  state.inventory.counts[selectedPickup.itemId] = 1
  if (!hasValidSelection(state.inventory)) {
    state.inventory.selectedItemId = selectedPickup.itemId
  }
  const runtimePickup = state.pickups.find((entry) => entry.id === selectedPickup.id)
  if (runtimePickup) runtimePickup.consumed = true
  effects.push({
    type: 'pickup-acquired',
    pickupId: selectedPickup.id,
    itemId: selectedPickup.itemId,
  })
  return true
}

const tryRepair = (
  state: ItemRuntimeState,
  player: Readonly<ItemPlayerSnapshot>,
  effects: ItemEffect[],
): void => {
  if (!player.living || player.hp <= 0 || player.hp >= player.maxHp) return
  const missingHp = Math.max(0, player.maxHp - player.hp)
  const amount = Math.min(REPAIR_AMOUNT_HP, missingHp)
  if (amount <= 0) return
  consumeSelected(state.inventory)
  effects.push({ type: 'repair-requested', amount })
}

const tryEmp = (
  state: ItemRuntimeState,
  player: Readonly<ItemPlayerSnapshot>,
  targets: readonly Readonly<ItemTargetSnapshot>[],
  effects: ItemEffect[],
): void => {
  if (!player.living || player.hp <= 0) return
  const maximumSquared = EMP_RADIUS_PX * EMP_RADIUS_PX
  const affectedById = new Map<string, number>()
  for (const target of targets) {
    if (!target.living || squaredDistance(target.position, player.position) > maximumSquared) {
      continue
    }
    const durationMs = EMP_BASE_DURATION_MS * EMP_DURATION_SCALE[target.targetClass]
    const prior = affectedById.get(target.id) ?? 0
    affectedById.set(target.id, Math.max(prior, durationMs))
  }
  if (affectedById.size === 0) return

  const applied = [...affectedById]
    .sort(([leftId], [rightId]) =>
      leftId < rightId ? -1 : leftId > rightId ? 1 : 0,
    )
    .map(([targetId, durationMs]) => {
      state.empRemainingMsByTargetId[targetId] = Math.max(
        state.empRemainingMsByTargetId[targetId] ?? 0,
        durationMs,
      )
      return { targetId, durationMs }
    })
  consumeSelected(state.inventory)
  effects.push({ type: 'emp-applied', targets: applied })
}

const advanceTimers = (
  state: ItemRuntimeState,
  requestedDeltaMs: number,
  effects: ItemEffect[],
): void => {
  const deltaMs = Number.isFinite(requestedDeltaMs) ? Math.max(0, requestedDeltaMs) : 0
  if (deltaMs === 0) return
  const expired: string[] = []
  for (const targetId of Object.keys(state.empRemainingMsByTargetId).sort()) {
    const remainingMs = state.empRemainingMsByTargetId[targetId]
    if (remainingMs <= deltaMs) {
      delete state.empRemainingMsByTargetId[targetId]
      expired.push(targetId)
    } else {
      state.empRemainingMsByTargetId[targetId] = remainingMs - deltaMs
    }
  }
  if (expired.length > 0) effects.push({ type: 'emp-expired', targetIds: expired })
}

/** Pure, caller-clocked inventory, pickup, and temporary EMP authority. */
export const itemReducer = (
  incoming: Readonly<ItemRuntimeState>,
  command: Readonly<ItemCommand>,
): ItemReducerResult => {
  const state = cloneState(incoming)
  const effects: ItemEffect[] = []

  if (command.type === 'cycle-item') {
    cycleItem(state)
  } else if (command.type === 'spawn-pickups') {
    spawnPickups(state, command.pickups)
  } else if (command.type === 'advance-time') {
    advanceTimers(state, command.deltaMs, effects)
  } else if (command.type === 'clear-emp') {
    state.empRemainingMsByTargetId = {}
  } else if (command.type === 'remove-targets') {
    for (const targetId of command.targetIds) {
      delete state.empRemainingMsByTargetId[targetId]
    }
  } else if (!tryPickup(state, command.player, effects)) {
    const selected = state.inventory.selectedItemId
    if (selected === 'repair-kit' && isHeld(state.inventory, selected)) {
      tryRepair(state, command.player, effects)
    } else if (selected === 'emp' && isHeld(state.inventory, selected)) {
      tryEmp(state, command.player, command.targets, effects)
    }
  }

  return { state, effects }
}
