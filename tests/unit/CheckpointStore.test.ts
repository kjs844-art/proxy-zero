import { describe, expect, it } from 'vitest'

import { CheckpointStore, type StorageLike } from '../../src/runtime/CheckpointStore'
import type { RunCheckpoint } from '../../src/domain/run/runReducer'

const validCheckpoint = (): RunCheckpoint => ({
  schemaVersion: 2,
  characterId: 'han',
  zoneId: 'n9-depot',
  zoneStartWaveId: 'n9-depot-wave-1',
  inventory: {
    counts: { emp: 0, 'repair-kit': 1 },
    selectedItemId: 'repair-kit',
  },
})

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  removed: string[] = []

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.removed.push(key)
    this.values.delete(key)
  }
}

describe('CheckpointStore', () => {
  it('serializes exactly the schema-versioned approved checkpoint fields', () => {
    const storage = new MemoryStorage()
    const store = new CheckpointStore(storage)
    const source = {
      ...validCheckpoint(),
      score: 50_000,
      lives: 1,
      hp: 12,
      continueUsed: true,
      rank: 'S',
      enemyHp: 2,
      bossPhase: 3,
      combo: 99,
      hazardActive: true,
      temporaryEffect: 'damage-up',
    }

    expect(store.save(source)).toBe(true)

    const serialized = storage.values.get(CheckpointStore.storageKey)
    expect(JSON.parse(serialized ?? 'null')).toEqual({
      schemaVersion: 2,
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
      inventory: {
        counts: { emp: 0, 'repair-kit': 1 },
        selectedItemId: 'repair-kit',
      },
    })
  })

  it('loads a fresh sanitized copy isolated from source and caller mutations', () => {
    const storage = new MemoryStorage()
    const source = {
      ...validCheckpoint(),
      ignored: { enemyHp: 1 },
    }
    storage.values.set(CheckpointStore.storageKey, JSON.stringify(source))
    const store = new CheckpointStore(storage)

    const first = store.load()
    expect(first).toEqual(validCheckpoint())
    expect(Object.keys(first ?? {})).toEqual([
      'schemaVersion',
      'characterId',
      'zoneId',
      'zoneStartWaveId',
      'inventory',
    ])

    if (!first) throw new Error('Expected a valid checkpoint.')
    first.inventory.counts['repair-kit'] = 0
    source.inventory.counts['repair-kit'] = 0

    expect(store.load()).toEqual(validCheckpoint())
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong schema', JSON.stringify({ ...validCheckpoint(), schemaVersion: 1 })],
    ['array payload', JSON.stringify([])],
    ['null payload', 'null'],
    ['invalid character', JSON.stringify({ ...validCheckpoint(), characterId: 'zero' })],
    ['invalid zone', JSON.stringify({ ...validCheckpoint(), zoneId: 'void' })],
    [
      'invalid wave',
      JSON.stringify({ ...validCheckpoint(), zoneStartWaveId: 'n9-depot-wave-99' }),
    ],
    [
      'wave from another zone',
      JSON.stringify({ ...validCheckpoint(), zoneStartWaveId: 'service-train-wave-1' }),
    ],
    [
      'invalid item count',
      JSON.stringify({
        ...validCheckpoint(),
        inventory: {
          counts: { emp: -1, 'repair-kit': 0 },
          selectedItemId: 'emp',
        },
      }),
    ],
    [
      'missing count key',
      JSON.stringify({
        ...validCheckpoint(),
        inventory: { counts: { emp: 1 }, selectedItemId: 'emp' },
      }),
    ],
    [
      'extra count key',
      JSON.stringify({
        ...validCheckpoint(),
        inventory: {
          counts: { emp: 1, 'repair-kit': 0, nuke: 1 },
          selectedItemId: 'emp',
        },
      }),
    ],
    [
      'impossible selection',
      JSON.stringify({
        ...validCheckpoint(),
        inventory: {
          counts: { emp: 0, 'repair-kit': 1 },
          selectedItemId: 'emp',
        },
      }),
    ],
  ])('removes %s without throwing', (_label, stored) => {
    const storage = new MemoryStorage()
    storage.values.set(CheckpointStore.storageKey, stored)
    const store = new CheckpointStore(storage)

    expect(() => store.load()).not.toThrow()
    expect(store.load()).toBeNull()
    expect(storage.removed).toContain(CheckpointStore.storageKey)
  })

  it('is safe with missing storage and thrown storage operations', () => {
    const thrownStorage: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }

    expect(new CheckpointStore().load()).toBeNull()
    expect(new CheckpointStore().save(validCheckpoint())).toBe(false)
    expect(new CheckpointStore().remove()).toBe(false)
    expect(new CheckpointStore(thrownStorage).load()).toBeNull()
    expect(new CheckpointStore(thrownStorage).save(validCheckpoint())).toBe(false)
    expect(new CheckpointStore(thrownStorage).remove()).toBe(false)
  })
})
