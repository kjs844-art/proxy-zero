import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: {
    Scene: class Scene {
      constructor(_config: unknown) {}
    },
  },
}))

import { formatFighterBrief } from '../../src/phaser/scenes/CharacterSelectScene'

describe('CharacterSelectScene fighter briefs', () => {
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
