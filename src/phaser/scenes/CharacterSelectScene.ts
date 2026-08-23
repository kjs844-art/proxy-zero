import Phaser from 'phaser'

import {
  CHARACTER_CHOICES,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import type { CharacterId } from '../../content/characters'

const labels: Readonly<Record<CharacterId, string>> = {
  han: 'HAN',
  mina: 'MINA',
  jin: 'JIN',
}

export class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex = 0
  private confirming = false
  private choiceTexts: Phaser.GameObjects.Text[] = []

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.CharacterSelect })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.CharacterSelect)
    this.selectedIndex = 0
    this.confirming = false
    this.choiceTexts = []
    this.services.selectCharacter(CHARACTER_CHOICES[this.selectedIndex])
    this.cameras.main.setBackgroundColor('#071018')

    this.add
      .text(320, 64, 'SELECT FIGHTER', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e8fbff',
      })
      .setOrigin(0.5)

    CHARACTER_CHOICES.forEach((characterId, index) => {
      const text = this.add
        .text(160 + index * 160, 174, labels[characterId], {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#94a3b8',
          backgroundColor: '#111827',
          padding: { x: 14, y: 18 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      text.on('pointerdown', () => {
        this.selectIndex(index)
        this.confirmSelection()
      })
      this.choiceTexts.push(text)
    })

    this.add
      .text(320, 286, '1/2/3 OR ARROWS  •  ENTER TO FIGHT', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)

    this.renderSelection()
    this.input.keyboard?.on('keydown', this.onKeyDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'ArrowLeft') this.selectIndex(this.selectedIndex - 1)
    if (event.code === 'ArrowRight') this.selectIndex(this.selectedIndex + 1)
    if (event.code === 'Digit1') this.selectIndex(0)
    if (event.code === 'Digit2') this.selectIndex(1)
    if (event.code === 'Digit3') this.selectIndex(2)
    if (event.code === 'Enter' || event.code === 'Space') this.confirmSelection()
  }

  private selectIndex(index: number): void {
    const wrappedIndex = (index + CHARACTER_CHOICES.length) % CHARACTER_CHOICES.length
    this.selectedIndex = wrappedIndex
    this.services.selectCharacter(CHARACTER_CHOICES[wrappedIndex])
    this.renderSelection()
  }

  private renderSelection(): void {
    this.choiceTexts.forEach((text, index) => {
      text.setColor(index === this.selectedIndex ? '#ffffff' : '#94a3b8')
      text.setBackgroundColor(index === this.selectedIndex ? '#0e7490' : '#111827')
    })
  }

  private confirmSelection(): void {
    if (this.confirming) return
    this.confirming = true
    this.services.confirmCharacter(CHARACTER_CHOICES[this.selectedIndex], 0)
    this.scene.start(SCENE_KEYS.Combat)
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown)
  }
}
