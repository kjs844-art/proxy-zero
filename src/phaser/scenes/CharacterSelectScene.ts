import Phaser from 'phaser'

import {
  CHARACTER_CHOICES,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import { ACTOR_ATLAS_KEY, getActorVisualProfile } from '../../content/animations'
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
  private choiceImages: Phaser.GameObjects.Image[] = []
  private choiceCards: Phaser.GameObjects.Rectangle[] = []

  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.CharacterSelect })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.CharacterSelect)
    this.selectedIndex = 0
    this.confirming = false
    this.choiceTexts = []
    this.choiceImages = []
    this.choiceCards = []
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
      const profile = getActorVisualProfile(characterId)
      this.choiceCards.push(
        this.add
          .rectangle(160 + index * 160, 188, 136, 210, 0x071018, 0.5)
          .setStrokeStyle(1, 0x1f5068, 0.8),
      )
      this.choiceImages.push(
        this.add
          .image(
            160 + index * 160,
            244,
            ACTOR_ATLAS_KEY,
            profile.clips.idle.frames[0],
          )
          .setOrigin(profile.anchor.x, profile.anchor.y),
      )
      const text = this.add
        .text(160 + index * 160, 274, labels[characterId], {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#94a3b8',
          backgroundColor: '#071018e6',
          padding: { x: 18, y: 7 },
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
      .text(320, 330, '1/2/3 OR ARROWS  •  ENTER TO FIGHT', {
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
      text.setBackgroundColor(index === this.selectedIndex ? '#0e3c4d' : '#071018')
    })
    this.choiceImages.forEach((image, index) => {
      image.setAlpha(index === this.selectedIndex ? 1 : 0.5)
    })
    this.choiceCards.forEach((card, index) => {
      card
        .setFillStyle(index === this.selectedIndex ? 0x0b1f2b : 0x071018, index === this.selectedIndex ? 0.86 : 0.5)
        .setStrokeStyle(index === this.selectedIndex ? 2 : 1, index === this.selectedIndex ? 0x67e8f9 : 0x1f5068, 1)
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
