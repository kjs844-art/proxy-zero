import type { EnemyPoint, WaveDefinition, WaveSpawnOrder } from '../domain/enemies/types'
import type { ItemPickupSnapshot } from '../domain/items/itemReducer'
import type { ZoneEntry } from '../domain/run/types'
import type { Vec3 } from '../domain/shared/types'
import type { ArenaBounds, PlayerSafeSeparation } from '../domain/waves/waveDirector'

export type PlayableStageOneZoneId = 'n9-depot' | 'service-train' | 'flooded-tunnel'

export interface StageOneSpawnOrder extends WaveSpawnOrder {
  readonly position: EnemyPoint
}

export interface StageOneWaveDefinition extends WaveDefinition {
  readonly seed: number
  readonly orders: readonly StageOneSpawnOrder[]
}

export interface PlayableStageOneZoneDefinition {
  readonly id: PlayableStageOneZoneId
  readonly arena: ArenaBounds
  readonly playerSafeSeparation: PlayerSafeSeparation
  readonly playerStart: Vec3
  readonly waves: readonly StageOneWaveDefinition[]
  readonly pickups: readonly ItemPickupSnapshot[]
  readonly interWaveDelayMs: number
  readonly enemyDamageScale: number
  readonly eliteDamageScale: number
  readonly bossDamageScale: number
  readonly transitionDurationMs: number
  readonly targetDurationMs: number
  readonly acceptanceDurationMs: { readonly min: number; readonly max: number }
  readonly inputReadyWithinMs: number
  readonly firstSpawnWithinMs: number
  readonly enemyPatternAttackIds: Readonly<Record<string, string>>
  readonly nextZoneEntry: ZoneEntry | null
}

export type DepotSpawnOrder = StageOneSpawnOrder
export type DepotWaveDefinition = StageOneWaveDefinition
export type DepotZoneDefinition = PlayableStageOneZoneDefinition & { readonly id: 'n9-depot' }

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

const spawn = (
  id: string,
  enemyVariantId: string,
  delayMs: number,
  x: number,
  y: number,
): StageOneSpawnOrder => ({ id, enemyVariantId, delayMs, position: { x, y } })

const normalPatternAttackIds = {
  'scout-patrol-kick': 'han-right-foot',
  'scout-striker-jab': 'han-right-hand',
  'scout-striker-sweep': 'han-left-foot',
  'bulwark-sentinel-slam': 'jin-anchor-blow',
  'bulwark-enforcer-punch': 'han-left-hand',
  'bulwark-enforcer-charge': 'han-rising-kick',
} as const

/** Immutable Zone 1 data. Runtime state is always reconstructed from these values. */
export const n9DepotZone: DepotZoneDefinition = deepFreeze({
  id: 'n9-depot',
  arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
  playerSafeSeparation: { x: 72, y: 34 },
  playerStart: { x: 250, y: 248, z: 0 },
  pickups: [
    {
      id: 'n9-depot:emp', itemId: 'emp',
      position: { x: 164, y: 302 }, consumed: false,
    },
    {
      id: 'n9-depot:repair-kit', itemId: 'repair-kit',
      position: { x: 438, y: 302 }, consumed: false,
    },
  ],
  interWaveDelayMs: 900,
  enemyDamageScale: 0.15,
  eliteDamageScale: 1,
  bossDamageScale: 1,
  transitionDurationMs: 1_500,
  targetDurationMs: 360_000,
  acceptanceDurationMs: { min: 300_000, max: 420_000 },
  inputReadyWithinMs: 2_000,
  firstSpawnWithinMs: 4_000,
  enemyPatternAttackIds: normalPatternAttackIds,
  nextZoneEntry: { zoneId: 'service-train', zoneStartWaveId: 'service-train-wave-1' },
  waves: [
    {
      id: 'n9-depot-wave-1', seed: 0x19a2c4e1,
      orders: [
        spawn('entry-patrol', 'scout-patrol', 0, 454, 248),
        spawn('far-striker', 'scout-striker', 450, 530, 210),
        spawn('entry-flanker', 'scout-striker', 900, 548, 286),
      ],
    },
    {
      id: 'n9-depot-wave-2', seed: 0x29b3d5f2,
      orders: [
        spawn('left-striker', 'scout-striker', 0, 488, 214),
        spawn('anchor-sentinel', 'bulwark-sentinel', 550, 542, 288),
        spawn('rear-patrol', 'scout-patrol', 1_100, 560, 242),
      ],
    },
    {
      id: 'n9-depot-wave-3', seed: 0x39c4e603,
      orders: [
        spawn('near-patrol', 'scout-patrol', 0, 450, 276),
        spawn('far-striker', 'scout-striker', 450, 524, 208),
        spawn('gate-enforcer', 'bulwark-enforcer', 900, 552, 280),
        spawn('upper-patrol', 'scout-patrol', 1_350, 566, 224),
      ],
    },
    {
      id: 'n9-depot-wave-4', seed: 0x49d5f714,
      orders: [
        spawn('relay-sentinel', 'bulwark-sentinel', 0, 486, 246),
        spawn('upper-striker', 'scout-striker', 650, 552, 208),
        spawn('lower-patrol', 'scout-patrol', 1_300, 530, 298),
      ],
    },
    {
      id: 'n9-depot-wave-5', seed: 0x59e60825,
      orders: [
        spawn('last-enforcer', 'bulwark-enforcer', 0, 500, 278),
        spawn('last-striker', 'scout-striker', 650, 566, 214),
        spawn('last-sentinel', 'bulwark-sentinel', 1_300, 548, 300),
        spawn('last-patrol', 'scout-patrol', 1_950, 470, 236),
      ],
    },
  ],
})

/** Immutable Zone 2 data, including its only two fresh zone-start pickups. */
export const serviceTrainZone: PlayableStageOneZoneDefinition & {
  readonly id: 'service-train'
} = deepFreeze({
  id: 'service-train',
  arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
  playerSafeSeparation: { x: 72, y: 34 },
  playerStart: { x: 112, y: 236, z: 0 },
  pickups: [
    {
      id: 'service-train:repair-kit', itemId: 'repair-kit',
      position: { x: 176, y: 214 }, consumed: false,
    },
    {
      id: 'service-train:emp', itemId: 'emp',
      position: { x: 470, y: 292 }, consumed: false,
    },
  ],
  interWaveDelayMs: 900,
  enemyDamageScale: 0.2,
  eliteDamageScale: 1,
  bossDamageScale: 1,
  transitionDurationMs: 1_500,
  targetDurationMs: 360_000,
  acceptanceDurationMs: { min: 300_000, max: 420_000 },
  inputReadyWithinMs: 2_000,
  firstSpawnWithinMs: 4_000,
  enemyPatternAttackIds: {
    ...normalPatternAttackIds,
    'elite-rail-hammer': 'elite-rail-hammer',
    'elite-lane-charge': 'elite-lane-charge',
  },
  nextZoneEntry: { zoneId: 'flooded-tunnel', zoneStartWaveId: 'flooded-tunnel-wave-1' },
  waves: [
    {
      id: 'service-train-wave-1', seed: 0x4ad5e714,
      orders: [
        spawn('train-striker', 'scout-striker', 0, 480, 214),
        spawn('train-sentinel', 'bulwark-sentinel', 600, 540, 288),
      ],
    },
    {
      id: 'service-train-wave-2', seed: 0x5be6f825,
      orders: [
        spawn('train-patrol', 'scout-patrol', 0, 450, 276),
        spawn('train-flanker', 'scout-striker', 600, 524, 208),
        spawn('train-enforcer', 'bulwark-enforcer', 1_200, 552, 280),
      ],
    },
    {
      id: 'service-train-wave-3', seed: 0x6cf70936,
      orders: [
        spawn('train-patrol-support', 'scout-patrol', 0, 470, 250),
        spawn('train-rear-striker', 'scout-striker', 650, 540, 300),
        spawn('train-rear-sentinel', 'bulwark-sentinel', 1_300, 560, 220),
      ],
    },
    {
      id: 'service-train-wave-4', seed: 0x7d081a47,
      orders: [
        spawn('train-late-patrol', 'scout-patrol', 0, 455, 286),
        spawn('elite-screen-striker', 'scout-striker', 650, 520, 210),
        spawn('elite-screen-sentinel', 'bulwark-sentinel', 1_300, 570, 292),
        spawn('train-final-enforcer', 'bulwark-enforcer', 1_950, 500, 250),
      ],
    },
    {
      id: 'service-train-wave-5', seed: 0x8e192b58,
      orders: [spawn('elite-bulwark-frame', 'elite-bulwark-frame', 0, 500, 270)],
    },
  ],
})

/** Immutable Zone 3 data. Its fourth and final wave is the only Stage 1 boss. */
export const floodedTunnelZone: PlayableStageOneZoneDefinition & {
  readonly id: 'flooded-tunnel'
} = deepFreeze({
  id: 'flooded-tunnel',
  arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
  playerSafeSeparation: { x: 72, y: 34 },
  playerStart: { x: 112, y: 224, z: 0 },
  pickups: [],
  interWaveDelayMs: 900,
  enemyDamageScale: 0.35,
  eliteDamageScale: 1,
  bossDamageScale: 1,
  transitionDurationMs: 1_500,
  targetDurationMs: 480_000,
  acceptanceDurationMs: { min: 420_000, max: 600_000 },
  inputReadyWithinMs: 2_000,
  firstSpawnWithinMs: 4_000,
  enemyPatternAttackIds: {
    ...normalPatternAttackIds,
    'boss-dredger-slam': 'boss-dredger-slam',
    'boss-floodline-charge': 'boss-floodline-charge',
  },
  nextZoneEntry: null,
  waves: [
    {
      id: 'flooded-tunnel-wave-1', seed: 0x7d081a47,
      orders: [
        spawn('tunnel-striker', 'scout-striker', 0, 452, 214),
        spawn('tunnel-patrol', 'scout-patrol', 650, 516, 286),
        spawn('tunnel-sentinel', 'bulwark-sentinel', 1_300, 558, 248),
      ],
    },
    {
      id: 'flooded-tunnel-wave-2', seed: 0x8e192b58,
      orders: [
        spawn('tunnel-enforcer', 'bulwark-enforcer', 0, 490, 302),
        spawn('tunnel-upper-striker', 'scout-striker', 650, 575, 205),
        spawn('tunnel-lower-patrol', 'scout-patrol', 1_300, 520, 300),
      ],
    },
    {
      id: 'flooded-tunnel-wave-3', seed: 0x9f2a3c69,
      orders: [
        spawn('tunnel-rear-sentinel', 'bulwark-sentinel', 0, 570, 250),
        spawn('tunnel-rear-striker', 'scout-striker', 650, 500, 214),
        spawn('tunnel-final-enforcer', 'bulwark-enforcer', 1_300, 548, 292),
        spawn('tunnel-final-patrol', 'scout-patrol', 1_950, 470, 236),
      ],
    },
    {
      id: 'flooded-tunnel-wave-4', seed: 0xaf3b4d7a,
      orders: [spawn('final-boss', 'boss-silo-dredger', 0, 500, 264)],
    },
  ],
})

const playableZones: Readonly<Record<PlayableStageOneZoneId, PlayableStageOneZoneDefinition>> =
  Object.freeze({
    'n9-depot': n9DepotZone,
    'service-train': serviceTrainZone,
    'flooded-tunnel': floodedTunnelZone,
  })

export const getPlayableStageOneZone = (
  zoneId: PlayableStageOneZoneId,
): PlayableStageOneZoneDefinition => playableZones[zoneId]
