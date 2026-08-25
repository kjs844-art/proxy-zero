import { describe, expect, it } from 'vitest'

import {
  HUD_CONTROLS_TEXT,
  HUD_LAYOUT,
  HudController,
  deriveHudModel,
  formatWaveText,
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
  it('keeps the combat frame free of persistent HP and item modules', () => {
    // Regression target: bringing back the full-width health chrome or the
    // permanent EMP/REPAIR cards would cover the playfield again.
    expect(HUD_LAYOUT).not.toHaveProperty('player')
    expect(HUD_LAYOUT).not.toHaveProperty('hp')
    expect(HUD_LAYOUT).not.toHaveProperty('meter')
    expect(HUD_LAYOUT).not.toHaveProperty('inventory')

    const model = deriveHudModel({
      characterId: 'mina',
      hp: 85,
      maxHp: 85,
      meter: 0,
      lives: 2,
      inventory: { counts: { emp: 0, 'repair-kit': 0 }, selectedItemId: null },
      combo: 0,
      encounter: null,
      waveIndex: 1,
      waveTotal: 3,
    } as never) as unknown as { waveText?: string }
    expect(model.waveText).toBe('WAVE 2 / 3')
    expect(formatWaveText(0, 3)).toBe('WAVE 1 / 3')

    const hud = new HudController(fakeScene() as never, 'mina', {
      counts: { emp: 0, 'repair-kit': 0 },
      selectedItemId: null,
    })
    expect(hud.snapshot().inventory).toMatchObject({ visible: false })
  })

  it('spells out the item control semantics instead of binding keys to item names', () => {
    expect(HUD_CONTROLS_TEXT).toContain('J L.HAND')
    expect(HUD_CONTROLS_TEXT).toContain('K R.HAND')
    expect(HUD_CONTROLS_TEXT).toContain('L L.FOOT')
    expect(HUD_CONTROLS_TEXT).toContain('; R.FOOT')
    expect(HUD_CONTROLS_TEXT).toContain('Q ITEM')
    expect(HUD_CONTROLS_TEXT).toContain('E PICKUP/USE')
    expect(HUD_CONTROLS_TEXT.split('\n')).toHaveLength(2)
    expect(HUD_CONTROLS_TEXT).not.toContain('Q/E ITEM')
  })

  it('keeps the compact status and wave readouts inside protected HUD edges', () => {
    expect(HUD_LAYOUT).toMatchObject({
      status: { x: 12, y: 10 },
      wave: { x: 628, y: 10 },
      combo: { x: 12, y: 72 },
      encounter: { x: 144, y: 52, width: 352, height: 16 },
      controls: { x: 12, y: 330 },
    })
    expect(HUD_LAYOUT.status.y).toBeLessThanOrEqual(16)
    expect(HUD_LAYOUT.wave.x).toBeLessThanOrEqual(632)
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

  it('shows action feedback for one second and clears it with other transients', () => {
    const emptyInventory = {
      counts: { emp: 0 as const, 'repair-kit': 0 as const },
      selectedItemId: null,
    }
    const hud = new HudController(fakeScene() as never, 'jin', emptyInventory)
    hud.showActionFeedback('NO ITEM')
    expect(hud.snapshot()).toMatchObject({
      actionFeedbackText: 'NO ITEM',
      actionFeedbackRemainingMs: 1_000,
    })
    hud.advance(999)
    expect(hud.snapshot().actionFeedbackText).toBe('NO ITEM')
    hud.advance(1)
    expect(hud.snapshot()).toMatchObject({
      actionFeedbackText: '',
      actionFeedbackRemainingMs: 0,
    })

    hud.showActionFeedback('HP FULL')
    hud.resetTransient()
    expect(hud.snapshot().actionFeedbackText).toBe('')
  })
})
