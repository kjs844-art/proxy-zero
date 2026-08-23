import { describe, expect, it } from 'vitest'
import { FixedStepRunner } from '../../src/runtime/FixedStepRunner'

describe('FixedStepRunner', () => {
  it('advances one domain step for a 16.6667 ms render gap', () => {
    let stepCount = 0
    const runner = new FixedStepRunner(() => {
      stepCount += 1
    })

    expect(runner.advance(16.6667)).toBe(1)
    expect(stepCount).toBe(1)
  })

  it('advances three domain steps for a 50 ms render gap', () => {
    let stepCount = 0
    const runner = new FixedStepRunner(() => {
      stepCount += 1
    })

    expect(runner.advance(50)).toBe(3)
    expect(stepCount).toBe(3)
  })

  it('caps a frame at five catch-up steps and discards its excess time', () => {
    let stepCount = 0
    const runner = new FixedStepRunner(() => {
      stepCount += 1
    })

    expect(runner.advance(1_000)).toBe(5)
    expect(runner.advance(0)).toBe(0)
    expect(stepCount).toBe(5)
  })

  it('does not advance or age domain time while paused', () => {
    let stepCount = 0
    const runner = new FixedStepRunner(() => {
      stepCount += 1
    })

    runner.pause()
    expect(runner.advance(1_000)).toBe(0)
    runner.resume()

    expect(runner.advance(0)).toBe(0)
    expect(stepCount).toBe(0)
  })
})
