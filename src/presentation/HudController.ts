import type Phaser from 'phaser'

import type { CharacterId } from '../content/characters'
import type { ItemInventory } from '../domain/items/itemReducer'
import { InventoryHud, type InventoryHudSnapshot } from './InventoryHud'

export const HUD_LAYOUT = Object.freeze({
  status: Object.freeze({ x: 12, y: 10 }),
  wave: Object.freeze({ x: 628, y: 10 }),
  combo: Object.freeze({ x: 12, y: 72 }),
  encounter: Object.freeze({ x: 144, y: 52, width: 352, height: 16 }),
  controls: Object.freeze({ x: 12, y: 330 }),
  actionFeedback: Object.freeze({ x: 320, y: 302 }),
})

const palette = Object.freeze({
  panel: 0x071018,
  cyan: 0x67e8f9,
  danger: 0xff4d5e,
  text: '#e8fbff',
  secondary: '#87a5b5',
  wave: '#f6c76e',
})

const controlsHoldMs = 8_000
const controlsFadeMs = 1_000

export const HUD_CONTROLS_TEXT =
  'J L.HAND  K R.HAND  L L.FOOT  ; R.FOOT\nWASD MOVE  SPACE JUMP  Q ITEM  E PICKUP/USE'

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
  readonly waveIndex?: number
  readonly waveTotal?: number
}

export interface HudModel {
  readonly nameText: string
  readonly hpText: string
  readonly hpRatio: number
  readonly meterText: string
  readonly meterRatio: number
  readonly lifeText: string
  readonly waveText: string
  readonly comboText: string
  readonly encounterRatio: number
}

export interface HudControllerSnapshot {
  readonly layout: typeof HUD_LAYOUT
  readonly combo: number
  readonly controlsElapsedMs: number
  readonly controlsAlpha: number
  readonly actionFeedbackText: string
  readonly actionFeedbackRemainingMs: number
  readonly inventory: InventoryHudSnapshot
}

const safeRatio = (value: number, maximum: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0
  return Math.min(1, Math.max(0, value / maximum))
}

const nonNegativeWhole = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback

/** Formats the one compact persistent progress readout for an authored zone. */
export const formatWaveText = (waveIndex: number | undefined, waveTotal: number | undefined): string => {
  const total = Math.max(1, nonNegativeWhole(waveTotal, 1))
  const current = Math.min(total, nonNegativeWhole(waveIndex, 0) + 1)
  return `WAVE ${current} / ${total}`
}

export const deriveHudModel = (input: Readonly<HudUpdateInput>): HudModel => ({
  nameText: input.characterId.toUpperCase(),
  hpText: `${Math.ceil(Math.max(0, input.hp))} / ${Math.ceil(Math.max(0, input.maxHp))}`,
  hpRatio: safeRatio(input.hp, input.maxHp),
  meterText: `${Math.floor(Math.min(100, Math.max(0, input.meter)))}`,
  meterRatio: safeRatio(input.meter, 100),
  lifeText: `LIFE ×${Math.max(0, Math.floor(input.lives))}`,
  waveText: formatWaveText(input.waveIndex, input.waveTotal),
  comboText: input.combo > 1 ? `${input.combo} HIT` : '',
  encounterRatio: input.encounter ? safeRatio(input.encounter.hp, input.encounter.maxHp) : 0,
})

const textStyle = (fontSize: string, color: string = palette.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  color,
  fontFamily: 'monospace',
  fontSize,
  fontStyle: 'bold',
})

/** A low-chrome combat HUD: life, wave progress, transient combat feedback, and hidden item state. */
export class HudController {
  readonly inventoryHud: InventoryHud

  private readonly bars: Phaser.GameObjects.Graphics
  private readonly nameText: Phaser.GameObjects.Text
  private readonly lifeText: Phaser.GameObjects.Text
  private readonly waveText: Phaser.GameObjects.Text
  private readonly comboText: Phaser.GameObjects.Text
  private readonly encounterText: Phaser.GameObjects.Text
  private readonly controlsText: Phaser.GameObjects.Text
  private readonly actionFeedbackText: Phaser.GameObjects.Text
  private controlsElapsedMs = 0
  private comboElapsedMs = 0
  private combo = 0
  private controlsAlpha = 1
  private actionFeedbackValue = ''
  private actionFeedbackRemainingMs = 0
  private disposed = false

  constructor(scene: Phaser.Scene, characterId: CharacterId, inventory: Readonly<ItemInventory>) {
    this.bars = scene.add.graphics().setDepth(10_003).setScrollFactor(0)
    this.nameText = scene.add.text(
      HUD_LAYOUT.status.x,
      HUD_LAYOUT.status.y,
      characterId.toUpperCase(),
      textStyle('11px'),
    ).setDepth(10_004).setScrollFactor(0)
    this.lifeText = scene.add.text(
      HUD_LAYOUT.status.x,
      HUD_LAYOUT.status.y + 15,
      'LIFE ×2',
      textStyle('10px', palette.secondary),
    ).setDepth(10_004).setScrollFactor(0)
    this.waveText = scene.add.text(
      HUD_LAYOUT.wave.x,
      HUD_LAYOUT.wave.y,
      'WAVE 1 / 1',
      textStyle('11px', palette.wave),
    ).setOrigin(1, 0).setDepth(10_004).setScrollFactor(0)
    this.comboText = scene.add.text(HUD_LAYOUT.combo.x, HUD_LAYOUT.combo.y, '', textStyle('18px', '#f6c76e')).setOrigin(0, 0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.encounterText = scene.add.text(320, 60, '', textStyle('9px')).setOrigin(0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.controlsText = scene.add.text(HUD_LAYOUT.controls.x, HUD_LAYOUT.controls.y, HUD_CONTROLS_TEXT, {
      ...textStyle('10px', palette.secondary),
      backgroundColor: '#071018d9',
      lineSpacing: 1,
      padding: { x: 6, y: 3 },
    }).setOrigin(0, 0).setDepth(10_004).setScrollFactor(0)
    this.actionFeedbackText = scene.add.text(
      HUD_LAYOUT.actionFeedback.x,
      HUD_LAYOUT.actionFeedback.y,
      '',
      {
        ...textStyle('11px', '#f6c76e'),
        backgroundColor: '#071018e8',
        padding: { x: 8, y: 4 },
      },
    ).setOrigin(0.5, 0.5).setDepth(10_006).setScrollFactor(0).setVisible(false)
    // Items remain fully usable through Q/E, but their permanent cards no
    // longer occupy the top-right of the combat frame.
    this.inventoryHud = new InventoryHud(scene, inventory, false)
  }

  showActionFeedback(message: string, durationMs = 1_000): void {
    if (this.disposed) return
    const normalizedMessage = message.trim()
    if (normalizedMessage.length === 0) return
    this.actionFeedbackValue = normalizedMessage
    this.actionFeedbackRemainingMs = Number.isFinite(durationMs)
      ? Math.max(1, durationMs)
      : 1_000
    this.actionFeedbackText
      .setText(this.actionFeedbackValue)
      .setAlpha(1)
      .setVisible(true)
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
    this.actionFeedbackRemainingMs = Math.max(0, this.actionFeedbackRemainingMs - deltaMs)
    if (this.actionFeedbackRemainingMs === 0 && this.actionFeedbackValue.length > 0) {
      this.actionFeedbackValue = ''
      this.actionFeedbackText.setText('').setVisible(false)
    }
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
    this.waveText.setText(model.waveText)
    this.comboText.setText(model.comboText).setVisible(model.comboText.length > 0)
    this.encounterText.setText(input.encounter?.label ?? '').setVisible(input.encounter !== null)
    this.inventoryHud.update(input.inventory)

    this.bars.clear()
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
    this.actionFeedbackValue = ''
    this.actionFeedbackRemainingMs = 0
    this.actionFeedbackText.setText('').setVisible(false)
  }

  snapshot(): HudControllerSnapshot {
    return {
      layout: HUD_LAYOUT,
      combo: this.combo,
      controlsElapsedMs: this.controlsElapsedMs,
      controlsAlpha: this.controlsAlpha,
      actionFeedbackText: this.actionFeedbackValue,
      actionFeedbackRemainingMs: this.actionFeedbackRemainingMs,
      inventory: this.inventoryHud.snapshot(),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.inventoryHud.dispose()
    this.bars.destroy()
    this.nameText.destroy()
    this.lifeText.destroy()
    this.waveText.destroy()
    this.comboText.destroy()
    this.encounterText.destroy()
    this.controlsText.destroy()
    this.actionFeedbackText.destroy()
  }
}
