import type { CombatSliceDefinition } from '../../domain/campaign/campaignContract'
import type {
  ArcadeContinueContract,
  CampaignRouteDefinition,
} from '../../domain/campaign/campaignProgression'
import { part2CampaignContract } from './part2Campaign'

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

/** Ordered stage-clear route. Each stage owns exactly one boss or boss-grade elite capstone. */
export const part2CampaignRoute: CampaignRouteDefinition = deepFreeze({
  entryStageId: 'stage-one',
  transitions: [
    { clearedStageId: 'stage-one', nextStageId: 'stage-two' },
    { clearedStageId: 'stage-two', nextStageId: 'stage-three' },
    { clearedStageId: 'stage-three', nextStageId: 'stage-four' },
    { clearedStageId: 'stage-four', nextStageId: 'stage-five' },
    { clearedStageId: 'stage-five', nextStageId: null },
  ],
})

export const part2ContinueContract: ArcadeContinueContract = deepFreeze({
  checkpointKind: 'stage-start',
  continueLimit: 1,
  restoredLives: 2,
  resumeFlow: 'combat',
  storyCutscenes: false,
})

/**
 * Part 2-2's next-stage fixture uses only existing normal-enemy IDs. New capstone runtime,
 * scene routing, art, and AI remain deliberately outside this slice.
 */
export const part2StageThreeVerticalSlice: CombatSliceDefinition = deepFreeze({
  id: 'part2-2-stage-three-opening',
  stageId: 'stage-three',
  arcadeRules: part2CampaignContract.arcadeRules,
  characterIds: ['han', 'mina', 'jin'],
  firstSpawnWithinMs: 1_000,
  openingWave: {
    id: 'stage-three-grid-spine-opening',
    seed: 0xa2b3c4d5,
    orders: [
      { id: 'entry-enforcer', enemyVariantId: 'bulwark-enforcer', delayMs: 0 },
      { id: 'lane-striker', enemyVariantId: 'scout-striker', delayMs: 650 },
      { id: 'rear-patrol', enemyVariantId: 'scout-patrol', delayMs: 1_300 },
    ],
  },
})
