export type PerformanceMode = 'normal' | 'low-effect'

export interface PerformanceGovernorSnapshot {
  readonly mode: PerformanceMode
  readonly lowFpsStreakMs: number
  readonly recoveryStreakMs: number
}

const LOW_FPS_THRESHOLD = 45
const LOW_FPS_ENTRY_MS = 2_000
const RECOVERY_FPS_THRESHOLD = 55
const RECOVERY_MS = 5_000

/**
 * Presentation-only quality governor. It observes render deltas and can only
 * select a VFX budget; domain clocks and commands never flow through here.
 */
export class PerformanceGovernor {
  private modeValue: PerformanceMode = 'normal'
  private lowFpsStreakMs = 0
  private recoveryStreakMs = 0

  get mode(): PerformanceMode {
    return this.modeValue
  }

  sample(requestedDeltaMs: number): PerformanceMode {
    const deltaMs = Number.isFinite(requestedDeltaMs) && requestedDeltaMs > 0
      ? requestedDeltaMs
      : 0
    if (deltaMs === 0) return this.modeValue
    const fps = 1_000 / deltaMs

    if (this.modeValue === 'normal') {
      this.recoveryStreakMs = 0
      this.lowFpsStreakMs = fps < LOW_FPS_THRESHOLD
        ? this.lowFpsStreakMs + deltaMs
        : 0
      if (this.lowFpsStreakMs >= LOW_FPS_ENTRY_MS) {
        this.modeValue = 'low-effect'
        this.lowFpsStreakMs = 0
      }
      return this.modeValue
    }

    this.lowFpsStreakMs = 0
    this.recoveryStreakMs = fps >= RECOVERY_FPS_THRESHOLD
      ? this.recoveryStreakMs + deltaMs
      : 0
    if (this.recoveryStreakMs >= RECOVERY_MS) {
      this.modeValue = 'normal'
      this.recoveryStreakMs = 0
    }
    return this.modeValue
  }

  /** Focus changes invalidate a continuous sampling streak, not the chosen budget. */
  resetSampling(): void {
    this.lowFpsStreakMs = 0
    this.recoveryStreakMs = 0
  }

  snapshot(): PerformanceGovernorSnapshot {
    return {
      mode: this.modeValue,
      lowFpsStreakMs: this.lowFpsStreakMs,
      recoveryStreakMs: this.recoveryStreakMs,
    }
  }
}
