export interface AttackHitbox {
  offsetX: number
  offsetY: number
  zMin: number
  zMax: number
  halfWidth: number
  halfDepth: number
}

export interface AttackHit {
  strength: number
  damage: number
  hitstunMs: number
  knockbackX: number
  knockbackY: number
  launchZ: number
  maxHitsPerTarget: number
  hitIntervalMs: number
}

export interface AttackDefinition {
  id: string
  startupMs: number
  activeMs: number
  recoveryMs: number
  bufferMs: number
  hitbox: AttackHitbox
  hit: AttackHit
  meterGain: number
  meterCost: number
  groundedOnly: boolean
  airborneOnly: boolean
  grantsSuperArmor: boolean
}

export const calculateCancelStartMs = (
  attack: Pick<AttackDefinition, 'startupMs' | 'activeMs'>,
): number => attack.startupMs + attack.activeMs * (1 - 0.35)

type AttackOverrides = Partial<Omit<AttackDefinition, 'id' | 'hitbox' | 'hit'>> & {
  hitbox?: Partial<AttackHitbox>
  hit?: Partial<AttackHit>
}

const defineAttack = (id: string, overrides: AttackOverrides = {}): AttackDefinition => ({
  id,
  startupMs: overrides.startupMs ?? 100,
  activeMs: overrides.activeMs ?? 100,
  recoveryMs: overrides.recoveryMs ?? 300,
  bufferMs: overrides.bufferMs ?? 180,
  hitbox: {
    offsetX: overrides.hitbox?.offsetX ?? 34,
    offsetY: overrides.hitbox?.offsetY ?? 0,
    zMin: overrides.hitbox?.zMin ?? 0,
    zMax: overrides.hitbox?.zMax ?? 48,
    halfWidth: overrides.hitbox?.halfWidth ?? 24,
    halfDepth: overrides.hitbox?.halfDepth ?? 18,
  },
  hit: {
    strength: overrides.hit?.strength ?? 1,
    damage: overrides.hit?.damage ?? 10,
    hitstunMs: overrides.hit?.hitstunMs ?? 180,
    knockbackX: overrides.hit?.knockbackX ?? 42,
    knockbackY: overrides.hit?.knockbackY ?? 8,
    launchZ: overrides.hit?.launchZ ?? 0,
    maxHitsPerTarget: overrides.hit?.maxHitsPerTarget ?? 1,
    hitIntervalMs: overrides.hit?.hitIntervalMs ?? 0,
  },
  meterGain: overrides.meterGain ?? 10,
  meterCost: overrides.meterCost ?? 0,
  groundedOnly: overrides.groundedOnly ?? true,
  airborneOnly: overrides.airborneOnly ?? false,
  grantsSuperArmor: overrides.grantsSuperArmor ?? false,
})

const normalAttacks = (characterId: string): AttackDefinition[] => [
  defineAttack(`${characterId}-right-hand`, {
    hitbox: { offsetX: 30, halfWidth: 20, halfDepth: 16 },
  }),
  defineAttack(`${characterId}-left-hand`, {
    hitbox: { offsetX: 32, halfWidth: 21, halfDepth: 16 },
  }),
  defineAttack(`${characterId}-right-foot`, {
    hitbox: { offsetX: 40, halfWidth: 25, halfDepth: 18 },
  }),
  defineAttack(`${characterId}-left-foot`, {
    hitbox: { offsetX: 42, halfWidth: 26, halfDepth: 18 },
  }),
]

export const attackCatalog: readonly AttackDefinition[] = [
  ...normalAttacks('han'),
  defineAttack('han-cross-strike', {
    startupMs: 140,
    activeMs: 120,
    recoveryMs: 300,
    bufferMs: 190,
    hitbox: { offsetX: 44, halfWidth: 29, halfDepth: 20 },
    hit: { strength: 2, damage: 18, hitstunMs: 260, knockbackX: 70 },
    meterGain: 16,
  }),
  defineAttack('han-rising-kick', {
    startupMs: 180,
    activeMs: 130,
    recoveryMs: 360,
    bufferMs: 200,
    hitbox: { offsetX: 36, zMax: 82, halfWidth: 30, halfDepth: 22 },
    hit: { strength: 2, damage: 24, hitstunMs: 320, knockbackX: 54, launchZ: 180 },
    meterGain: 20,
  }),
  defineAttack('han-jump-kick', {
    startupMs: 110,
    activeMs: 140,
    recoveryMs: 240,
    bufferMs: 170,
    groundedOnly: false,
    airborneOnly: true,
    hitbox: { offsetX: 38, zMin: 12, zMax: 66, halfWidth: 27, halfDepth: 19 },
    hit: { damage: 14, hitstunMs: 220, knockbackX: 58, launchZ: 35 },
    meterGain: 12,
  }),
  defineAttack('han-iron-tempest', {
    startupMs: 260,
    activeMs: 420,
    recoveryMs: 520,
    bufferMs: 220,
    hitbox: { offsetX: 42, zMax: 72, halfWidth: 48, halfDepth: 34 },
    hit: {
      strength: 3,
      damage: 13,
      hitstunMs: 360,
      knockbackX: 96,
      launchZ: 120,
      maxHitsPerTarget: 4,
      hitIntervalMs: 90,
    },
    meterGain: 0,
    meterCost: 100,
  }),

  ...normalAttacks('mina'),
  defineAttack('mina-flash-step', {
    startupMs: 90,
    activeMs: 100,
    recoveryMs: 230,
    bufferMs: 160,
    hitbox: { offsetX: 52, halfWidth: 28, halfDepth: 18 },
    hit: { damage: 15, hitstunMs: 220, knockbackX: 64 },
    meterGain: 15,
  }),
  defineAttack('mina-sky-needle', {
    startupMs: 130,
    activeMs: 150,
    recoveryMs: 270,
    bufferMs: 170,
    hitbox: { offsetX: 34, zMax: 92, halfWidth: 25, halfDepth: 19 },
    hit: { strength: 2, damage: 20, hitstunMs: 280, knockbackX: 44, launchZ: 210 },
    meterGain: 18,
  }),
  defineAttack('mina-jump-heel', {
    startupMs: 80,
    activeMs: 150,
    recoveryMs: 210,
    bufferMs: 150,
    groundedOnly: false,
    airborneOnly: true,
    hitbox: { offsetX: 42, zMin: 14, zMax: 72, halfWidth: 28, halfDepth: 18 },
    hit: { damage: 13, hitstunMs: 210, knockbackX: 62, launchZ: 28 },
    meterGain: 12,
  }),
  defineAttack('mina-prism-rush', {
    startupMs: 190,
    activeMs: 480,
    recoveryMs: 390,
    bufferMs: 210,
    hitbox: { offsetX: 48, zMax: 68, halfWidth: 44, halfDepth: 30 },
    hit: {
      strength: 3,
      damage: 9,
      hitstunMs: 320,
      knockbackX: 88,
      launchZ: 90,
      maxHitsPerTarget: 6,
      hitIntervalMs: 72,
    },
    meterGain: 0,
    meterCost: 100,
  }),

  ...normalAttacks('jin'),
  defineAttack('jin-anchor-blow', {
    startupMs: 210,
    activeMs: 140,
    recoveryMs: 390,
    bufferMs: 200,
    hitbox: { offsetX: 40, zMax: 56, halfWidth: 34, halfDepth: 24 },
    hit: { strength: 2, damage: 24, hitstunMs: 330, knockbackX: 94 },
    meterGain: 18,
    grantsSuperArmor: true,
  }),
  defineAttack('jin-fault-line', {
    startupMs: 260,
    activeMs: 180,
    recoveryMs: 430,
    bufferMs: 220,
    hitbox: { offsetX: 46, zMax: 78, halfWidth: 40, halfDepth: 30 },
    hit: { strength: 3, damage: 31, hitstunMs: 390, knockbackX: 112, launchZ: 150 },
    meterGain: 22,
    grantsSuperArmor: true,
  }),
  defineAttack('jin-jump-crush', {
    startupMs: 150,
    activeMs: 170,
    recoveryMs: 350,
    bufferMs: 190,
    groundedOnly: false,
    airborneOnly: true,
    hitbox: { offsetX: 34, zMin: 10, zMax: 76, halfWidth: 32, halfDepth: 24 },
    hit: { strength: 2, damage: 18, hitstunMs: 290, knockbackX: 74, launchZ: 45 },
    meterGain: 14,
  }),
  defineAttack('jin-zero-breaker', {
    startupMs: 340,
    activeMs: 260,
    recoveryMs: 610,
    bufferMs: 220,
    hitbox: { offsetX: 52, zMax: 88, halfWidth: 56, halfDepth: 38 },
    hit: {
      strength: 3,
      damage: 32,
      hitstunMs: 460,
      knockbackX: 140,
      launchZ: 190,
      maxHitsPerTarget: 2,
      hitIntervalMs: 130,
    },
    meterGain: 0,
    meterCost: 100,
    grantsSuperArmor: true,
  }),
]
