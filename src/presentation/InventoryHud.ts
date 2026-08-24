import type Phaser from 'phaser'

import { ITEM_ORDER } from '../content/items'
import type { ItemInventory } from '../domain/items/itemReducer'
import type { ItemId } from '../domain/run/types'

const SAFE_MARGIN = 8
const SLOT_WIDTH = 80
const SLOT_HEIGHT = 38
const SLOT_GAP = 6
const SLOT_Y = 48
const SLOT_START_X = 640 - SAFE_MARGIN - SLOT_WIDTH * 2 - SLOT_GAP
const SELECTED_STROKE = 0x67e8f9
const UNSELECTED_STROKE = 0x334155

interface SlotView {
  itemId: ItemId
  bounds: { x: number; y: number; width: number; height: number }
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  count: 0 | 1
  selected: boolean
}

export interface InventoryHudSnapshot {
  ownedObjectCount: number
  slots: Array<{
    itemId: ItemId
    count: 0 | 1
    selected: boolean
    bounds: { x: number; y: number; width: number; height: number }
  }>
}

const itemLabel: Readonly<Record<ItemId, string>> = {
  emp: 'EMP',
  'repair-kit': 'REPAIR',
}

/** Always-visible, presentation-only two-slot inventory HUD. */
export class InventoryHud {
  private readonly slots: SlotView[]
  private disposed = false

  constructor(scene: Phaser.Scene, inventory: Readonly<ItemInventory>) {
    this.slots = ITEM_ORDER.map((itemId, index) => {
      const x = SLOT_START_X + index * (SLOT_WIDTH + SLOT_GAP)
      const bounds = { x, y: SLOT_Y, width: SLOT_WIDTH, height: SLOT_HEIGHT }
      const background = scene.add
        .rectangle(
          x + SLOT_WIDTH / 2,
          SLOT_Y + SLOT_HEIGHT / 2,
          SLOT_WIDTH,
          SLOT_HEIGHT,
          0x071018,
          0.88,
        )
        .setDepth(10_000)
        .setScrollFactor(0)
      const label = scene.add
        .text(x + SLOT_WIDTH / 2, SLOT_Y + SLOT_HEIGHT / 2, '', {
          align: 'center',
          color: '#e8fbff',
          fontFamily: 'monospace',
          fontSize: '11px',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(10_001)
        .setScrollFactor(0)
      return {
        itemId,
        bounds,
        background,
        label,
        count: 0,
        selected: false,
      }
    })
    this.update(inventory)
  }

  update(inventory: Readonly<ItemInventory>): void {
    if (this.disposed) return
    for (const slot of this.slots) {
      slot.count = inventory.counts[slot.itemId]
      slot.selected = inventory.selectedItemId === slot.itemId && slot.count === 1
      slot.background.setStrokeStyle(
        slot.selected ? 3 : 1,
        slot.selected ? SELECTED_STROKE : UNSELECTED_STROKE,
        1,
      )
      slot.label.setText(`${itemLabel[slot.itemId]}  ×${slot.count}`)
    }
  }

  snapshot(): InventoryHudSnapshot {
    return {
      ownedObjectCount: this.disposed ? 0 : this.slots.length * 2,
      slots: this.slots.map((slot) => ({
        itemId: slot.itemId,
        count: slot.count,
        selected: slot.selected,
        bounds: { ...slot.bounds },
      })),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const slot of this.slots) {
      slot.background.destroy()
      slot.label.destroy()
    }
  }
}
