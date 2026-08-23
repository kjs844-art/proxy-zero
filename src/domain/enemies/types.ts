export interface EnemyPoint {
  readonly x: number
  readonly y: number
}

export interface EnemyAttackRange {
  readonly x: number
  readonly y: number
}

export interface EnemyAttackPattern {
  readonly id: string
  readonly telegraphMs: number
  readonly activeMs: number
  readonly recoveryMs: number
  readonly range: EnemyAttackRange
  readonly weight: number
}

export interface EnemyIntentWeights {
  readonly attack: number
  readonly guard: number
}

export interface EnemyBaseBodyDefinition {
  readonly id: string
  readonly maxHp: number
  readonly radius: number
}

/** A variant reuses a base body and supplies authored balance and intent data. */
export interface EnemyVariantDefinition {
  readonly id: string
  readonly baseBodyId: string
  readonly moveSpeed: number
  readonly chaseDistance: number
  readonly guardDurationMs: number
  readonly intentWeights: EnemyIntentWeights
  readonly attacks: readonly EnemyAttackPattern[]
}

export type EnemyState =
  | 'patrol'
  | 'chase'
  | 'telegraph'
  | 'attack'
  | 'recover'
  | 'guard'
  | 'down'

export interface WaveSpawnOrder {
  readonly id: string
  readonly enemyVariantId: string
  readonly delayMs: number
}

export interface WaveDefinition {
  readonly id: string
  readonly orders: readonly WaveSpawnOrder[]
}
