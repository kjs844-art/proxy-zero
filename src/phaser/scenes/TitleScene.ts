import Phaser from 'phaser'

import { type GameServices, SCENE_KEYS } from '../../app/GameServices'

export class TitleScene extends Phaser.Scene {
  private continuing = false

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

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown)
    this.input.off('pointerdown', this.continueToSelect, this)
  }
}
