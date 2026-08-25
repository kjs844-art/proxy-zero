import { describe, expect, it } from 'vitest'

import {
  resolveAttackLimbCueProfile,
  UNKNOWN_ATTACK_LIMB_CUE,
} from '../../src/presentation/AttackLimbCueProfile'

const characters = ['han', 'mina', 'jin'] as const

const expectedByLimb = {
  'left-hand': {
    kind: 'hand', side: 'left', color: 0x67e8f9,
    arc: { direction: -1, startDegrees: -150, endDegrees: -38, radius: 26 },
    dust: { direction: -1, particleCount: 2, lift: 5 },
  },
  'right-hand': {
    kind: 'hand', side: 'right', color: 0xfb7185,
    arc: { direction: 1, startDegrees: -38, endDegrees: 70, radius: 26 },
    dust: { direction: 1, particleCount: 2, lift: 5 },
  },
  'left-foot': {
    kind: 'foot', side: 'left', color: 0xa78bfa,
    arc: { direction: -1, startDegrees: 168, endDegrees: 28, radius: 38 },
    dust: { direction: -1, particleCount: 5, lift: 2 },
  },
  'right-foot': {
    kind: 'foot', side: 'right', color: 0xfbbf24,
    arc: { direction: 1, startDegrees: 12, endDegrees: 152, radius: 38 },
    dust: { direction: 1, particleCount: 5, lift: 2 },
  },
} as const

describe('attack limb cue profiles', () => {
  it.each(characters)('classifies every direct %s attack with a distinct limb cue', (characterId) => {
    for (const [limb, expected] of Object.entries(expectedByLimb)) {
      expect(resolveAttackLimbCueProfile(`${characterId}-${limb}`)).toEqual({
        characterId,
        ...expected,
      })
    }
  })

  it('returns the neutral fallback for combo, enemy, and malformed IDs', () => {
    for (const attackId of ['han-cross-strike', 'boss-dredger-slam', 'mina-right-elbow', '']) {
      expect(resolveAttackLimbCueProfile(attackId)).toBe(UNKNOWN_ATTACK_LIMB_CUE)
    }
    expect(UNKNOWN_ATTACK_LIMB_CUE).toMatchObject({
      characterId: null,
      kind: 'unknown',
      side: 'none',
      dust: { particleCount: 0 },
    })
  })
})
