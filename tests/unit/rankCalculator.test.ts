import { describe, expect, it } from 'vitest'

import {
  calculateRunRank,
  type RunRankInput,
} from '../../src/domain/run/rankCalculator'

const calculate = (overrides: Partial<RunRankInput> = {}) =>
  calculateRunRank({
    outcome: 'mission-clear',
    activeTimeMs: 12 * 60_000 + 1,
    score: 0,
    maxCombo: 0,
    hitsTaken: 15,
    continueUsed: false,
    ...overrides,
  })

describe('calculateRunRank', () => {
  it('applies every inclusive score boundary', () => {
    expect(calculate({ score: 0, hitsTaken: 4 })).toBe('D')
    expect(calculate({ score: Number.EPSILON, hitsTaken: 4 })).toBe('C')
    expect(calculate({ score: 7_499, maxCombo: 10, hitsTaken: 8 })).toBe('C')
    expect(calculate({ score: 7_500, maxCombo: 10, hitsTaken: 8 })).toBe('B')
    expect(calculate({ score: 11_999, activeTimeMs: 9 * 60_000, maxCombo: 10 })).toBe('B')
    expect(calculate({ score: 12_000, activeTimeMs: 9 * 60_000, maxCombo: 10 })).toBe('A')
    expect(calculate({
      score: 14_999, activeTimeMs: 10 * 60_000, maxCombo: 10, hitsTaken: 4,
    })).toBe('A')
    expect(calculate({
      score: 15_000, activeTimeMs: 10 * 60_000, maxCombo: 10, hitsTaken: 4,
    })).toBe('S')
  })

  it('applies every inclusive active-time boundary', () => {
    expect(calculate({ activeTimeMs: 12 * 60_000, maxCombo: 10 })).toBe('C')
    expect(calculate({ activeTimeMs: 12 * 60_000 + 1, maxCombo: 10 })).toBe('D')
    expect(calculate({
      activeTimeMs: 11.5 * 60_000, score: 7_500, maxCombo: 10,
    })).toBe('B')
    expect(calculate({
      activeTimeMs: 11.5 * 60_000 + 1, score: 7_500, maxCombo: 10,
    })).toBe('C')
    expect(calculate({
      activeTimeMs: 10 * 60_000, score: 15_000, maxCombo: 10,
    })).toBe('A')
    expect(calculate({
      activeTimeMs: 10 * 60_000 + 1, score: 15_000, maxCombo: 10,
    })).toBe('B')
    expect(calculate({
      activeTimeMs: 9 * 60_000, score: 12_000, maxCombo: 10, hitsTaken: 4,
    })).toBe('S')
    expect(calculate({
      activeTimeMs: 9 * 60_000 + 1, score: 12_000, maxCombo: 10, hitsTaken: 4,
    })).toBe('A')
  })

  it('applies player-only max-combo boundaries', () => {
    expect(calculate({ maxCombo: 2, hitsTaken: 4 })).toBe('D')
    expect(calculate({ maxCombo: 3, hitsTaken: 4 })).toBe('C')
    expect(calculate({ score: 7_500, maxCombo: 5, hitsTaken: 4 })).toBe('C')
    expect(calculate({ score: 7_500, maxCombo: 6, hitsTaken: 4 })).toBe('B')
    expect(calculate({ score: 15_000, maxCombo: 9, hitsTaken: 4 })).toBe('B')
    expect(calculate({ score: 15_000, maxCombo: 10, hitsTaken: 4 })).toBe('A')
  })

  it('applies hits-taken boundaries', () => {
    expect(calculate({ maxCombo: 10, hitsTaken: 15 })).toBe('D')
    expect(calculate({ maxCombo: 10, hitsTaken: 14 })).toBe('C')
    expect(calculate({ score: 7_500, maxCombo: 10, hitsTaken: 9 })).toBe('C')
    expect(calculate({ score: 7_500, maxCombo: 10, hitsTaken: 8 })).toBe('B')
    expect(calculate({ score: 15_000, maxCombo: 10, hitsTaken: 5 })).toBe('B')
    expect(calculate({ score: 15_000, maxCombo: 10, hitsTaken: 4 })).toBe('A')
  })

  it.each([
    [{ score: 15_000, activeTimeMs: 10 * 60_000, maxCombo: 10, hitsTaken: 4 }, 'S'],
    [{ score: 14_999, activeTimeMs: 10 * 60_000, maxCombo: 10, hitsTaken: 4 }, 'A'],
    [{ score: 15_000, activeTimeMs: 10 * 60_000, maxCombo: 6, hitsTaken: 14 }, 'A'],
    [{ score: 15_000, activeTimeMs: 10 * 60_000 + 1, maxCombo: 6, hitsTaken: 14 }, 'B'],
    [{ score: 15_000, hitsTaken: 4 }, 'B'],
    [{ score: 12_000, hitsTaken: 4 }, 'C'],
    [{ score: 15_000 }, 'C'],
    [{ score: 12_000 }, 'D'],
  ] as const)('maps exact total-point boundaries for %o to %s', (overrides, expected) => {
    expect(calculate({ ...overrides })).toBe(expected)
  })

  it('forces failed and debug-cleared runs to D', () => {
    const perfect = { activeTimeMs: 0, score: 15_000, maxCombo: 99, hitsTaken: 0 }
    expect(calculate({ ...perfect, outcome: 'mission-failed' })).toBe('D')
    expect(calculate({ ...perfect, outcome: 'debug-clear' })).toBe('D')
  })

  it.each([
    [{ score: 15_000, activeTimeMs: 0, maxCombo: 10, hitsTaken: 0 }, 'C'],
    [{ score: 15_000, activeTimeMs: 10 * 60_000, maxCombo: 6, hitsTaken: 14 }, 'C'],
    [{ score: 15_000, hitsTaken: 4 }, 'C'],
    [{ score: 12_000 }, 'D'],
  ] as const)('caps a successful Continue result for %o at %s', (overrides, expected) => {
    expect(calculate({ ...overrides, continueUsed: true })).toBe(expected)
  })

  it('normalizes invalid numbers to zero without mutating input', () => {
    const input: RunRankInput = {
      outcome: 'mission-clear',
      activeTimeMs: Number.NaN,
      score: Number.NEGATIVE_INFINITY,
      maxCombo: -1,
      hitsTaken: Number.POSITIVE_INFINITY,
      continueUsed: false,
    }
    const snapshot = { ...input }
    expect(calculateRunRank(input)).toBe('B')
    expect(input).toEqual(snapshot)
  })
})
