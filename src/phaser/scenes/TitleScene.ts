import Phaser from 'phaser'

import { type GameServices, SCENE_KEYS } from '../../app/GameServices'

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

    this.add
      .text(320, 116, 'PROXY ZERO', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#67e8f9',
      })
      .setOrigin(0.5)
    this.add
      .text(320, 220, 'PRESS START', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#0e7490',
        padding: { x: 14, y: 8 },
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
