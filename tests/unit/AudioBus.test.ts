import { describe, expect, it, vi } from 'vitest'

import { AudioBus, AUDIO_CUE_IDS } from '../../src/presentation/AudioBus'

describe('AudioBus', () => {
  it('owns exactly fourteen stable cues and consumes each monotonic batch once', () => {
    const play = vi.fn((_cue: string) => true)
    const bus = new AudioBus({ play })

    expect(AUDIO_CUE_IDS).toHaveLength(14)
    expect(new Set(AUDIO_CUE_IDS).size).toBe(14)
    expect(bus.consumeBatch(7, ['attack-light', 'hit-light'])).toBe(true)
    expect(bus.consumeBatch(7, ['defeat'])).toBe(false)
    expect(bus.consumeBatch(6, ['defeat'])).toBe(false)
    expect(bus.consumeBatch(8, ['defeat'])).toBe(true)
    expect(play.mock.calls.map(([cue]) => cue)).toEqual([
      'attack-light', 'hit-light', 'defeat',
    ])
  })

  it('isolates synchronous play failures and rejected resume promises', async () => {
    const diagnostic = vi.fn()
    const bus = new AudioBus({
      play: () => { throw new Error('blocked') },
      resumeAll: () => Promise.reject(new Error('denied')),
    }, diagnostic)

    expect(() => bus.consumeBatch(1, ['hit-heavy'])).not.toThrow()
    await expect(bus.resume()).resolves.toBe(false)
    expect(diagnostic).toHaveBeenCalledTimes(2)
  })

  it('keeps the loop idempotent and treats missing audio as non-blocking', () => {
    const play = vi.fn((_cue: string) => true)
    const stopByKey = vi.fn()
    const bus = new AudioBus({ play, stopByKey })

    expect(bus.startCombatLoop()).toBe(true)
    expect(bus.startCombatLoop()).toBe(false)
    bus.resetTransient()
    bus.dispose()
    bus.dispose()

    expect(play).toHaveBeenCalledOnce()
    expect(stopByKey.mock.calls.filter(([cue]) => cue === 'combat-loop')).toHaveLength(1)
    for (const cue of AUDIO_CUE_IDS.filter((id) => id !== 'combat-loop')) {
      expect(stopByKey.mock.calls.filter(([called]) => called === cue)).toHaveLength(2)
    }
    expect(() => new AudioBus(null).consumeBatch(1, ['pickup'])).not.toThrow()
  })
})
