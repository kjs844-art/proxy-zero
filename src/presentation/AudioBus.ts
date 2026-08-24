export const AUDIO_CUE_IDS = Object.freeze([
  'attack-light',
  'attack-heavy',
  'attack-finisher',
  'hit-light',
  'hit-heavy',
  'hit-finisher',
  'knockdown',
  'defeat',
  'pickup',
  'repair',
  'emp',
  'hazard-warning',
  'hazard-impact',
  'combat-loop',
] as const)

export type AudioCueId = (typeof AUDIO_CUE_IDS)[number]

export interface AudioPlayOptions {
  readonly loop?: boolean
  readonly volume?: number
}

export interface AudioBackend {
  play(key: string, options?: AudioPlayOptions): unknown
  pauseAll?(): unknown
  resumeAll?(): unknown
  stopByKey?(key: string): unknown
}

export type AudioDiagnostic = (operation: string, error: unknown) => void

const cueVolume: Readonly<Record<AudioCueId, number>> = Object.freeze({
  'attack-light': 0.32,
  'attack-heavy': 0.38,
  'attack-finisher': 0.45,
  'hit-light': 0.38,
  'hit-heavy': 0.46,
  'hit-finisher': 0.54,
  knockdown: 0.42,
  defeat: 0.48,
  pickup: 0.38,
  repair: 0.38,
  emp: 0.44,
  'hazard-warning': 0.38,
  'hazard-impact': 0.48,
  'combat-loop': 0.17,
})

/** Failure-isolating facade around Phaser's sound manager. */
export class AudioBus {
  private lastBatchId = -1
  private loopStarted = false
  private disposed = false

  constructor(
    private readonly backend: AudioBackend | null | undefined,
    private readonly diagnostic: AudioDiagnostic = () => undefined,
  ) {}

  consumeBatch(batchId: number, cues: readonly AudioCueId[]): boolean {
    if (this.disposed || !Number.isSafeInteger(batchId) || batchId <= this.lastBatchId) {
      return false
    }
    this.lastBatchId = batchId
    for (const cue of cues) this.play(cue)
    return true
  }

  startCombatLoop(): boolean {
    if (this.disposed || this.loopStarted) return false
    this.loopStarted = true
    this.play('combat-loop', { loop: true, volume: cueVolume['combat-loop'] })
    return true
  }

  pause(): boolean {
    return this.call('pause', () => this.backend?.pauseAll?.())
  }

  async resume(): Promise<boolean> {
    if (this.disposed || !this.backend?.resumeAll) return false
    try {
      await this.backend.resumeAll()
      return true
    } catch (error) {
      this.diagnostic('resume', error)
      return false
    }
  }

  /** Stop one-shot tails while preserving monotonic batch ownership and loop state. */
  resetTransient(): void {
    if (this.disposed) return
    for (const cue of AUDIO_CUE_IDS) {
      if (cue !== 'combat-loop') this.call(`stop:${cue}`, () => this.backend?.stopByKey?.(cue))
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.resetTransient()
    if (this.loopStarted) this.call('stop-loop', () => this.backend?.stopByKey?.('combat-loop'))
    this.loopStarted = false
    this.disposed = true
  }

  private play(cue: AudioCueId, options?: AudioPlayOptions): boolean {
    return this.call(`play:${cue}`, () => this.backend?.play(cue, options ?? {
      volume: cueVolume[cue],
    }))
  }

  private call(operation: string, callback: () => unknown): boolean {
    if (this.disposed || !this.backend) return false
    try {
      const result = callback()
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        Promise.resolve(result).catch((error) => this.diagnostic(operation, error))
      }
      return true
    } catch (error) {
      this.diagnostic(operation, error)
      return false
    }
  }
}
