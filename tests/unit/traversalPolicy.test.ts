import { describe, expect, it } from 'vitest'

import {
  NORMAL_WAVE_TRAVERSAL_GRACE_MS,
  normalWaveTraversalUnlockAtMs,
  shouldOpenNormalWaveTraversal,
  waveRequiresArenaClear,
} from '../../src/domain/waves/traversalPolicy'
import type { StageOneWaveDefinition } from '../../src/content/stage1'

const wave = (
  enemyVariantIds: readonly string[],
  delays: readonly number[] = enemyVariantIds.map((_, index) => index * 400),
): StageOneWaveDefinition => ({
  id: 'test-wave',
  seed: 1,
  orders: enemyVariantIds.map((enemyVariantId, index) => ({
    id: `enemy-${index}`,
    enemyVariantId,
    delayMs: delays[index] ?? 0,
    position: { x: 500, y: 240 },
  })),
})

describe('normal wave traversal policy', () => {
  it('opens a normal encounter after its final spawn plus a short grace window', () => {
    const definition = wave(['scout-patrol', 'scout-striker'], [0, 600])
    expect(normalWaveTraversalUnlockAtMs(definition)).toBe(
      600 + NORMAL_WAVE_TRAVERSAL_GRACE_MS,
    )
    expect(shouldOpenNormalWaveTraversal({
      wave: definition,
      elapsedMs: 600 + NORMAL_WAVE_TRAVERSAL_GRACE_MS - 1,
      emittedOrderCount: 2,
    })).toBe(false)
    expect(shouldOpenNormalWaveTraversal({
      wave: definition,
      elapsedMs: 600 + NORMAL_WAVE_TRAVERSAL_GRACE_MS,
      emittedOrderCount: 2,
    })).toBe(true)
  })

  it('does not open before all authored enemies have entered', () => {
    const definition = wave(['scout-patrol', 'scout-striker'])
    expect(shouldOpenNormalWaveTraversal({
      wave: definition,
      elapsedMs: 10_000,
      emittedOrderCount: 1,
    })).toBe(false)
  })

  it('keeps elite and boss encounters locked until combat clear', () => {
    const elite = wave(['elite-bulwark-frame'])
    const boss = wave(['boss-silo-dredger'])
    expect(waveRequiresArenaClear(elite)).toBe(true)
    expect(waveRequiresArenaClear(boss)).toBe(true)
    expect(shouldOpenNormalWaveTraversal({
      wave: elite,
      elapsedMs: 20_000,
      emittedOrderCount: 1,
    })).toBe(false)
    expect(shouldOpenNormalWaveTraversal({
      wave: boss,
      elapsedMs: 20_000,
      emittedOrderCount: 1,
    })).toBe(false)
  })
})
