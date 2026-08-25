import { describe, expect, it } from 'vitest'

import {
  HUD_CONTROLS_TEXT,
  HUD_LAYOUT,
  HudController,
  deriveHudModel,
} from '../../src/presentation/HudController'

class FakeDisplay {
  alpha = 1
  visible = true
  setAlpha(value: number): this { this.alpha = value; return this }
  setDepth(_value: number): this { return this }
  setOrigin(_x: number, _y?: number): this { return this }
  setScrollFactor(_value: number): this { return this }
  setStrokeStyle(_width: number, _color: number, _alpha?: number): this { return this }
  setText(_value: string): this { return this }
  setVisible(value: boolean): this { this.visible = value; return this }
  destroy(): void {}
}

class FakeGraphics extends FakeDisplay {
  clear(): this { return this }
  fillRect(_x: number, _y: number, _width: number, _height: number): this { return this }
  fillStyle(_color: number, _alpha?: number): this { return this }
  lineStyle(_width: number, _color: number, _alpha?: number): this { return this }
  strokeRect(_x: number, _y: number, _width: number, _height: number): this { return this }
}

const fakeScene = () => ({
  add: {
    graphics: () => new FakeGraphics(),
    rectangle: () => new FakeDisplay(),
    text: () => new FakeDisplay(),
  },
})

describe('Task 14 unified HUD contract', () => {
  it('spells out the item control semantics instead of binding keys to item names', () => {
    expect(HUD_CONTROLS_TEXT).toContain('Q SELECT ITEM')
    expect(HUD_CONTROLS_TEXT).toContain('E PICKUP-USE')
    expect(HUD_CONTROLS_TEXT).not.toContain('Q/E ITEM')
  })

  it('keeps the exact 640x360 modules inside protected HUD bands', () => {
    expect(HUD_LAYOUT).toMatchObject({
      player: { x: 8, y: 6, width: 366, height: 42 },
      hp: { x: 75, y: 9, width: 228, height: 12 },
      meter: { x: 75, y: 27, width: 228, height: 7 },
      inventory: { x: 476, y: 6, width: 156, height: 42 },
      combo: { x: 624, y: 72 },
      encounter: { x: 144, y: 52, width: 352, height: 16 },
      controls: { x: 12, y: 330 },
    })
    expect(HUD_LAYOUT.player.y + HUD_LAYOUT.player.height).toBeLessThanOrEqual(48)
    expect(HUD_LAYOUT.inventory.x + HUD_LAYOUT.inventory.width).toBe(632)
    expect(HUD_LAYOUT.controls.y).toBeGreaterThanOrEqual(330)
  })

  it('derives readable clamped HP/meter/life/items without changing gameplay values', () => {
    const source = {
      characterId: 'han' as const,
      hp: 81.2,
      maxHp: 100,
      meter: 147,
      lives: 2,
      inventory: { counts: { emp: 1 as const, 'repair-kit': 0 as const }, selectedItemId: 'emp' as const },
      combo: 4,
      encounter: { label: 'BOSS', hp: 250, maxHp: 500 },
    }
    const model = deriveHudModel(source)

    expect(model).toMatchObject({ hpText: '82 / 100', hpRatio: 0.812, meterRatio: 1, meterText: '100', lifeText: 'LIFE ×2', comboText: '4 HIT' })
    expect(source).toMatchObject({ hp: 81.2, meter: 147, lives: 2 })
  })

  it('expires presentation combo at 850 ms and keeps the first-combat controls readable for 9 seconds', () => {
    const emptyInventory = {
      counts: { emp: 0 as const, 'repair-kit': 0 as const },
      selectedItemId: null,
    }
    const comboHud = new HudController(fakeScene() as never, 'han', emptyInventory)
    comboHud.registerConfirmedHits(2)
    comboHud.advance(849)
    expect(comboHud.snapshot().combo).toBe(2)
    comboHud.advance(1)
    expect(comboHud.snapshot().combo).toBe(0)

    const controlsHud = new HudController(fakeScene() as never, 'mina', emptyInventory)
    controlsHud.advance(8_000)
    expect(controlsHud.snapshot().controlsAlpha).toBe(1)
    controlsHud.advance(500)
    expect(controlsHud.snapshot().controlsAlpha).toBe(0.5)
    controlsHud.advance(500)
    expect(controlsHud.snapshot().controlsAlpha).toBe(0)
  })
})
