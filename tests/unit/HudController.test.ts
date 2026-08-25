import { describe, expect, it } from 'vitest'

import {
  HUD_CONTROL_KEYS,
  HUD_CONTROLS_TEXT,
  HUD_LAYOUT,
  HudController,
  deriveHudPortraitPresentation,
  deriveHudModel,
} from '../../src/presentation/HudController'

class FakeDisplay {
  alpha = 1
  text = ''
  visible = true
  setAlpha(value: number): this { this.alpha = value; return this }
  setCrop(_x: number, _y: number, _width: number, _height: number): this { return this }
  setDepth(_value: number): this { return this }
  setDisplaySize(_width: number, _height: number): this { return this }
  setFillStyle(_color: number, _alpha?: number): this { return this }
  setOrigin(_x: number, _y?: number): this { return this }
  setResolution(_value: number): this { return this }
  setScrollFactor(_value: number): this { return this }
  setStrokeStyle(_width: number, _color: number, _alpha?: number): this { return this }
  setText(value: string): this { this.text = value; return this }
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
    image: () => new FakeDisplay(),
    rectangle: () => new FakeDisplay(),
    text: () => new FakeDisplay(),
  },
})

describe('Task 14 unified HUD contract', () => {
  it('keeps a compact portrait HP cluster and graphical item cards', () => {
    expect(HUD_LAYOUT).toHaveProperty('player')
    expect(HUD_LAYOUT).toHaveProperty('portrait')
    expect(HUD_LAYOUT).toHaveProperty('health')
    expect(HUD_LAYOUT).toHaveProperty('meter')
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
      showAdvancePrompt: true,
    })
    expect(model.advanceText).toBe('GO →')
    expect(model).not.toHaveProperty('waveText')

    const hud = new HudController(fakeScene() as never, 'mina', {
      counts: { emp: 0, 'repair-kit': 0 },
      selectedItemId: null,
    })
    expect(hud.snapshot().inventory).toMatchObject({ visible: true })
  })

  it('uses four centered attack keycaps and keeps only a minimal secondary hint', () => {
    expect(HUD_CONTROL_KEYS).toEqual([
      { key: 'J', label: 'L.HAND' },
      { key: 'K', label: 'R.HAND' },
      { key: 'L', label: 'L.FOOT' },
      { key: ';', label: 'R.FOOT' },
    ])
    expect(HUD_CONTROLS_TEXT).toContain('WASD MOVE')
    expect(HUD_CONTROLS_TEXT).toContain('D×2 HOLD RUN')
    expect(HUD_CONTROLS_TEXT).toContain('SPACE JUMP')
    expect(HUD_CONTROLS_TEXT).toContain('Q ITEM')
    expect(HUD_CONTROLS_TEXT).toContain('E USE')
    expect(HUD_CONTROLS_TEXT.split('\n')).toHaveLength(1)
    expect(HUD_CONTROLS_TEXT).not.toContain('L.HAND')
  })

  it('centers character-specific head-and-shoulder crops inside the portrait box', () => {
    for (const characterId of ['han', 'mina', 'jin'] as const) {
      const presentation = deriveHudPortraitPresentation(characterId)
      const cropCenterX = presentation.crop.x + presentation.crop.width / 2
      const cropCenterY = presentation.crop.y + presentation.crop.height / 2
      const scale = presentation.displayWidth / 256
      const renderedCenterX = presentation.imageX + (cropCenterX - 128) * scale
      const renderedCenterY = presentation.imageY + (cropCenterY - 128) * scale
      expect(renderedCenterX).toBeCloseTo(HUD_LAYOUT.portrait.x + HUD_LAYOUT.portrait.width / 2)
      expect(renderedCenterY).toBeCloseTo(HUD_LAYOUT.portrait.y + HUD_LAYOUT.portrait.height / 2)
      expect(presentation.crop.height).toBeLessThanOrEqual(52)
      expect(presentation.displayHeight).toBeGreaterThan(190)
    }
  })

  it('keeps the compact status and contextual route prompt inside protected HUD edges', () => {
    expect(HUD_LAYOUT).toMatchObject({
      player: { x: 8, y: 6, width: 212, height: 52 },
      portrait: { x: 12, y: 10, width: 40, height: 40 },
      status: { x: 58, y: 8 },
      health: { x: 58, y: 23, width: 105, height: 10 },
      advance: { x: 628, y: 9 },
      combo: { x: 12, y: 72 },
      encounter: { x: 144, y: 52, width: 352, height: 16 },
      controlsHint: { x: 320, y: 308 },
      controls: { x: 320, y: 323, keyWidth: 30, keyHeight: 21, gap: 5 },
    })
    expect(HUD_LAYOUT.status.y).toBeLessThanOrEqual(16)
    expect(HUD_LAYOUT.advance.x).toBeLessThanOrEqual(632)
    expect(HUD_LAYOUT.controls.x).toBe(320)
    expect(HUD_LAYOUT.controls.y + HUD_LAYOUT.controls.keyHeight + 8).toBeLessThanOrEqual(360)
  })

  it('only exposes GO at the edge when traversal is active', () => {
    const emptyInventory = {
      counts: { emp: 0 as const, 'repair-kit': 0 as const },
      selectedItemId: null,
    }
    const hud = new HudController(fakeScene() as never, 'mina', emptyInventory)
    const base = {
      characterId: 'mina' as const,
      hp: 85,
      maxHp: 85,
      meter: 0,
      lives: 2,
      inventory: emptyInventory,
      encounter: null,
    }
    hud.update({ ...base, showAdvancePrompt: false })
    expect(hud.snapshot().advancePromptVisible).toBe(false)
    hud.update({ ...base, showAdvancePrompt: true })
    expect(hud.snapshot().advancePromptVisible).toBe(true)
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

  it('expires presentation combo at 850 ms and keeps the first-combat controls readable for 22 seconds', () => {
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
    expect(controlsHud.snapshot().controlKeys).toEqual(HUD_CONTROL_KEYS)
    controlsHud.advance(20_000)
    expect(controlsHud.snapshot().controlsAlpha).toBe(1)
    controlsHud.advance(1_000)
    expect(controlsHud.snapshot().controlsAlpha).toBe(0.5)
    controlsHud.advance(1_000)
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
