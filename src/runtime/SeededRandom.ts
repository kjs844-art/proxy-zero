export interface SeededRandomState {
  readonly value: number
}

const normalizeState = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0
  // Xorshift32 has a zero-value absorbing state, so map it to a fixed non-zero seed.
  return normalized === 0 ? 0x6d2b79f5 : normalized
}

/** Serializable xorshift32 generator for domain decisions. */
export class SeededRandom {
  private value: number

  constructor(seed: number) {
    this.value = normalizeState(seed)
  }

  next(): number {
    let value = this.value
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.value = value >>> 0
    return this.value / 0x1_0000_0000
  }

  snapshot(): SeededRandomState {
    return { value: this.value }
  }

  restore(state: Readonly<SeededRandomState>): void {
    this.value = normalizeState(state.value)
  }
}
