import { describe, expect, it } from 'vitest'

import { EMP_RADIUS_PX } from '../../src/content/items'
import { createItemRuntimeState } from '../../src/domain/items/itemReducer'
import {
  deriveBlockedItemFeedback,
  deriveCycleItemFeedback,
  deriveItemInteractionFeedback,
} from '../../src/presentation/ItemActionFeedback'

const player = (hp = 100, maxHp = 100) => ({
  position: { x: 0, y: 0 },
  hp,
  maxHp,
  living: hp > 0,
})

describe('item action feedback', () => {
  it('confirms Q even when the inventory is empty or has only one item', () => {
    const empty = createItemRuntimeState().inventory
    expect(deriveCycleItemFeedback(empty, empty)).toBe('NO ITEM')

    const emp = createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
    }).inventory
    expect(deriveCycleItemFeedback(emp, emp)).toBe('EMP READY')
  })

  it('explains E failures for distance, full HP, and missing EMP targets', () => {
    const farPickup = createItemRuntimeState({
      pickups: [{
        id: 'repair',
        itemId: 'repair-kit',
        position: { x: 999, y: 0 },
        consumed: false,
      }],
    })
    expect(deriveItemInteractionFeedback({
      stateBefore: farPickup,
      player: player(),
      targets: [],
      effects: [],
    })).toBe('MOVE NEAR ITEM')

    const repair = createItemRuntimeState({
      inventory: {
        counts: { emp: 0, 'repair-kit': 1 },
        selectedItemId: 'repair-kit',
      },
    })
    expect(deriveItemInteractionFeedback({
      stateBefore: repair,
      player: player(),
      targets: [],
      effects: [],
    })).toBe('HP FULL')

    const emp = createItemRuntimeState({
      inventory: { counts: { emp: 1, 'repair-kit': 0 }, selectedItemId: 'emp' },
    })
    expect(deriveItemInteractionFeedback({
      stateBefore: emp,
      player: player(),
      targets: [{
        id: 'far-enemy',
        position: { x: EMP_RADIUS_PX + 1, y: 0 },
        living: true,
        targetClass: 'normal',
      }],
      effects: [],
    })).toBe('NO TARGET IN RANGE')
  })

  it('shows why E is blocked during attack recovery and knockdown', () => {
    expect(deriveBlockedItemFeedback('attacking', 'recovery', false, true))
      .toBe('WAIT - ATTACK RECOVERY')
    expect(deriveBlockedItemFeedback('knocked-down', null, false, true))
      .toBe('WAIT - RECOVER FIRST')
    expect(deriveBlockedItemFeedback('idle', null, false, false))
      .toBe('ITEMS LOCKED')
  })

  it('confirms successful pickup, repair, and EMP use', () => {
    const state = createItemRuntimeState()
    expect(deriveItemInteractionFeedback({
      stateBefore: state,
      player: player(),
      targets: [],
      effects: [{ type: 'pickup-acquired', pickupId: 'emp', itemId: 'emp' }],
    })).toBe('PICKED UP EMP')
    expect(deriveItemInteractionFeedback({
      stateBefore: state,
      player: player(30),
      targets: [],
      effects: [{ type: 'repair-requested', amount: 45 }],
    })).toBe('REPAIRED +45')
    expect(deriveItemInteractionFeedback({
      stateBefore: state,
      player: player(),
      targets: [],
      effects: [{
        type: 'emp-applied',
        targets: [{ targetId: 'a', durationMs: 2_000 }],
      }],
    })).toBe('EMP HIT 1')
  })
})
