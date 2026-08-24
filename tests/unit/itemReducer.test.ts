import { describe, expect, it } from 'vitest'

import {
  EMP_BASE_DURATION_MS,
  EMP_RADIUS_PX,
  ITEM_PICKUP_RADIUS_PX,
  REPAIR_AMOUNT_HP,
} from '../../src/content/items'
import {
  createItemRuntimeState,
  itemReducer,
  type ItemInventory,
  type ItemPickupSnapshot,
  type ItemTargetSnapshot,
} from '../../src/domain/items/itemReducer'
import type { ItemId } from '../../src/domain/items/types'

const inventory = (
  emp: 0 | 1,
  repair: 0 | 1,
  selectedItemId: ItemInventory['selectedItemId'] = null,
): ItemInventory => ({
  counts: { emp, 'repair-kit': repair },
  selectedItemId,
})

const itemIdentity: readonly ItemId[] = ['emp', 'repair-kit']

const pickup = (
  id: string,
  itemId: ItemPickupSnapshot['itemId'],
  x: number,
  y = 0,
): ItemPickupSnapshot => ({ id, itemId, position: { x, y }, consumed: false })

const target = (
  id: string,
  x: number,
  targetClass: ItemTargetSnapshot['targetClass'] = 'normal',
): ItemTargetSnapshot => ({
  id,
  position: { x, y: 0 },
  living: true,
  targetClass,
})

const use = (
  hp: number,
  maxHp: number,
  targets: readonly ItemTargetSnapshot[] = [],
) => ({
  type: 'interact-use' as const,
  player: { position: { x: 0, y: 0 }, hp, maxHp, living: hp > 0 },
  targets,
})

describe('itemReducer', () => {
  it('owns item identity inside the item domain', () => {
    expect(itemIdentity).toEqual(['emp', 'repair-kit'])
  })

  it('keeps two independent one-count slots and cycles held items in fixed wrap order', () => {
    const empty = createItemRuntimeState({ inventory: inventory(0, 0) })
    expect(itemReducer(empty, { type: 'cycle-item' }).state.inventory).toEqual(
      inventory(0, 0),
    )

    const both = createItemRuntimeState({ inventory: inventory(1, 1, null) })
    const first = itemReducer(both, { type: 'cycle-item' }).state
    const second = itemReducer(first, { type: 'cycle-item' }).state
    const wrapped = itemReducer(second, { type: 'cycle-item' }).state
    expect(first.inventory).toEqual(inventory(1, 1, 'emp'))
    expect(second.inventory).toEqual(inventory(1, 1, 'repair-kit'))
    expect(wrapped.inventory).toEqual(inventory(1, 1, 'emp'))

    const repairOnly = createItemRuntimeState({
      inventory: inventory(0, 1, 'emp'),
    })
    expect(itemReducer(repairOnly, { type: 'cycle-item' }).state.inventory).toEqual(
      inventory(0, 1, 'repair-kit'),
    )
  })

  it('gives pickup handling priority over use and leaves a full-slot pickup in place', () => {
    const state = createItemRuntimeState({
      inventory: inventory(1, 1, 'repair-kit'),
      pickups: [pickup('near-emp', 'emp', ITEM_PICKUP_RADIUS_PX)],
    })
    const result = itemReducer(state, use(50, 100))

    expect(result.state).toEqual(state)
    expect(result.effects).toEqual([])
  })

  it('acquires a nearby pickup instead of using the currently selected item on the same E edge', () => {
    const state = createItemRuntimeState({
      inventory: inventory(0, 1, 'repair-kit'),
      pickups: [pickup('near-emp', 'emp', 10)],
    })

    const result = itemReducer(state, use(50, 100))

    expect(result.state.inventory).toEqual(inventory(1, 1, 'repair-kit'))
    expect(result.state.pickups[0].consumed).toBe(true)
    expect(result.effects).toEqual([
      { type: 'pickup-acquired', pickupId: 'near-emp', itemId: 'emp' },
    ])
  })

  it('selects the nearest pickup by Euclidean XY distance and breaks ties by stable id', () => {
    const state = createItemRuntimeState({
      inventory: inventory(0, 0),
      pickups: [
        pickup('z-tie', 'emp', 24, 32),
        pickup('far', 'repair-kit', ITEM_PICKUP_RADIUS_PX, 0),
        pickup('a-tie', 'repair-kit', -24, -32),
      ],
    })
    const result = itemReducer(state, use(100, 100))

    expect(result.state.inventory).toEqual(inventory(0, 1, 'repair-kit'))
    expect(result.state.pickups.find((entry) => entry.id === 'a-tie')?.consumed).toBe(true)
    expect(result.state.pickups.find((entry) => entry.id === 'z-tie')?.consumed).toBe(false)
    expect(result.effects).toEqual([
      { type: 'pickup-acquired', pickupId: 'a-tie', itemId: 'repair-kit' },
    ])
  })

  it('applies EMP at the exact boundary with resistance, ignores invalid targets, and consumes once', () => {
    const state = createItemRuntimeState({ inventory: inventory(1, 0, 'emp') })
    const result = itemReducer(
      state,
      use(100, 100, [
        target('normal', EMP_RADIUS_PX),
        target('elite', 10, 'elite'),
        target('boss', 10, 'boss'),
        { ...target('defeated', 10), living: false },
        target('outside', EMP_RADIUS_PX + 0.001),
      ]),
    )

    expect(result.state.inventory).toEqual(inventory(0, 0))
    expect(result.state.empRemainingMsByTargetId).toEqual({
      normal: EMP_BASE_DURATION_MS,
      elite: 1_300,
      boss: 700,
    })
    expect(result.effects).toEqual([
      {
        type: 'emp-applied',
        targets: [
          { targetId: 'boss', durationMs: 700 },
          { targetId: 'elite', durationMs: 1_300 },
          { targetId: 'normal', durationMs: 2_000 },
        ],
      },
    ])
  })

  it('does not consume EMP without an affected living target', () => {
    const state = createItemRuntimeState({ inventory: inventory(1, 0, 'emp') })
    const result = itemReducer(state, use(100, 100, [target('outside', EMP_RADIUS_PX + 1)]))
    expect(result.state).toEqual(state)
    expect(result.effects).toEqual([])
  })

  it('uses larger remaining EMP duration, expires at exact active time, and ignores invalid delta', () => {
    let state = createItemRuntimeState({ inventory: inventory(1, 0, 'emp') })
    state = itemReducer(state, use(100, 100, [target('elite', 1, 'elite')])).state
    const invalid = itemReducer(state, { type: 'advance-time', deltaMs: Number.NaN })
    expect(invalid.state.empRemainingMsByTargetId.elite).toBe(1_300)

    const partial = itemReducer(invalid.state, { type: 'advance-time', deltaMs: 1_299 })
    expect(partial.state.empRemainingMsByTargetId.elite).toBe(1)
    const expired = itemReducer(partial.state, { type: 'advance-time', deltaMs: 1 })
    expect(expired.state.empRemainingMsByTargetId).toEqual({})
    expect(expired.effects).toEqual([{ type: 'emp-expired', targetIds: ['elite'] }])

    const reapplyBase = createItemRuntimeState({ inventory: inventory(1, 0, 'emp') })
    reapplyBase.empRemainingMsByTargetId.elite = 1_500
    const reapplied = itemReducer(reapplyBase, use(100, 100, [target('elite', 1, 'elite')]))
    expect(reapplied.state.empRemainingMsByTargetId.elite).toBe(1_500)
  })

  it('repairs through an explicit clamped effect and does not consume at full HP or while defeated', () => {
    const damaged = createItemRuntimeState({ inventory: inventory(0, 1, 'repair-kit') })
    const repaired = itemReducer(damaged, use(80, 100))
    expect(repaired.effects).toEqual([{ type: 'repair-requested', amount: 20 }])
    expect(repaired.state.inventory).toEqual(inventory(0, 0))

    const deeplyDamaged = createItemRuntimeState({
      inventory: inventory(0, 1, 'repair-kit'),
    })
    expect(itemReducer(deeplyDamaged, use(10, 100)).effects).toEqual([
      { type: 'repair-requested', amount: REPAIR_AMOUNT_HP },
    ])

    for (const [hp, maxHp] of [[100, 100], [0, 100]] as const) {
      const state = createItemRuntimeState({ inventory: inventory(0, 1, 'repair-kit') })
      expect(itemReducer(state, use(hp, maxHp))).toEqual({ state, effects: [] })
    }
    expect(REPAIR_AMOUNT_HP).toBe(45)
  })

  it('deep-clones constructor input and clears only temporary EMP effects on reset', () => {
    const sourceInventory = inventory(1, 0, 'emp')
    const sourcePickups = [pickup('emp-1', 'emp', 10)]
    const state = createItemRuntimeState({
      inventory: sourceInventory,
      pickups: sourcePickups,
      empRemainingMsByTargetId: { enemy: 100 },
    })
    sourceInventory.counts.emp = 0
    sourcePickups[0].consumed = true

    const reset = itemReducer(state, { type: 'clear-emp' })
    expect(reset.state.inventory.counts.emp).toBe(1)
    expect(reset.state.pickups[0].consumed).toBe(false)
    expect(reset.state.empRemainingMsByTargetId).toEqual({})
  })
})
