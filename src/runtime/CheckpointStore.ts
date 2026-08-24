import type { CharacterId } from '../domain/shared/types'
import {
  CHECKPOINT_SCHEMA_VERSION,
  type RunCheckpoint,
} from '../domain/run/runReducer'
import type { ItemInventory } from '../domain/items/itemReducer'
import type { ItemId } from '../domain/items/types'
import type { ZoneId } from '../domain/run/types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const characters: readonly CharacterId[] = ['han', 'mina', 'jin']
const zones: readonly ZoneId[] = ['n9-depot', 'service-train', 'flooded-tunnel']
const items: readonly ItemId[] = ['emp', 'repair-kit']
const zoneStartWaveIds: Readonly<Record<ZoneId, string>> = {
  'n9-depot': 'n9-depot-wave-1',
  'service-train': 'service-train-wave-1',
  'flooded-tunnel': 'flooded-tunnel-wave-1',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCharacter = (value: unknown): value is CharacterId =>
  typeof value === 'string' && characters.includes(value as CharacterId)

const isZone = (value: unknown): value is ZoneId =>
  typeof value === 'string' && zones.includes(value as ZoneId)

const isItem = (value: unknown): value is ItemId =>
  typeof value === 'string' && items.includes(value as ItemId)

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

const isCount = (value: unknown): value is 0 | 1 => value === 0 || value === 1

const sanitizeInventory = (value: unknown): ItemInventory | null => {
  if (!isRecord(value)) return null
  if (!hasExactKeys(value, ['counts', 'selectedItemId'])) return null
  if (!isRecord(value.counts) || !hasExactKeys(value.counts, ['emp', 'repair-kit'])) {
    return null
  }
  const emp = value.counts.emp
  const repairKit = value.counts['repair-kit']
  if (!isCount(emp) || !isCount(repairKit)) return null
  const selectedItemId = value.selectedItemId
  if (selectedItemId !== null && !isItem(selectedItemId)) return null
  if (selectedItemId !== null) {
    const selectedCount = selectedItemId === 'emp' ? emp : repairKit
    if (selectedCount !== 1) return null
  }
  return {
    counts: { emp, 'repair-kit': repairKit },
    selectedItemId,
  }
}

const sanitizeCheckpoint = (value: unknown): RunCheckpoint | null => {
  if (!isRecord(value) || value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) return null
  if (!isCharacter(value.characterId) || !isZone(value.zoneId)) return null
  if (value.zoneStartWaveId !== zoneStartWaveIds[value.zoneId]) {
    return null
  }
  const inventory = sanitizeInventory(value.inventory)
  if (!inventory) return null

  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    characterId: value.characterId,
    zoneId: value.zoneId,
    zoneStartWaveId: value.zoneStartWaveId,
    inventory,
  }
}

export class CheckpointStore {
  static readonly storageKey = 'proxy-zero:checkpoint:v2'

  constructor(private readonly storage?: StorageLike | null) {}

  save(checkpoint: Readonly<RunCheckpoint>): boolean {
    const sanitized = sanitizeCheckpoint(checkpoint)
    if (!this.storage || !sanitized) return false
    try {
      this.storage.setItem(CheckpointStore.storageKey, JSON.stringify(sanitized))
      return true
    } catch {
      return false
    }
  }

  load(): RunCheckpoint | null {
    if (!this.storage) return null

    let stored: string | null
    try {
      stored = this.storage.getItem(CheckpointStore.storageKey)
    } catch {
      return null
    }
    if (stored === null) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(stored)
    } catch {
      this.removeInvalid()
      return null
    }

    const checkpoint = sanitizeCheckpoint(parsed)
    if (!checkpoint) this.removeInvalid()
    return checkpoint
  }

  remove(): boolean {
    if (!this.storage) return false
    try {
      this.storage.removeItem(CheckpointStore.storageKey)
      return true
    } catch {
      return false
    }
  }

  private removeInvalid(): void {
    try {
      this.storage?.removeItem(CheckpointStore.storageKey)
    } catch {
      // Best-effort reset: storage failures never escape into the game loop.
    }
  }
}
