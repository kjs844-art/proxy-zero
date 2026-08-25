import Phaser from 'phaser'

import { type GameServices, SCENE_KEYS } from '../../app/GameServices'

export const TITLE_CONTROLS_TEXT = 'PRESS ENTER / SPACE / J TO START'
const N9_DEPOT_BACKGROUND_KEY = 'n9-depot-background-v2'
const VIEWPORT_WIDTH = 640
const VIEWPORT_HEIGHT = 360

export class TitleScene extends Phaser.Scene {
  private continuing = false
  private keyboardNoticeCanvas: HTMLCanvasElement | null = null
  private previousCanvasAriaLabel: string | null = null
  private previousKeyboardRequiredValue: string | null = null

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Title })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Title)
    this.continuing = false
    this.cameras.main.setBackgroundColor('#050a12')

    // The same N-9 art used by the first combat zone makes the arcade entry
    // feel like one connected machine instead of a separate splash screen.
    this.add
      .image(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, N9_DEPOT_BACKGROUND_KEY)
      .setDisplaySize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
      .setAlpha(0.42)
      .setTint(0x6a7e86)
    this.add.rectangle(320, 180, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, 0x050a12, 0.68)

    // Worn-metal rails keep the title readable over the depot silhouette.
    this.add.rectangle(320, 30, 592, 2, 0x8da4aa, 0.55)
    this.add.rectangle(320, 332, 592, 2, 0x8da4aa, 0.42)
    this.add.rectangle(48, 180, 2, 292, 0x08b7d4, 0.6)
    this.add.rectangle(592, 180, 2, 292, 0xe34b5f, 0.55)
    this.add.rectangle(320, 154, 428, 2, 0x08b7d4, 0.3)
    this.add.rectangle(320, 158, 428, 1, 0xe34b5f, 0.22)

    // Offset colour plates give the logo a compact CRT/arcade sign treatment.
    this.add
      .text(324, 120, 'PROXY ZERO', {
        fontFamily: 'monospace',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#e34b5f',
      })
      .setAlpha(0.7)
      .setOrigin(0.5)
    this.add
      .text(316, 116, 'PROXY ZERO', {
        fontFamily: 'monospace',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#67e8f9',
        stroke: '#051018',
        strokeThickness: 5,
        shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 0, fill: true },
      })
      .setOrigin(0.5)
    this.add
      .text(320, 116, 'PROXY ZERO', {
        fontFamily: 'monospace',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#e8fbff',
        stroke: '#123746',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
    this.add
      .text(320, 166, 'N-9 DEPOT // ARCADE COMBAT SYSTEM', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#a9cbd1',
        letterSpacing: 1,
      })
      .setOrigin(0.5)

    this.add.rectangle(320, 224, 394, 48, 0x071b25, 0.94).setStrokeStyle(2, 0x67e8f9, 0.95)
    this.add.rectangle(320, 224, 386, 40, 0x0c2631, 0.72).setStrokeStyle(1, 0xc6e9ec, 0.35)
    this.add
      .text(320, 222, TITLE_CONTROLS_TEXT, {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#061018',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
    this.add
      .text(320, 251, 'READY FOR COMBAT', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#fbbf24',
      })
      .setOrigin(0.5)

    if (this.services.capabilities.mobile) {
      this.add
        .text(320, 282, 'PC KEYBOARD REQUIRED\nTOUCH CONTROLS NOT SUPPORTED', {
          align: 'center',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#fbbf24',
          lineSpacing: 4,
        })
        .setOrigin(0.5)
      this.markKeyboardRequirement()
    }

    this.input.keyboard?.on('keydown', this.onKeyDown)
    this.input.on('pointerdown', this.continueToSelect, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Enter' || event.code === 'Space' || event.code === 'KeyJ') {
      event.preventDefault()
      this.continueToSelect()
    }
  }

  private readonly continueToSelect = (): void => {
    if (this.continuing) return
    this.continuing = true
    this.scene.start(SCENE_KEYS.CharacterSelect)
  }

  private markKeyboardRequirement(): void {
    const canvas = this.game.canvas
    this.keyboardNoticeCanvas = canvas
    this.previousCanvasAriaLabel = canvas.getAttribute('aria-label')
    this.previousKeyboardRequiredValue = canvas.getAttribute('data-keyboard-required')
    canvas.setAttribute(
      'aria-label',
      'PROXY ZERO. PC keyboard required. Touch controls are not supported.',
    )
    canvas.setAttribute('data-keyboard-required', 'true')
  }

  private restoreCanvasAttribute(name: string, previousValue: string | null): void {
    if (!this.keyboardNoticeCanvas) return
    if (previousValue === null) {
      this.keyboardNoticeCanvas.removeAttribute(name)
    } else {
      this.keyboardNoticeCanvas.setAttribute(name, previousValue)
    }
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown)
    this.input.off('pointerdown', this.continueToSelect, this)
    this.restoreCanvasAttribute('aria-label', this.previousCanvasAriaLabel)
    this.restoreCanvasAttribute(
      'data-keyboard-required',
      this.previousKeyboardRequiredValue,
    )
    this.keyboardNoticeCanvas = null
    this.previousCanvasAriaLabel = null
    this.previousKeyboardRequiredValue = null
  }
}
