import { describe, expect, it } from 'vitest'

import { PerformanceGovernor } from '../../src/presentation/PerformanceGovernor'

describe('PerformanceGovernor', () => {
  it('enters low-effect only after two continuous seconds below 45 FPS', () => {
    const governor = new PerformanceGovernor()

    for (let frame = 0; frame < 79; frame += 1) governor.sample(1_000 / 40)
    expect(governor.mode).toBe('normal')
    governor.sample(1_000 / 40)
    expect(governor.mode).toBe('low-effect')
  })

  it('resets a broken entry streak and requires five continuous seconds at 55 FPS to recover', () => {
    const governor = new PerformanceGovernor()

    governor.sample(1_000)
    governor.sample(1_000 / 60)
    governor.sample(1_000)
    expect(governor.mode).toBe('normal')
    governor.sample(1_000)
    expect(governor.mode).toBe('low-effect')

    for (let elapsed = 0; elapsed < 4_999; elapsed += 100) governor.sample(100)
    expect(governor.mode).toBe('low-effect')
    governor.sample(1_000 / 60)
    expect(governor.mode).toBe('low-effect')

    governor.resetSampling()
    for (let frame = 0; frame < 299; frame += 1) governor.sample(1_000 / 60)
    expect(governor.mode).toBe('low-effect')
    governor.sample(1_000 / 60)
    expect(governor.mode).toBe('normal')
  })

  it('ignores invalid samples and resets only sampling streaks, not the selected mode', () => {
    const governor = new PerformanceGovernor()
    governor.sample(2_000)
    expect(governor.mode).toBe('low-effect')

    governor.sample(Number.NaN)
    governor.sample(-4)
    governor.resetSampling()

    expect(governor.snapshot()).toEqual({
      mode: 'low-effect',
      lowFpsStreakMs: 0,
      recoveryStreakMs: 0,
    })
  })
})
