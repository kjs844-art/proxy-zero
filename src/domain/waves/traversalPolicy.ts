import { isBossDefinitionId } from '../../content/bosses'
import { isEliteDefinitionId } from '../../content/elites'
import type { StageOneWaveDefinition } from '../../content/stage1'

export const NORMAL_WAVE_TRAVERSAL_GRACE_MS = 900

/** Mid-boss and boss encounters retain the classic locked arena rule. */
export const waveRequiresArenaClear = (
  wave: Readonly<StageOneWaveDefinition>,
): boolean => wave.orders.some((order) =>
  isEliteDefinitionId(order.enemyVariantId) || isBossDefinitionId(order.enemyVariantId),
)

export const normalWaveTraversalUnlockAtMs = (
  wave: Readonly<StageOneWaveDefinition>,
): number => Math.max(0, ...wave.orders.map((order) => order.delayMs)) +
  NORMAL_WAVE_TRAVERSAL_GRACE_MS

export interface NormalWaveTraversalSnapshot {
  readonly wave: Readonly<StageOneWaveDefinition>
  readonly elapsedMs: number
  readonly emittedOrderCount: number
}

/**
 * Normal street encounters become moving fights once every authored opponent
 * has entered. Defeating them remains rewarding, but it is no longer a hard
 * requirement for scrolling into the next section.
 */
export const shouldOpenNormalWaveTraversal = (
  snapshot: Readonly<NormalWaveTraversalSnapshot>,
): boolean => {
  if (waveRequiresArenaClear(snapshot.wave)) return false
  if (snapshot.emittedOrderCount < snapshot.wave.orders.length) return false
  const elapsedMs = Number.isFinite(snapshot.elapsedMs) ? Math.max(0, snapshot.elapsedMs) : 0
  return elapsedMs >= normalWaveTraversalUnlockAtMs(snapshot.wave)
}
