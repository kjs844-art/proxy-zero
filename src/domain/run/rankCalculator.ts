export type RunOutcome = 'mission-clear' | 'mission-failed' | 'debug-clear'

export type RunRank = 'S' | 'A' | 'B' | 'C' | 'D'

export interface RunRankInput {
  outcome: RunOutcome
  activeTimeMs: number
  score: number
  maxCombo: number
  hitsTaken: number
  continueUsed: boolean
}

const nonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const scorePoints = (score: number): number => {
  if (score >= 15_000) return 4
  if (score >= 12_000) return 3
  if (score >= 7_500) return 2
  return score > 0 ? 1 : 0
}

const timePoints = (activeTimeMs: number): number => {
  if (activeTimeMs <= 18 * 60_000) return 4
  if (activeTimeMs <= 20 * 60_000) return 3
  if (activeTimeMs <= 22 * 60_000) return 2
  if (activeTimeMs <= 24 * 60_000) return 1
  return 0
}

const comboPoints = (maxCombo: number): number => {
  if (maxCombo >= 10) return 3
  if (maxCombo >= 6) return 2
  if (maxCombo >= 3) return 1
  return 0
}

const hitsPoints = (hitsTaken: number): number => {
  if (hitsTaken <= 4) return 3
  if (hitsTaken <= 8) return 2
  if (hitsTaken <= 14) return 1
  return 0
}

const rankForTotal = (total: number): RunRank => {
  if (total >= 13) return 'S'
  if (total >= 10) return 'A'
  if (total >= 7) return 'B'
  if (total >= 4) return 'C'
  return 'D'
}

/** Calculates the Stage 1 rank from normalized, run-level result facts. */
export const calculateRunRank = (input: Readonly<RunRankInput>): RunRank => {
  if (input.outcome !== 'mission-clear') return 'D'

  const rank = rankForTotal(
    scorePoints(nonNegative(input.score)) +
      timePoints(nonNegative(input.activeTimeMs)) +
      comboPoints(nonNegative(input.maxCombo)) +
      hitsPoints(nonNegative(input.hitsTaken)),
  )

  if (input.continueUsed && (rank === 'S' || rank === 'A' || rank === 'B')) {
    return 'C'
  }
  return rank
}
