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
export const CHARACTER_SELECT_BACKGROUND_KEY = 'n9-depot-background-v2'
const VIEWPORT_WIDTH = 640
const VIEWPORT_HEIGHT = 360
const CARD_X_POSITIONS = [120, 320, 520] as const
const CARD_Y = 188
const CARD_WIDTH = 176
const CARD_HEIGHT = 246

const roleById: Readonly<Record<CharacterId, string>> = {
  han: 'BALANCED',
  mina: 'RUSH',
  jin: 'POWER',
}

export const fighterRoleForCharacter = (characterId: CharacterId): string =>
  roleById[characterId]

type FighterStat = 'hp' | 'damage' | 'speed'

const fighterStatValues = (
  characterId: CharacterId,
): Readonly<Record<FighterStat, number>> => {
  const character = characterById[characterId]
  return {
    hp: character.maxHp / 125,
    damage: character.damageScale / 1.28,
    speed: character.attackSpeedScale / 1.22,
  }
}

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
  private choiceRoleTexts: Phaser.GameObjects.Text[] = []
  private choiceStatFills: Phaser.GameObjects.Rectangle[][] = []
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
    this.choiceRoleTexts = []
    this.choiceStatFills = []
    this.services.selectCharacter(CHARACTER_CHOICES[this.selectedIndex])
    this.cameras.main.setBackgroundColor('#071018')

    this.add
      .image(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, CHARACTER_SELECT_BACKGROUND_KEY)
      .setDisplaySize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
      .setAlpha(0.36)
      .setTint(0x647a83)
    this.add.rectangle(320, 180, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, 0x050a12, 0.72)
    this.add.rectangle(320, 30, 592, 2, 0x8da4aa, 0.52)
    this.add.rectangle(320, 332, 592, 2, 0x8da4aa, 0.42)
    this.add.rectangle(47, 180, 2, 292, 0x08b7d4, 0.56)
    this.add.rectangle(593, 180, 2, 292, 0xe34b5f, 0.5)

    this.add
      .text(320, 26, 'SELECT FIGHTER', {
        fontFamily: 'monospace',
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#e8fbff',
        stroke: '#061018',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    this.add
      .text(320, 48, 'CHOOSE YOUR PROXY // ENTER TO DEPLOY', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#a9cbd1',
        letterSpacing: 1,
      })
      .setOrigin(0.5)

    CHARACTER_CHOICES.forEach((characterId, index) => {
      const profile = getActorVisualProfile(characterId)
      const cardX = CARD_X_POSITIONS[index]
      const cardTop = CARD_Y - CARD_HEIGHT / 2
      this.choiceCards.push(
        this.add
          .rectangle(cardX, CARD_Y, CARD_WIDTH, CARD_HEIGHT, 0x071018, 0.76)
          .setStrokeStyle(2, 0x1f5068, 0.9),
      )
      this.add
        .rectangle(cardX, cardTop + 7, CARD_WIDTH - 12, 3, index === 1 ? 0xe34b5f : 0x08b7d4, 0.7)
        .setOrigin(0.5)
      this.choiceImages.push(
        this.add
          .image(
            cardX,
            200,
            ACTOR_ATLAS_KEY,
            profile.clips.idle.frames[0],
          )
          .setOrigin(profile.anchor.x, profile.anchor.y)
          .setScale(0.78),
      )
      const text = this.add
        .text(cardX, 210, labels[characterId], {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#94a3b8',
          stroke: '#061018',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
      text.on('pointerdown', () => {
        this.selectIndex(index)
        this.confirmSelection()
      })
      this.choiceTexts.push(text)

      this.choiceRoleTexts.push(
        this.add
          .text(cardX, 228, fighterRoleForCharacter(characterId), {
            fontFamily: 'monospace',
            fontSize: '9px',
            fontStyle: 'bold',
            color: '#fbbf24',
            backgroundColor: '#111d24',
            padding: { x: 8, y: 3 },
          })
          .setOrigin(0.5),
      )

      const statValues = fighterStatValues(characterId)
      const statNames: ReadonlyArray<readonly [FighterStat, string]> = [
        ['hp', 'HP'],
        ['damage', 'DMG'],
        ['speed', 'SPD'],
      ]
      this.choiceStatFills.push(
        statNames.map(([stat, name], statIndex) => {
          const statY = 250 + statIndex * 12
          this.add
            .text(cardX - 79, statY, name, {
              fontFamily: 'monospace',
              fontSize: '8px',
              color: '#a9cbd1',
            })
            .setOrigin(0, 0.5)
          this.add
            .rectangle(cardX - 35, statY, 82, 5, 0x213640, 0.95)
            .setOrigin(0, 0.5)
          const fill = this.add
            .rectangle(cardX - 35, statY, Math.max(4, 82 * Math.min(1, statValues[stat])), 5, 0x67e8f9, 1)
            .setOrigin(0, 0.5)
          return fill
        }),
      )
    })

    this.add
      .text(320, 345, CHARACTER_SELECT_CONTROLS_TEXT, {
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)

    this.fighterBriefText = this.add
      .text(320, 316, '', {
        align: 'center',
        fontFamily: 'monospace',
        fontSize: '9px',
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
      image
        .setAlpha(index === this.selectedIndex ? 1 : 0.5)
        .setScale(index === this.selectedIndex ? 0.84 : 0.78)
    })
    this.choiceCards.forEach((card, index) => {
      card
        .setFillStyle(index === this.selectedIndex ? 0x0b2632 : 0x071018, index === this.selectedIndex ? 0.92 : 0.68)
        .setStrokeStyle(index === this.selectedIndex ? 3 : 1, index === this.selectedIndex ? 0x67e8f9 : 0x1f5068, 1)
    })
    this.choiceRoleTexts.forEach((text, index) => {
      text.setColor(index === this.selectedIndex ? '#fbbf24' : '#71858d')
    })
    this.choiceStatFills.forEach((fills, index) => {
      fills.forEach((fill) => fill.setFillStyle(index === this.selectedIndex ? 0x67e8f9 : 0x48636c, 1))
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
