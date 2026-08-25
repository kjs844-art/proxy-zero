import type Phaser from 'phaser'

import { ITEM_ORDER } from '../content/items'
import type { ItemInventory } from '../domain/items/itemReducer'
import type { ItemId } from '../domain/items/types'

const SLOT_WIDTH = 60
const SLOT_HEIGHT = 50
const SLOT_GAP = 7
const SLOT_Y = 42
const SLOT_START_X = 570
const SELECTED_STROKE = 0x67e8f9
const UNSELECTED_STROKE = 0x334155

interface SlotView {
  itemId: ItemId
  bounds: { x: number; y: number; width: number; height: number }
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Graphics
  renderedLabel: string
  count: 0 | 1
  selected: boolean
}

export interface InventoryHudSnapshot {
  ownedObjectCount: number
  visible: boolean
  slots: Array<{
    itemId: ItemId
    count: 0 | 1
    selected: boolean
    label: string
    bounds: { x: number; y: number; width: number; height: number }
  }>
}

export const INVENTORY_ITEM_LABELS: Readonly<Record<ItemId, string>> = {
  emp: 'EMP',
  'repair-kit': 'REPAIR',
}

const PIXEL_GLYPHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
})

const glyphAdvance = (character: string): number => character === ' ' ? 3 : 6

const drawPixelLabel = (
  graphics: Phaser.GameObjects.Graphics,
  bounds: Readonly<SlotView['bounds']>,
  text: string,
): void => {
  const width = [...text].reduce((total, character) => total + glyphAdvance(character), -1)
  const startX = Math.round(bounds.x + (bounds.width - width) / 2)
  const startY = Math.round(bounds.y + (bounds.height - 7) / 2)
  graphics.fillStyle(0xe8fbff, 1)
  let cursorX = startX
  for (const character of text) {
    const glyph = PIXEL_GLYPHS[character]
    if (glyph) {
      glyph.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length; column += 1) {
          if (row[column] === '1') graphics.fillRect(cursorX + column, startY + rowIndex, 1, 1)
        }
      })
    }
    cursorX += glyphAdvance(character)
  }
}

const drawItemIcon = (
  graphics: Phaser.GameObjects.Graphics,
  bounds: Readonly<SlotView['bounds']>,
  itemId: ItemId,
  count: 0 | 1,
): void => {
  const centerX = Math.round(bounds.x + bounds.width / 2)
  const top = bounds.y + 7
  const activeAlpha = count === 1 ? 1 : 0.38

  if (itemId === 'emp') {
    graphics.fillStyle(0x67e8f9, activeAlpha)
    graphics.fillRect(centerX - 4, top + 2, 9, 14)
    graphics.fillRect(centerX - 2, top, 5, 2)
    graphics.fillStyle(0x071018, 1)
    graphics.fillRect(centerX - 2, top + 6, 5, 2)
    graphics.fillStyle(0xe8fbff, activeAlpha)
    graphics.fillRect(centerX, top + 3, 1, 11)
    return
  }

  graphics.fillStyle(0x8b6a2f, activeAlpha)
  graphics.fillRect(centerX - 10, top + 4, 20, 13)
  graphics.fillRect(centerX - 5, top + 1, 10, 3)
  graphics.fillStyle(0x4ade80, activeAlpha)
  graphics.fillRect(centerX - 1, top + 6, 3, 9)
  graphics.fillRect(centerX - 4, top + 9, 9, 3)
}

const drawSlotGraphic = (
  graphics: Phaser.GameObjects.Graphics,
  slot: Readonly<Pick<SlotView, 'bounds' | 'itemId' | 'count'>>,
): void => {
  graphics.clear()
  drawItemIcon(graphics, slot.bounds, slot.itemId, slot.count)
  drawPixelLabel(
    graphics,
    { ...slot.bounds, y: slot.bounds.y + 38, height: 7 },
    `${INVENTORY_ITEM_LABELS[slot.itemId]} X${slot.count}`,
  )
}

const setVisibleIfSupported = (
  object: { setVisible?: (visible: boolean) => unknown },
  visible: boolean,
): void => {
  object.setVisible?.(visible)
}

/** Presentation-only two-slot inventory HUD; CombatScene keeps it hidden by default. */
export class InventoryHud {
  private readonly slots: SlotView[]
  private readonly visible: boolean
  private disposed = false

  constructor(scene: Phaser.Scene, inventory: Readonly<ItemInventory>, visible = true) {
    this.visible = visible
    this.slots = ITEM_ORDER.map((itemId, index) => {
      const y = SLOT_Y + index * (SLOT_HEIGHT + SLOT_GAP)
      const bounds = { x: SLOT_START_X, y, width: SLOT_WIDTH, height: SLOT_HEIGHT }
      const background = scene.add
        .rectangle(
          SLOT_START_X + SLOT_WIDTH / 2,
          y + SLOT_HEIGHT / 2,
          SLOT_WIDTH,
          SLOT_HEIGHT,
          0x071018,
          0.94,
        )
        .setDepth(10_001)
        .setScrollFactor(0)
      setVisibleIfSupported(background, visible)
      const label = scene.add
        .graphics()
        .setDepth(10_005)
        .setScrollFactor(0)
      setVisibleIfSupported(label, visible)
      return {
        itemId,
        bounds,
        background,
        label,
        renderedLabel: '',
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
      slot.background.setFillStyle(slot.count === 1 ? 0x0b1b27 : 0x071018, slot.count === 1 ? 0.96 : 0.82)
      slot.background.setStrokeStyle(
        slot.selected ? 3 : 1,
        slot.selected ? SELECTED_STROKE : UNSELECTED_STROKE,
        1,
      )
      const nextLabel = `${INVENTORY_ITEM_LABELS[slot.itemId]}  ×${slot.count}`
      if (slot.renderedLabel !== nextLabel) {
        slot.renderedLabel = nextLabel
        drawSlotGraphic(slot.label, slot)
      }
    }
  }

  snapshot(): InventoryHudSnapshot {
    return {
      ownedObjectCount: this.disposed ? 0 : this.slots.length * 2,
      visible: !this.disposed && this.visible,
      slots: this.slots.map((slot) => ({
        itemId: slot.itemId,
        count: slot.count,
        selected: slot.selected,
        label: slot.renderedLabel,
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
