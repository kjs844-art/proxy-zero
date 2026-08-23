import Phaser from 'phaser'

import { type GameServices, SCENE_KEYS } from '../../app/GameServices'

export class ResultsScene extends Phaser.Scene {
  private returning = false

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Results })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Results)
    this.returning = false
    this.cameras.main.setBackgroundColor('#050a12')
    const result = this.services.result === 'debug-clear' ? 'DEBUG CLEAR' : 'ENEMY DEFEATED'

    this.add
      .text(320, 142, result, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#67e8f9',
      })
      .setOrigin(0.5)
    this.add
      .text(320, 222, 'ENTER: TITLE', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.input.keyboard?.on('keydown', this.onKeyDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Enter' && event.code !== 'Space') return
    event.preventDefault()
    if (this.returning) return
    this.returning = true
    this.scene.start(SCENE_KEYS.Title)
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown)
  }
}
