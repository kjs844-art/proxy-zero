import type Phaser from 'phaser'

import { ACTOR_ATLAS_KEY, getActorVisualProfile } from '../content/animations'
import type { CharacterId } from '../content/characters'
import type { ItemInventory } from '../domain/items/itemReducer'
import { InventoryHud, type InventoryHudSnapshot } from './InventoryHud'

export const HUD_LAYOUT = Object.freeze({
  player: Object.freeze({ x: 8, y: 6, width: 212, height: 52 }),
  portrait: Object.freeze({ x: 12, y: 10, width: 40, height: 40 }),
  status: Object.freeze({ x: 58, y: 8 }),
  health: Object.freeze({ x: 58, y: 23, width: 105, height: 10 }),
  meter: Object.freeze({ x: 58, y: 43, width: 105, height: 3 }),
  advance: Object.freeze({ x: 628, y: 9 }),
  combo: Object.freeze({ x: 12, y: 72 }),
  encounter: Object.freeze({ x: 144, y: 52, width: 352, height: 16 }),
  controlsHint: Object.freeze({ x: 320, y: 308 }),
  techniques: Object.freeze({ x: 320, y: 298 }),
  controls: Object.freeze({ x: 320, y: 323, keyWidth: 30, keyHeight: 21, gap: 5 }),
  actionFeedback: Object.freeze({ x: 320, y: 288 }),
})

const palette = Object.freeze({
  panel: 0x071018,
  cyan: 0x67e8f9,
  health: 0xf2a516,
  danger: 0xff4d5e,
  text: '#e8fbff',
  secondary: '#87a5b5',
  advance: '#f6c76e',
})

const controlsHoldMs = 20_000
const controlsFadeMs = 2_000
const hudTextResolution = 2

export const HUD_CONTROLS_TEXT =
  'WASD MOVE  ·  D×2 HOLD RUN  ·  SPACE JUMP  ·  AIR + J/K/L/;  ·  Q SELECT  ·  E PICK UP / USE'

export const HUD_TECHNIQUE_GUIDES: Readonly<Record<CharacterId, string>> = Object.freeze({
  han: 'SKILLS  K J CROSS  ·  L ; K RISING  ·  100% K J ; L TEMPEST',
  mina: 'SKILLS  K ; FLASH  ·  L K L SKY NEEDLE  ·  100% J K L ; PRISM',
  jin: 'SKILLS  J K ANCHOR  ·  ; L K FAULT LINE  ·  100% ; L J K ZERO',
})

export const HUD_CONTROL_KEYS = Object.freeze([
  Object.freeze({ key: 'J', label: 'L.HAND' }),
  Object.freeze({ key: 'K', label: 'R.HAND' }),
  Object.freeze({ key: 'L', label: 'L.FOOT' }),
  Object.freeze({ key: ';', label: 'R.FOOT' }),
] as const)

export interface HudPortraitCrop {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Hand-tuned head-and-shoulder windows inside each untrimmed 256 px idle cell. */
export const HUD_PORTRAIT_CROPS: Readonly<Record<CharacterId, HudPortraitCrop>> = Object.freeze({
  han: Object.freeze({ x: 106, y: 136, width: 44, height: 48 }),
  mina: Object.freeze({ x: 106, y: 144, width: 44, height: 48 }),
  jin: Object.freeze({ x: 103, y: 132, width: 50, height: 52 }),
})

export interface HudPortraitPresentation {
  readonly crop: HudPortraitCrop
  readonly imageX: number
  readonly imageY: number
  readonly displayWidth: number
  readonly displayHeight: number
}

/**
 * Cropping does not change a Phaser Image's origin. This projection offsets
 * the original-frame origin so the selected bust crop is centered in its box.
 */
export const deriveHudPortraitPresentation = (
  characterId: CharacterId,
): HudPortraitPresentation => {
  const crop = HUD_PORTRAIT_CROPS[characterId]
  const profile = getActorVisualProfile(characterId)
  const scale = Math.min(
    HUD_LAYOUT.portrait.width / crop.width,
    HUD_LAYOUT.portrait.height / crop.height,
  )
  const portraitCenterX = HUD_LAYOUT.portrait.x + HUD_LAYOUT.portrait.width / 2
  const portraitCenterY = HUD_LAYOUT.portrait.y + HUD_LAYOUT.portrait.height / 2
  const frameCenterX = profile.cell.width / 2
  const frameCenterY = profile.cell.height / 2
  const cropCenterX = crop.x + crop.width / 2
  const cropCenterY = crop.y + crop.height / 2
  return {
    crop,
    imageX: portraitCenterX - (cropCenterX - frameCenterX) * scale,
    imageY: portraitCenterY - (cropCenterY - frameCenterY) * scale,
    displayWidth: profile.cell.width * scale,
    displayHeight: profile.cell.height * scale,
  }
}

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
  readonly showAdvancePrompt?: boolean
  readonly waveIndex?: number
  readonly waveCount?: number
  readonly score?: number
}

export interface HudModel {
  readonly nameText: string
  readonly hpText: string
  readonly hpRatio: number
  readonly meterText: string
  readonly meterRatio: number
  readonly lifeText: string
  readonly advanceText: string
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
  readonly advancePromptVisible: boolean
  readonly controlKeys: typeof HUD_CONTROL_KEYS
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
  advanceText: input.showAdvancePrompt ? 'GO →' : '',
  comboText: input.combo > 0 ? `${input.combo} HIT` : '',
  encounterRatio: input.encounter ? safeRatio(input.encounter.hp, input.encounter.maxHp) : 0,
})

const textStyle = (fontSize: string, color: string = palette.text): Phaser.Types.GameObjects.Text.TextStyle => ({
  color,
  fontFamily: 'monospace',
  fontSize,
  fontStyle: 'bold',
})

/** Compact arcade combat HUD with contextual route and inventory information. */
export class HudController {
  readonly inventoryHud: InventoryHud

  private readonly bars: Phaser.GameObjects.Graphics
  private readonly controlsGraphics: Phaser.GameObjects.Graphics
  private readonly portrait: Phaser.GameObjects.Image
  private readonly nameText: Phaser.GameObjects.Text
  private readonly hpText: Phaser.GameObjects.Text
  private readonly lifeText: Phaser.GameObjects.Text
  private readonly advanceText: Phaser.GameObjects.Text
  private readonly comboText: Phaser.GameObjects.Text
  private readonly waveText: Phaser.GameObjects.Text
  private readonly scoreText: Phaser.GameObjects.Text
  private readonly encounterText: Phaser.GameObjects.Text
  private readonly techniqueText: Phaser.GameObjects.Text
  private readonly controlsText: Phaser.GameObjects.Text
  private readonly controlKeyTexts: readonly Phaser.GameObjects.Text[]
  private readonly controlLimbTexts: readonly Phaser.GameObjects.Text[]
  private readonly actionFeedbackText: Phaser.GameObjects.Text
  private controlsElapsedMs = 0
  private comboElapsedMs = 0
  private combo = 0
  private controlsAlpha = 1
  private actionFeedbackValue = ''
  private actionFeedbackRemainingMs = 0
  private disposed = false

  constructor(scene: Phaser.Scene, characterId: CharacterId, inventory: Readonly<ItemInventory>) {
    const portraitFrame = getActorVisualProfile(characterId).clips.idle.frames[0]
    const portraitPresentation = deriveHudPortraitPresentation(characterId)
    this.bars = scene.add.graphics().setDepth(10_003).setScrollFactor(0)
    this.controlsGraphics = scene.add.graphics().setDepth(10_003).setScrollFactor(0)
    const portrait = characterId === 'mina'
      ? scene.add.image(
          HUD_LAYOUT.portrait.x + HUD_LAYOUT.portrait.width / 2,
          HUD_LAYOUT.portrait.y + HUD_LAYOUT.portrait.height / 2,
          'mina-portrait',
        )
      : scene.add.image(
          portraitPresentation.imageX,
          portraitPresentation.imageY,
          ACTOR_ATLAS_KEY,
          portraitFrame,
        )
      .setOrigin(0.5)
    if (characterId !== 'mina' && typeof portrait.setCrop === 'function') {
      const { x, y, width, height } = portraitPresentation.crop
      portrait.setCrop(x, y, width, height)
    }
    this.portrait = portrait
      .setDisplaySize(characterId === 'mina' ? HUD_LAYOUT.portrait.width : portraitPresentation.displayWidth, characterId === 'mina' ? HUD_LAYOUT.portrait.height : portraitPresentation.displayHeight)
      .setDepth(10_004)
      .setScrollFactor(0)
    this.nameText = scene.add.text(
      HUD_LAYOUT.status.x,
      HUD_LAYOUT.status.y,
      characterId.toUpperCase(),
      textStyle('11px'),
    ).setDepth(10_004).setScrollFactor(0)
    this.hpText = scene.add.text(
      HUD_LAYOUT.health.x + HUD_LAYOUT.health.width + 8,
      HUD_LAYOUT.health.y - 1,
      '0 / 0',
      textStyle('9px'),
    ).setDepth(10_004).setScrollFactor(0)
    this.lifeText = scene.add.text(
      HUD_LAYOUT.status.x,
      HUD_LAYOUT.status.y + 31,
      'LIFE ×2',
      textStyle('10px', palette.secondary),
    ).setDepth(10_004).setScrollFactor(0)
    this.advanceText = scene.add.text(
      HUD_LAYOUT.advance.x,
      HUD_LAYOUT.advance.y,
      '',
      {
        ...textStyle('14px', palette.advance),
        backgroundColor: '#071018e8',
        padding: { x: 7, y: 4 },
      },
    ).setOrigin(1, 0).setDepth(10_006).setScrollFactor(0).setVisible(false)
    this.comboText = scene.add.text(HUD_LAYOUT.combo.x, HUD_LAYOUT.combo.y, '', {
      ...textStyle('22px', '#f6c76e'),
      stroke: '#071018',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.waveText = scene.add.text(548, 8, 'WAVE 1/3', textStyle('10px', palette.advance))
      .setDepth(10_004).setScrollFactor(0)
    this.scoreText = scene.add.text(420, 8, 'SCORE 0000000', textStyle('8px', palette.secondary))
      .setDepth(10_004).setScrollFactor(0)
    this.encounterText = scene.add.text(320, 60, '', textStyle('9px')).setOrigin(0.5).setDepth(10_004).setScrollFactor(0).setVisible(false)
    this.techniqueText = scene.add.text(
      HUD_LAYOUT.techniques.x,
      HUD_LAYOUT.techniques.y,
      HUD_TECHNIQUE_GUIDES[characterId],
      textStyle('7px', palette.advance),
    ).setOrigin(0.5, 0.5).setDepth(10_004).setScrollFactor(0)
    this.controlsText = scene.add.text(
      HUD_LAYOUT.controlsHint.x,
      HUD_LAYOUT.controlsHint.y,
      HUD_CONTROLS_TEXT,
      textStyle('7px', palette.secondary),
    ).setOrigin(0.5, 0.5).setDepth(10_004).setScrollFactor(0)
    const controlsWidth = HUD_CONTROL_KEYS.length * HUD_LAYOUT.controls.keyWidth
      + (HUD_CONTROL_KEYS.length - 1) * HUD_LAYOUT.controls.gap
    const controlsLeft = HUD_LAYOUT.controls.x - controlsWidth / 2
    this.controlKeyTexts = HUD_CONTROL_KEYS.map((entry, index) => {
      const x = controlsLeft
        + index * (HUD_LAYOUT.controls.keyWidth + HUD_LAYOUT.controls.gap)
        + HUD_LAYOUT.controls.keyWidth / 2
      return scene.add.text(x, HUD_LAYOUT.controls.y + HUD_LAYOUT.controls.keyHeight / 2, entry.key, textStyle('13px'))
        .setOrigin(0.5, 0.5)
        .setDepth(10_005)
        .setScrollFactor(0)
    })
    this.controlLimbTexts = HUD_CONTROL_KEYS.map((entry, index) => {
      const x = controlsLeft
        + index * (HUD_LAYOUT.controls.keyWidth + HUD_LAYOUT.controls.gap)
        + HUD_LAYOUT.controls.keyWidth / 2
      return scene.add.text(x, HUD_LAYOUT.controls.y + HUD_LAYOUT.controls.keyHeight + 5, entry.label, textStyle('6px', palette.secondary))
        .setOrigin(0.5, 0.5)
        .setDepth(10_005)
        .setScrollFactor(0)
    })
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
    ;[
      this.nameText,
      this.hpText,
      this.lifeText,
      this.advanceText,
      this.comboText,
      this.waveText,
      this.scoreText,
      this.encounterText,
      this.techniqueText,
      this.controlsText,
      ...this.controlKeyTexts,
      ...this.controlLimbTexts,
      this.actionFeedbackText,
    ].forEach((text) => {
      // Lightweight scene doubles used by deterministic integration tests do
      // not need to emulate Phaser's internal text canvas.
      if (typeof text.setResolution === 'function') text.setResolution(hudTextResolution)
    })
    this.drawControlKeys()
    this.inventoryHud = new InventoryHud(scene, inventory, true)
  }

  private drawControlKeys(): void {
    const controlsWidth = HUD_CONTROL_KEYS.length * HUD_LAYOUT.controls.keyWidth
      + (HUD_CONTROL_KEYS.length - 1) * HUD_LAYOUT.controls.gap
    const controlsLeft = HUD_LAYOUT.controls.x - controlsWidth / 2
    this.controlsGraphics.clear()
    HUD_CONTROL_KEYS.forEach((_entry, index) => {
      const x = controlsLeft + index * (HUD_LAYOUT.controls.keyWidth + HUD_LAYOUT.controls.gap)
      this.controlsGraphics.fillStyle(palette.panel, 0.9)
      this.controlsGraphics.fillRect(
        x,
        HUD_LAYOUT.controls.y,
        HUD_LAYOUT.controls.keyWidth,
        HUD_LAYOUT.controls.keyHeight,
      )
      this.controlsGraphics.lineStyle(1, 0x60798a, 0.95)
      this.controlsGraphics.strokeRect(
        x,
        HUD_LAYOUT.controls.y,
        HUD_LAYOUT.controls.keyWidth,
        HUD_LAYOUT.controls.keyHeight,
      )
    })
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
    if (this.comboElapsedMs >= 1_000) this.combo = 0
    this.controlsAlpha = this.controlsElapsedMs <= controlsHoldMs
      ? 1
      : Math.max(0, 1 - (this.controlsElapsedMs - controlsHoldMs) / controlsFadeMs)
    const controlsVisible = this.controlsAlpha > 0
    this.controlsGraphics.setAlpha(this.controlsAlpha).setVisible(controlsVisible)
    this.techniqueText.setAlpha(this.controlsAlpha).setVisible(controlsVisible)
    this.controlsText.setAlpha(this.controlsAlpha).setVisible(controlsVisible)
    this.controlKeyTexts.forEach((text) => text.setAlpha(this.controlsAlpha).setVisible(controlsVisible))
    this.controlLimbTexts.forEach((text) => text.setAlpha(this.controlsAlpha).setVisible(controlsVisible))
  }

  update(input: Readonly<Omit<HudUpdateInput, 'combo'>>): void {
    if (this.disposed) return
    const model = deriveHudModel({ ...input, combo: this.combo })
    this.nameText.setText(model.nameText)
    this.hpText.setText(model.hpText)
    this.lifeText.setText(model.lifeText)
    this.advanceText.setText(model.advanceText).setVisible(model.advanceText.length > 0)
    this.comboText.setText(model.comboText).setVisible(model.comboText.length > 0)
    this.encounterText.setText(input.encounter?.label ?? '').setVisible(input.encounter !== null)
    this.inventoryHud.update(input.inventory)
    const wave = Math.max(1, Math.floor((input.waveIndex ?? 0) + 1))
    const waveCount = Math.max(wave, Math.floor(input.waveCount ?? 3))
    this.waveText.setText(`WAVE ${wave}/${waveCount}`)
    this.scoreText.setText(`SCORE ${String(Math.max(0, Math.floor(input.score ?? 0))).padStart(7, '0')}`)

    this.bars.clear()
    this.bars.fillStyle(palette.panel, 0.86)
    this.bars.fillRect(
      HUD_LAYOUT.player.x,
      HUD_LAYOUT.player.y,
      HUD_LAYOUT.player.width,
      HUD_LAYOUT.player.height,
    )
    this.bars.lineStyle(1, 0x334155, 0.9)
    this.bars.strokeRect(
      HUD_LAYOUT.player.x,
      HUD_LAYOUT.player.y,
      HUD_LAYOUT.player.width,
      HUD_LAYOUT.player.height,
    )
    this.bars.fillStyle(0x020617, 0.96)
    this.bars.fillRect(
      HUD_LAYOUT.portrait.x,
      HUD_LAYOUT.portrait.y,
      HUD_LAYOUT.portrait.width,
      HUD_LAYOUT.portrait.height,
    )
    this.bars.lineStyle(2, palette.health, 0.95)
    this.bars.strokeRect(
      HUD_LAYOUT.portrait.x,
      HUD_LAYOUT.portrait.y,
      HUD_LAYOUT.portrait.width,
      HUD_LAYOUT.portrait.height,
    )
    this.bars.fillStyle(palette.panel, 0.96)
    this.bars.fillRect(
      HUD_LAYOUT.health.x - 1,
      HUD_LAYOUT.health.y - 1,
      HUD_LAYOUT.health.width + 2,
      HUD_LAYOUT.health.height + 2,
    )
    this.bars.fillStyle(0x102838, 1)
    this.bars.fillRect(
      HUD_LAYOUT.health.x,
      HUD_LAYOUT.health.y,
      HUD_LAYOUT.health.width,
      HUD_LAYOUT.health.height,
    )
    this.bars.fillStyle(palette.health, 1)
    this.bars.fillRect(
      HUD_LAYOUT.health.x + 1,
      HUD_LAYOUT.health.y + 1,
      Math.max(0, HUD_LAYOUT.health.width - 2) * model.hpRatio,
      HUD_LAYOUT.health.height - 2,
    )
    this.bars.fillStyle(0x102838, 0.95)
    this.bars.fillRect(
      HUD_LAYOUT.meter.x,
      HUD_LAYOUT.meter.y,
      HUD_LAYOUT.meter.width,
      HUD_LAYOUT.meter.height,
    )
    this.bars.fillStyle(palette.cyan, 0.9)
    this.bars.fillRect(
      HUD_LAYOUT.meter.x,
      HUD_LAYOUT.meter.y,
      HUD_LAYOUT.meter.width * model.meterRatio,
      HUD_LAYOUT.meter.height,
    )
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
      advancePromptVisible: this.advanceText.visible,
      controlKeys: HUD_CONTROL_KEYS,
      inventory: this.inventoryHud.snapshot(),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.inventoryHud.dispose()
    this.bars.destroy()
    this.controlsGraphics.destroy()
    this.portrait.destroy()
    this.nameText.destroy()
    this.hpText.destroy()
    this.lifeText.destroy()
    this.advanceText.destroy()
    this.comboText.destroy()
    this.waveText.destroy()
    this.scoreText.destroy()
    this.encounterText.destroy()
    this.techniqueText.destroy()
    this.controlsText.destroy()
    this.controlKeyTexts.forEach((text) => text.destroy())
    this.controlLimbTexts.forEach((text) => text.destroy())
    this.actionFeedbackText.destroy()
  }
}
