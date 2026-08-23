import type { EnemyPoint, WaveDefinition, WaveSpawnOrder } from '../domain/enemies/types'
import type { ArenaBounds, PlayerSafeSeparation } from '../domain/waves/waveDirector'

export interface DepotSpawnOrder extends WaveSpawnOrder {
  readonly position: EnemyPoint
}

export interface DepotWaveDefinition extends WaveDefinition {
  readonly seed: number
  readonly orders: readonly DepotSpawnOrder[]
}

export interface DepotZoneDefinition {
  readonly id: 'n9-depot'
  readonly arena: ArenaBounds
  readonly playerSafeSeparation: PlayerSafeSeparation
  readonly waves: readonly DepotWaveDefinition[]
  readonly interWaveDelayMs: number
  readonly enemyDamageScale: number
  readonly transitionDurationMs: number
  readonly targetDurationMs: number
  readonly acceptanceDurationMs: {
    readonly min: number
    readonly max: number
  }
  readonly inputReadyWithinMs: number
  readonly firstSpawnWithinMs: number
  readonly enemyPatternAttackIds: Readonly<Record<string, string>>
}

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
): DepotSpawnOrder => ({ id, enemyVariantId, delayMs, position: { x, y } })

/** Immutable Zone 1 data. Runtime state is always reconstructed from these values. */
export const n9DepotZone: DepotZoneDefinition = deepFreeze({
  id: 'n9-depot',
  arena: { minX: 48, maxX: 592, minY: 188, maxY: 320 },
  playerSafeSeparation: { x: 72, y: 34 },
  interWaveDelayMs: 900,
  enemyDamageScale: 0.05,
  transitionDurationMs: 1_500,
  targetDurationMs: 180_000,
  acceptanceDurationMs: { min: 150_000, max: 210_000 },
  inputReadyWithinMs: 2_000,
  firstSpawnWithinMs: 4_000,
  enemyPatternAttackIds: {
    'scout-patrol-kick': 'han-right-foot',
    'scout-striker-jab': 'han-right-hand',
    'scout-striker-sweep': 'han-left-foot',
    'bulwark-sentinel-slam': 'jin-anchor-blow',
    'bulwark-enforcer-punch': 'han-left-hand',
    'bulwark-enforcer-charge': 'han-rising-kick',
  },
  waves: [
    {
      id: 'n9-depot-wave-1',
      seed: 0x19a2c4e1,
      orders: [
        spawn('entry-patrol', 'scout-patrol', 0, 454, 248),
        spawn('far-striker', 'scout-striker', 6_000, 530, 210),
      ],
    },
    {
      id: 'n9-depot-wave-2',
      seed: 0x29b3d5f2,
      orders: [
        spawn('left-striker', 'scout-striker', 0, 488, 214),
        spawn('anchor-sentinel', 'bulwark-sentinel', 6_500, 542, 288),
      ],
    },
    {
      id: 'n9-depot-wave-3',
      seed: 0x39c4e603,
      orders: [
        spawn('near-patrol', 'scout-patrol', 0, 450, 276),
        spawn('far-striker', 'scout-striker', 6_000, 524, 208),
        spawn('gate-enforcer', 'bulwark-enforcer', 12_000, 552, 280),
      ],
    },
  ],
})
