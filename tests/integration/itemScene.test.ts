import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({ default: {} }))

import type { ItemInventory } from '../../src/domain/items/itemReducer'
import { InventoryHud } from '../../src/presentation/InventoryHud'

class FakeDisplayObject {
  destroyed = false
  text = ''
  strokeColor = 0

  setDepth(_value: number): this { return this }
  setFillStyle(_color: number, _alpha?: number): this { return this }
  setOrigin(_x: number, _y?: number): this { return this }
  setScrollFactor(_value: number): this { return this }
  setStrokeStyle(_width: number, color: number, _alpha?: number): this {
    this.strokeColor = color
    return this
  }
  setText(value: string): this { this.text = value; return this }
  destroy(): void { this.destroyed = true }
}

const inventory = (
  emp: 0 | 1,
  repair: 0 | 1,
  selectedItemId: ItemInventory['selectedItemId'],
): ItemInventory => ({ counts: { emp, 'repair-kit': repair }, selectedItemId })

describe('Task 10 item scene presentation', () => {
  it('keeps both 640x360 safe-area slots visible and updates without recreating objects', () => {
    const objects: FakeDisplayObject[] = []
    const own = () => {
      const object = new FakeDisplayObject()
      objects.push(object)
      return object
    }
    const scene = {
      add: { rectangle: own, text: own },
    }
    const hud = new InventoryHud(scene as never, inventory(0, 0, null))
    const initial = hud.snapshot()

    expect(initial.ownedObjectCount).toBe(4)
    expect(initial.slots).toHaveLength(2)
    for (const slot of initial.slots) {
      expect(slot.bounds.x).toBeGreaterThanOrEqual(8)
      expect(slot.bounds.y).toBeGreaterThanOrEqual(8)
      expect(slot.bounds.x + slot.bounds.width).toBeLessThanOrEqual(632)
      expect(slot.bounds.y + slot.bounds.height).toBeLessThanOrEqual(352)
    }

    hud.update(inventory(1, 1, 'repair-kit'))
    expect(objects).toHaveLength(4)
    expect(hud.snapshot()).toMatchObject({
      ownedObjectCount: 4,
      slots: [
        { itemId: 'emp', count: 1, selected: false, label: 'Q EMP  ×1' },
        { itemId: 'repair-kit', count: 1, selected: true, label: 'E REPAIR  ×1' },
      ],
    })

    hud.dispose()
    hud.dispose()
    expect(objects.every((object) => object.destroyed)).toBe(true)
    expect(hud.snapshot().ownedObjectCount).toBe(0)
  })
})
