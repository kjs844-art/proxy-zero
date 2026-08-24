import type { CharacterId } from '../shared/types'
import type { ItemInventory } from '../items/itemReducer'
import type { ZoneEntry, ZoneId } from './types'

export const CHECKPOINT_SCHEMA_VERSION = 2 as const
export const RESPAWN_INVULNERABILITY_MS = 1_200
export const PLAYER_COMBO_TIMEOUT_MS = 850

export type DefeatedEnemyClass = 'normal' | 'elite' | 'boss'

export interface RunCheckpoint {
  schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION
  characterId: CharacterId
  zoneId: ZoneId
  zoneStartWaveId: string
  inventory: ItemInventory
}

export type RunStatus = 'playing' | 'game-over'
export type RunRankCap = 'C' | null

export interface RunState {
  characterId: CharacterId
  zoneId: ZoneId
  zoneStartWaveId: string
  currentWaveId: string
  lives: number
  continueUsed: boolean
  continueAvailable: boolean
  hp: number
  maxHp: number
  respawnInvulnerabilityRemainingMs: number
  activeTimeMs: number
  score: number
  currentCombo: number
  lastPlayerHitAtMs: number | null
  maxCombo: number
  hitsTaken: number
  debugClearUsed: boolean
  rankCap: RunRankCap
  status: RunStatus
}

export interface CreateRunStateOptions {
  characterId: CharacterId
  zoneId: ZoneId
  waveId: string
  maxHp: number
}

export type RunCommand =
  | { type: 'player-defeated' }
  | { type: 'player-hp-changed'; hp: number }
  | { type: 'advance-time'; deltaMs: number }
  | {
      type: 'record-combat-events'
      playerConfirmedHits: number
      playerDamageEvents: number
      defeatedEnemyClasses: readonly DefeatedEnemyClass[]
    }
  | { type: 'mark-debug-clear-used' }
  | { type: 'enter-zone'; entry: ZoneEntry }
  | { type: 'continue-from-checkpoint'; checkpoint: Readonly<RunCheckpoint> }

export type RunEffect =
  | { type: 'same-wave-respawn'; waveId: string }
  | { type: 'zone-entered'; entry: ZoneEntry }
  | {
      type: 'rebuild-zone'
      zoneId: ZoneId
      waveId: string
      inventory: ItemInventory
    }

export interface RunReducerResult {
  state: RunState
  effects: RunEffect[]
}

const ENEMY_SCORE: Readonly<Record<DefeatedEnemyClass, number>> = {
  normal: 500,
  elite: 2_500,
  boss: 5_000,
}

const cloneInventory = (inventory: Readonly<ItemInventory>): ItemInventory => ({
  counts: {
    emp: inventory.counts.emp,
    'repair-kit': inventory.counts['repair-kit'],
  },
  selectedItemId: inventory.selectedItemId,
})

const cloneState = (state: Readonly<RunState>): RunState => ({ ...state })

const resetCurrentCombo = (state: RunState): void => {
  state.currentCombo = 0
  state.lastPlayerHitAtMs = null
}

export const createRunState = (options: Readonly<CreateRunStateOptions>): RunState => ({
  characterId: options.characterId,
  zoneId: options.zoneId,
  zoneStartWaveId: options.waveId,
  currentWaveId: options.waveId,
  lives: 2,
  continueUsed: false,
  continueAvailable: false,
  hp: options.maxHp,
  maxHp: options.maxHp,
  respawnInvulnerabilityRemainingMs: 0,
  activeTimeMs: 0,
  score: 0,
  currentCombo: 0,
  lastPlayerHitAtMs: null,
  maxCombo: 0,
  hitsTaken: 0,
  debugClearUsed: false,
  rankCap: null,
  status: 'playing',
})

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const finiteCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

/** Applies deterministic run-level rules using only caller-supplied commands and time. */
export const runReducer = (
  incoming: Readonly<RunState>,
  command: Readonly<RunCommand>,
): RunReducerResult => {
  const state = cloneState(incoming)

  if (command.type === 'advance-time') {
    if (state.status !== 'playing') return { state, effects: [] }
    const deltaMs = finiteDelta(command.deltaMs)
    state.activeTimeMs += deltaMs
    state.respawnInvulnerabilityRemainingMs = Math.max(
      0,
      state.respawnInvulnerabilityRemainingMs - deltaMs,
    )
    if (
      state.currentCombo > 0 &&
      state.lastPlayerHitAtMs !== null &&
      state.activeTimeMs - state.lastPlayerHitAtMs >= PLAYER_COMBO_TIMEOUT_MS
    ) {
      resetCurrentCombo(state)
    }
    return { state, effects: [] }
  }

  if (command.type === 'record-combat-events') {
    if (state.status !== 'playing') return { state, effects: [] }
    const playerConfirmedHits = finiteCount(command.playerConfirmedHits)
    state.score += command.defeatedEnemyClasses.reduce(
      (total, enemyClass) => total + (ENEMY_SCORE[enemyClass] ?? 0),
      0,
    )
    state.hitsTaken += finiteCount(command.playerDamageEvents)

    if (playerConfirmedHits > 0) {
      const continuesCombo =
        state.currentCombo > 0 &&
        state.lastPlayerHitAtMs !== null &&
        state.activeTimeMs - state.lastPlayerHitAtMs < PLAYER_COMBO_TIMEOUT_MS
      state.currentCombo = (continuesCombo ? state.currentCombo : 0) + playerConfirmedHits
      state.lastPlayerHitAtMs = state.activeTimeMs
      state.maxCombo = Math.max(state.maxCombo, state.currentCombo)
    }
    return { state, effects: [] }
  }

  if (command.type === 'mark-debug-clear-used') {
    if (state.status === 'playing') state.debugClearUsed = true
    return { state, effects: [] }
  }

  if (command.type === 'player-hp-changed') {
    const hp = Number.isFinite(command.hp) ? command.hp : state.hp
    state.hp = Math.min(state.maxHp, Math.max(0, hp))
    return { state, effects: [] }
  }

  if (command.type === 'enter-zone') {
    if (state.status !== 'playing') return { state, effects: [] }
    const entry = {
      zoneId: command.entry.zoneId,
      zoneStartWaveId: command.entry.zoneStartWaveId,
    }
    state.zoneId = entry.zoneId
    state.zoneStartWaveId = entry.zoneStartWaveId
    state.currentWaveId = entry.zoneStartWaveId
    resetCurrentCombo(state)
    return { state, effects: [{ type: 'zone-entered', entry }] }
  }

  if (command.type === 'player-defeated') {
    if (state.status !== 'playing') return { state, effects: [] }

    resetCurrentCombo(state)
    state.lives = Math.max(0, state.lives - 1)
    if (state.lives > 0) {
      state.hp = state.maxHp
      state.respawnInvulnerabilityRemainingMs = RESPAWN_INVULNERABILITY_MS
      return {
        state,
        effects: [{ type: 'same-wave-respawn', waveId: state.currentWaveId }],
      }
    }

    state.hp = 0
    state.respawnInvulnerabilityRemainingMs = 0
    state.status = 'game-over'
    state.continueAvailable = !state.continueUsed
    return { state, effects: [] }
  }

  if (
    state.status !== 'game-over' ||
    state.lives !== 0 ||
    state.continueUsed ||
    !state.continueAvailable
  ) {
    return { state, effects: [] }
  }

  const saved = command.checkpoint
  if (
    saved.characterId !== state.characterId ||
    saved.zoneId !== state.zoneId ||
    saved.zoneStartWaveId !== state.zoneStartWaveId
  ) {
    return { state, effects: [] }
  }

  state.currentWaveId = saved.zoneStartWaveId
  state.lives = 2
  state.continueUsed = true
  state.continueAvailable = false
  state.hp = state.maxHp
  state.respawnInvulnerabilityRemainingMs = 0
  state.score = 0
  resetCurrentCombo(state)
  state.rankCap = 'C'
  state.status = 'playing'

  return {
    state,
    effects: [
      {
        type: 'rebuild-zone',
        zoneId: saved.zoneId,
        waveId: saved.zoneStartWaveId,
        inventory: cloneInventory(saved.inventory),
      },
    ],
  }
}
