import Phaser from 'phaser'

import {
  CHARACTER_CHOICES,
  type GameServices,
  SCENE_KEYS,
} from '../../app/GameServices'
import { ACTOR_ATLAS_KEY, getActorVisualProfile } from '../../content/animations'
import { characters, type CharacterId } from '../../content/characters'

const labels: Readonly<Record<CharacterId, string>> = {
  han: 'HAN',
  mina: 'MINA',
  jin: 'JIN',
}

const characterById: Readonly<Record<CharacterId, (typeof characters)[number]>> =
  Object.freeze(Object.fromEntries(characters.map((character) => [character.id, character])) as Record<
    CharacterId,
    (typeof characters)[number]
  >)

const percent = (value: number): string => `${Math.round(value * 100)}%`

export const CHARACTER_SELECT_CONTROLS_TEXT =
  '1/2/3 OR A/D OR ARROWS  •  ENTER / SPACE TO FIGHT'

export const characterSelectDirectionForCode = (code: string): -1 | 0 | 1 => {
  if (code === 'ArrowLeft' || code === 'KeyA') return -1
  if (code === 'ArrowRight' || code === 'KeyD') return 1
  return 0
}

/** Short, data-backed role copy shown only for the currently selected fighter. */
export const formatFighterBrief = (characterId: CharacterId): string => {
  const character = characterById[characterId]
  if (characterId === 'han') {
    return `${labels[characterId]}  •  BALANCED  •  ${character.maxHp} HP  •  POWER ${percent(character.damageScale)}  •  SPEED ${percent(character.attackSpeedScale)}`
  }
  if (characterId === 'mina') {
    return `${labels[characterId]}  •  RUSH  •  ${character.maxHp} HP  •  SPEED ${percent(character.attackSpeedScale)}  •  MOVE ${percent(character.moveSpeedScale)}`
  }
  return `${labels[characterId]}  •  POWER  •  ${character.maxHp} HP  •  DAMAGE ${percent(character.damageScale)}  •  HEAVY HITS`
}

export class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex = 0
  private confirming = false
  private choiceTexts: Phaser.GameObjects.Text[] = []
  private choiceImages: Phaser.GameObjects.Image[] = []
  private choiceCards: Phaser.GameObjects.Rectangle[] = []
  private fighterBriefText: Phaser.GameObjects.Text | null = null

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
      .text(320, 336, CHARACTER_SELECT_CONTROLS_TEXT, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)

    this.fighterBriefText = this.add
      .text(320, 306, '', {
        align: 'center',
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#67e8f9',
      })
      .setOrigin(0.5)

    this.renderSelection()
    this.input.keyboard?.on('keydown', this.onKeyDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const direction = characterSelectDirectionForCode(event.code)
    if (direction !== 0) {
      event.preventDefault()
      this.selectIndex(this.selectedIndex + direction)
      return
    }
    if (event.code === 'Digit1') {
      event.preventDefault()
      this.selectIndex(0)
      return
    }
    if (event.code === 'Digit2') {
      event.preventDefault()
      this.selectIndex(1)
      return
    }
    if (event.code === 'Digit3') {
      event.preventDefault()
      this.selectIndex(2)
      return
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault()
      this.confirmSelection()
    }
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
    this.fighterBriefText?.setText(formatFighterBrief(CHARACTER_CHOICES[this.selectedIndex]))
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
