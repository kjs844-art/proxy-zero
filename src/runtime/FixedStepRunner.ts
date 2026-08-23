import { fixedStepMs, maxCatchUpSteps } from '../domain/combat/tuning'

export type FixedStep = () => void

export class FixedStepRunner {
  private accumulatorMs = 0
  private paused = false

  constructor(private readonly onStep: FixedStep) {}

  advance(renderDeltaMs: number): number {
    if (this.paused) {
      return 0
    }

    this.accumulatorMs += Math.max(0, Number.isFinite(renderDeltaMs) ? renderDeltaMs : 0)

    const availableSteps = Math.floor((this.accumulatorMs + 0.000001) / fixedStepMs)
    const stepsToRun = Math.min(availableSteps, maxCatchUpSteps)

    if (availableSteps > maxCatchUpSteps) {
      this.accumulatorMs = 0
    } else {
      this.accumulatorMs = Math.max(0, this.accumulatorMs - stepsToRun * fixedStepMs)
    }

    for (let step = 0; step < stepsToRun; step += 1) {
      this.onStep()
    }

    return stepsToRun
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }
}
