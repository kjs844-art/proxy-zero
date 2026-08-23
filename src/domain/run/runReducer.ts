import type { CharacterId } from '../shared/types'
import type { ItemId, ZoneId } from './types'

export const CHECKPOINT_SCHEMA_VERSION = 1 as const
export const RESPAWN_INVULNERABILITY_MS = 1_200

export interface InventorySlot {
  itemId: ItemId | null
  count: number
  available: boolean
}

export interface RunCheckpoint {
  schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION
  characterId: CharacterId
  zoneId: ZoneId
  zoneStartWaveId: string
  inventory: InventorySlot
}

export type RunStatus = 'playing' | 'game-over'
export type RunRankCap = 'C' | null

export interface RunState {
  characterId: CharacterId
  zoneId: ZoneId
  currentWaveId: string
  lives: number
  continueUsed: boolean
  continueAvailable: boolean
  hp: number
  maxHp: number
  respawnInvulnerabilityRemainingMs: number
  score: number
  rankCap: RunRankCap
  status: RunStatus
  inventory: InventorySlot
}

export interface CreateRunStateOptions {
  characterId: CharacterId
  zoneId: ZoneId
  waveId: string
  maxHp: number
  inventory: Readonly<InventorySlot>
}

export type RunCommand =
  | { type: 'player-defeated' }
  | { type: 'player-hp-changed'; hp: number }
  | { type: 'advance-time'; deltaMs: number }
  | { type: 'continue-from-checkpoint'; checkpoint: Readonly<RunCheckpoint> }

export type RunEffect =
  | { type: 'same-wave-respawn'; waveId: string }
  | { type: 'rebuild-zone'; zoneId: ZoneId; waveId: string }

export interface RunReducerResult {
  state: RunState
  effects: RunEffect[]
}

const cloneInventory = (inventory: Readonly<InventorySlot>): InventorySlot => ({
  itemId: inventory.itemId,
  count: inventory.count,
  available: inventory.available,
})

const cloneState = (state: Readonly<RunState>): RunState => ({
  ...state,
  inventory: cloneInventory(state.inventory),
})

export const createRunState = (options: Readonly<CreateRunStateOptions>): RunState => ({
  characterId: options.characterId,
  zoneId: options.zoneId,
  currentWaveId: options.waveId,
  lives: 2,
  continueUsed: false,
  continueAvailable: false,
  hp: options.maxHp,
  maxHp: options.maxHp,
  respawnInvulnerabilityRemainingMs: 0,
  score: 0,
  rankCap: null,
  status: 'playing',
  inventory: cloneInventory(options.inventory),
})

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

/** Applies deterministic run-level rules using only caller-supplied commands and time. */
export const runReducer = (
  incoming: Readonly<RunState>,
  command: Readonly<RunCommand>,
): RunReducerResult => {
  const state = cloneState(incoming)

  if (command.type === 'advance-time') {
    state.respawnInvulnerabilityRemainingMs = Math.max(
      0,
      state.respawnInvulnerabilityRemainingMs - finiteDelta(command.deltaMs),
    )
    return { state, effects: [] }
  }

  if (command.type === 'player-hp-changed') {
    const hp = Number.isFinite(command.hp) ? command.hp : state.hp
    state.hp = Math.min(state.maxHp, Math.max(0, hp))
    return { state, effects: [] }
  }

  if (command.type === 'player-defeated') {
    if (state.status !== 'playing') return { state, effects: [] }

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
  state.characterId = saved.characterId
  state.zoneId = saved.zoneId
  state.currentWaveId = saved.zoneStartWaveId
  state.lives = 2
  state.continueUsed = true
  state.continueAvailable = false
  state.hp = state.maxHp
  state.respawnInvulnerabilityRemainingMs = 0
  state.score = 0
  state.rankCap = 'C'
  state.status = 'playing'
  state.inventory = cloneInventory(saved.inventory)

  return {
    state,
    effects: [
      {
        type: 'rebuild-zone',
        zoneId: saved.zoneId,
        waveId: saved.zoneStartWaveId,
      },
    ],
  }
}
