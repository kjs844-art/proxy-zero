import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {
      constructor(_config: unknown) {}
    },
  },
}))

import {
  CHARACTER_SELECT_BACKGROUND_KEY,
  CHARACTER_SELECT_CONTROLS_TEXT,
  characterSelectDirectionForCode,
  fighterRoleForCharacter,
  formatFighterBrief,
} from '../../src/phaser/scenes/CharacterSelectScene'

describe('CharacterSelectScene fighter briefs', () => {
  it('keeps the visual contract on the preloaded depot art and compact role tags', () => {
    expect(CHARACTER_SELECT_BACKGROUND_KEY).toBe('n9-depot-background-v2')
    expect(fighterRoleForCharacter('han')).toBe('BALANCED')
    expect(fighterRoleForCharacter('mina')).toBe('RUSH')
    expect(fighterRoleForCharacter('jin')).toBe('POWER')
  })

  it('documents and maps both A/D and arrow character selection controls', () => {
    expect(CHARACTER_SELECT_CONTROLS_TEXT).toBe(
      '1/2/3 OR A/D OR ARROWS  •  ENTER / SPACE TO FIGHT',
    )
    expect(characterSelectDirectionForCode('KeyA')).toBe(-1)
    expect(characterSelectDirectionForCode('ArrowLeft')).toBe(-1)
    expect(characterSelectDirectionForCode('KeyD')).toBe(1)
    expect(characterSelectDirectionForCode('ArrowRight')).toBe(1)
    expect(characterSelectDirectionForCode('KeyW')).toBe(0)
  })

  it('shows concise roles backed by the selected fighter data', () => {
    expect(formatFighterBrief('han')).toBe(
      'HAN  •  BALANCED  •  100 HP  •  POWER 100%  •  SPEED 100%',
    )
    expect(formatFighterBrief('mina')).toBe(
      'MINA  •  RUSH  •  85 HP  •  SPEED 122%  •  MOVE 118%',
    )
    expect(formatFighterBrief('jin')).toBe(
      'JIN  •  POWER  •  125 HP  •  DAMAGE 128%  •  HEAVY HITS',
    )
  })
})
