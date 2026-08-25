/**
 * Presentation-only classification for the four direct combat limbs.
 * Combat rules must continue to use the authored attack ID and never this cue.
 */
export type CueCharacterId = 'han' | 'mina' | 'jin'
export type LimbCueKind = 'hand' | 'foot' | 'unknown'
export type LimbCueSide = 'left' | 'right' | 'none'

export interface LimbArcCue {
  /** Local direction; a renderer can multiply this by the actor facing. */
  readonly direction: -1 | 1
  readonly startDegrees: number
  readonly endDegrees: number
  readonly radius: number
}

export interface LimbDustCue {
  /** Local direction; a renderer can multiply this by the actor facing. */
  readonly direction: -1 | 1
  readonly particleCount: number
  readonly lift: number
}

export interface AttackLimbCueProfile {
  readonly characterId: CueCharacterId | null
  readonly kind: LimbCueKind
  readonly side: LimbCueSide
  readonly color: number
  readonly arc: LimbArcCue
  readonly dust: LimbDustCue
}

type BasicLimbKey = 'left-hand' | 'right-hand' | 'left-foot' | 'right-foot'

const limbProfiles: Readonly<Record<BasicLimbKey, Omit<AttackLimbCueProfile, 'characterId'>>> = {
  'left-hand': {
    kind: 'hand',
    side: 'left',
    color: 0x67e8f9,
    arc: { direction: -1, startDegrees: -150, endDegrees: -38, radius: 26 },
    dust: { direction: -1, particleCount: 2, lift: 5 },
  },
  'right-hand': {
    kind: 'hand',
    side: 'right',
    color: 0xfb7185,
    arc: { direction: 1, startDegrees: -38, endDegrees: 70, radius: 26 },
    dust: { direction: 1, particleCount: 2, lift: 5 },
  },
  'left-foot': {
    kind: 'foot',
    side: 'left',
    color: 0xa78bfa,
    arc: { direction: -1, startDegrees: 168, endDegrees: 28, radius: 38 },
    dust: { direction: -1, particleCount: 5, lift: 2 },
  },
  'right-foot': {
    kind: 'foot',
    side: 'right',
    color: 0xfbbf24,
    arc: { direction: 1, startDegrees: 12, endDegrees: 152, radius: 38 },
    dust: { direction: 1, particleCount: 5, lift: 2 },
  },
}

export const UNKNOWN_ATTACK_LIMB_CUE: Readonly<AttackLimbCueProfile> = Object.freeze({
  characterId: null,
  kind: 'unknown',
  side: 'none',
  color: 0x94a3b8,
  arc: Object.freeze({ direction: 1, startDegrees: -18, endDegrees: 18, radius: 18 }),
  dust: Object.freeze({ direction: 1, particleCount: 0, lift: 0 }),
})

const basicAttackId = /^(han|mina|jin)-(left|right)-(hand|foot)$/

/**
 * Returns an immutable-looking value for any direct player attack ID. Unknown
 * attacks deliberately get a neutral cue so callers can safely opt out.
 */
export const resolveAttackLimbCueProfile = (attackId: string): AttackLimbCueProfile => {
  const match = basicAttackId.exec(attackId)
  if (!match) return UNKNOWN_ATTACK_LIMB_CUE

  const [, characterId, side, kind] = match
  const key = `${side}-${kind}` as BasicLimbKey
  const profile = limbProfiles[key]
  return {
    characterId: characterId as CueCharacterId,
    ...profile,
  }
}
