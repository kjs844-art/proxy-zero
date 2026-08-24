import type Phaser from 'phaser'

import type { CharacterId } from '../content/characters'
import type { ItemInventory } from '../domain/items/itemReducer'
import { InventoryHud, type InventoryHudSnapshot } from './InventoryHud'

export const HUD_LAYOUT = Object.freeze({
  player: Object.freeze({ x: 8, y: 6, width: 366, height: 42 }),
  hp: Object.freeze({ x: 75, y: 9, width: 228, height: 12 }),
  meter: Object.freeze({ x: 75, y: 27, width: 228, height: 7 }),
  inventory: Object.freeze({ x: 476, y: 6, width: 156, height: 42 }),
  combo: Object.freeze({ x: 624, y: 72 }),
  encounter: Object.freeze({ x: 144, y: 52, width: 352, height: 16 }),
  controls: Object.freeze({ x: 12, y: 330 }),
})

const palette = Object.freeze({
  panel: 0x071018,
  steel: 0x132431,
  cyan: 0x67e8f9,
  hp: 0x36e5c7,
  danger: 0xff4d5e,
  meter: 0xf6c76e,
  text: '#e8fbff',
  secondary: '#87a5b5',
})

const controlsHoldMs = 8_000
const controlsFadeMs = 1_000

export interface EncounterHudSnapshot {
  readonly label: string
  readonly hp: number
  readonly maxHp: number
}

export interface HudUpdateInput {
  readonly characterId: CharacterId
  readonly hp: number
  readonly maxHp: number
  readonly meter: number
  readonly lives: number
  readonly inventory: Readonly<ItemInventory>
  readonly combo: number
  readonly encounter: Readonly<EncounterHudSnapshot> | null
}

export interface HudModel {
  readonly nameText: string
  readonly hpText: string
  readonly hpRatio: number
  readonly meterText: string
  readonly meterRatio: number
  readonly lifeText: string
  readonly comboText: string
  readonly encounterRatio: number
}

export interface HudControllerSnapshot {
  readonly layout: typeof HUD_LAYOUT
  readonly combo: number
  readonly controlsElapsedMs: number
  readonly controlsAlpha: number
  readonly inventory: InventoryHudSnapshot
}

const safeRatio = (value: number, maximum: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0
  return Math.min(1, Math.max(0, value / maximum))
}

export const deriveHudModel = (input: Readonly<HudUpdateInput>): HudModel => ({
  nameText: input.characterId.toUpperCase(),
  hpText: `${Math.ceil(Math.max(0, input.hp))} / ${Math.ceil(Math.max(0, input.maxHp))}`,
  hpRatio: safeRatio(input.hp, input.maxHp),
  meterText: `${Math.floor(Math.min(100, Math.max(0, input.meter)))}`,
  meterRatio: safeRatio(input.meter, 100),
  lifeText: `LIFE ×${Math.max(0, Math.floor(input.lives))}`,
  comboText: input.combo > 1 ? `${input.combo} HIT` : '',
  encounterRatio: input.encounter ? safeRatio(input.encounter.hp, input.encounter.maxHp) : 0,
})

const textStyle = (fontSize: string, color: string = palette.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  color,
  fontFamily: 'monospace',
  fontSize,
  fontStyle: 'bold',
})

/** One presentation entry point for LIFE, health, meter, combo, controls, and items. */
export class HudController {
  readonly inventoryHud: InventoryHud

  private readonly chrome: Phaser.GameObjects.Graphics
  private readonly bars: Phaser.GameObjects.Graphics
  private readonly nameText: Phaser.GameObjects.Text
  private readonly lifeText: Phaser.GameObjects.Text
  private readonly hpText: Phaser.GameObjects.Text
  private readonly meterText: Phaser.GameObjects.Text
  private readonly comboText: Phaser.GameObjects.Text
  private readonly encounterText: Phaser.GameObjects.Text
  private readonly controlsText: Phaser.GameObjects.Text
  private controlsElapsedMs = 0
  private comboElapsedMs = 0
  private combo = 0
  private controlsAlpha = 1
  private disposed = false

  constructor(scene: Phaser.Scene, characterId: CharacterId, inventory: Readonly<ItemInventory>) {
    this.chrome = scene.add.graphics().setDepth(10_000).setScrollFactor(0)
    this.bars = scene.add.graphics().setDepth(10_003).setScrollFactor(0)
    this.chrome.fillStyle(palette.panel, 0.91)
    this.chrome.fillRect(HUD_LAYOUT.player.x, HUD_LAYOUT.player.y, HUD_LAYOUT.player.width, HUD_LAYOUT.player.height)
    this.chrome.fillRect(HUD_LAYOUT.inventory.x, HUD_LAYOUT.inventory.y, HUD_LAYOUT.inventory.width, HUD_LAYOUT.inventory.height)
    this.chrome.lineStyle(1, palette.steel, 1)
    this.chrome.strokeRect(HUD_LAYOUT.player.x, HUD_LAYOUT.player.y, HUD_LAYOUT.player.width, HUD_LAYOUT.player.height)
    this.chrome.strokeRect(HUD_LAYOUT.inventory.x, HUD_LAYOUT.inventory.y, HUD_LAYOUT.inventory.width, HUD_LAYOUT.inventory.height)

    this.nameText = scene.add.text(14, 9, characterId.toUpperCase(), textStyle('11px')).setDepth(10_004).setScrollFactor(0)
    this.lifeText = scene.add.text(14, 27, 'LIFE ×2', textStyle('10px', palette.secondary)).setDepth(10_004).setScrollFactor(0)
    this.hpText = scene.add.text(368, 8, '', textStyle('9px')).setOrigin(1, 0).setDepth(10_004).setScrollFactor(0)
    this.meterText = scene.add.text(368, 24, '', textStyle('9px', '#f6c76e')).setOrigin(1, 0).setDepth(10_004).setScrollFactor(0)
    this.comboText = scene.add.text(HUD_LAYOUT.combo.x, HUD_LAYOUT.combo.y, '', textStyle('18px', '#f6c76e')).setOrigin(1, 0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.encounterText = scene.add.text(320, 60, '', textStyle('9px')).setOrigin(0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.controlsText = scene.add.text(HUD_LAYOUT.controls.x, HUD_LAYOUT.controls.y, 'WASD MOVE  SPACE JUMP  J/K/L/; ATTACK  Q/E ITEM', {
      ...textStyle('10px', palette.secondary),
      backgroundColor: '#071018d9',
      padding: { x: 6, y: 3 },
    }).setOrigin(0, 0).setDepth(10_004).setScrollFactor(0)
    this.inventoryHud = new InventoryHud(scene, inventory)
  }

  registerConfirmedHits(count: number): void {
    const accepted = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
    if (accepted === 0) return
    this.combo += accepted
    this.comboElapsedMs = 0
  }

  advance(requestedDeltaMs: number): void {
    if (this.disposed) return
    const deltaMs = Number.isFinite(requestedDeltaMs) ? Math.max(0, requestedDeltaMs) : 0
    this.controlsElapsedMs += deltaMs
    this.comboElapsedMs += deltaMs
    if (this.comboElapsedMs >= 850) this.combo = 0
    this.controlsAlpha = this.controlsElapsedMs <= controlsHoldMs
      ? 1
      : Math.max(0, 1 - (this.controlsElapsedMs - controlsHoldMs) / controlsFadeMs)
    this.controlsText.setAlpha(this.controlsAlpha).setVisible(this.controlsAlpha > 0)
  }

  update(input: Readonly<Omit<HudUpdateInput, 'combo'>>): void {
    if (this.disposed) return
    const model = deriveHudModel({ ...input, combo: this.combo })
    this.nameText.setText(model.nameText)
    this.lifeText.setText(model.lifeText)
    this.hpText.setText(model.hpText)
    this.meterText.setText(model.meterText)
    this.comboText.setText(model.comboText).setVisible(model.comboText.length > 0)
    this.encounterText.setText(input.encounter?.label ?? '').setVisible(input.encounter !== null)
    this.inventoryHud.update(input.inventory)

    this.bars.clear()
    this.bars.fillStyle(palette.steel, 1)
    this.bars.fillRect(HUD_LAYOUT.hp.x, HUD_LAYOUT.hp.y, HUD_LAYOUT.hp.width, HUD_LAYOUT.hp.height)
    this.bars.fillRect(HUD_LAYOUT.meter.x, HUD_LAYOUT.meter.y, HUD_LAYOUT.meter.width, HUD_LAYOUT.meter.height)
    this.bars.fillStyle(model.hpRatio <= 0.25 ? palette.danger : palette.hp, 1)
    this.bars.fillRect(HUD_LAYOUT.hp.x, HUD_LAYOUT.hp.y, HUD_LAYOUT.hp.width * model.hpRatio, HUD_LAYOUT.hp.height)
    this.bars.fillStyle(palette.meter, 1)
    this.bars.fillRect(HUD_LAYOUT.meter.x, HUD_LAYOUT.meter.y, HUD_LAYOUT.meter.width * model.meterRatio, HUD_LAYOUT.meter.height)
    if (input.encounter) {
      this.bars.fillStyle(palette.panel, 0.94)
      this.bars.fillRect(HUD_LAYOUT.encounter.x, HUD_LAYOUT.encounter.y, HUD_LAYOUT.encounter.width, HUD_LAYOUT.encounter.height)
      this.bars.fillStyle(palette.danger, 1)
      this.bars.fillRect(HUD_LAYOUT.encounter.x + 2, HUD_LAYOUT.encounter.y + 2, (HUD_LAYOUT.encounter.width - 4) * model.encounterRatio, HUD_LAYOUT.encounter.height - 4)
    }
  }

  resetCombo(): void {
    this.combo = 0
    this.comboElapsedMs = 0
    this.comboText.setText('').setVisible(false)
  }

  resetTransient(): void {
    this.resetCombo()
  }

  snapshot(): HudControllerSnapshot {
    return {
      layout: HUD_LAYOUT,
      combo: this.combo,
      controlsElapsedMs: this.controlsElapsedMs,
      controlsAlpha: this.controlsAlpha,
      inventory: this.inventoryHud.snapshot(),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.inventoryHud.dispose()
    this.chrome.destroy()
    this.bars.destroy()
    this.nameText.destroy()
    this.lifeText.destroy()
    this.hpText.destroy()
    this.meterText.destroy()
    this.comboText.destroy()
    this.encounterText.destroy()
    this.controlsText.destroy()
  }
}
