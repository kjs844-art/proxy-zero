import type {
  CampaignDefinition,
  CombatSliceDefinition,
} from '../../domain/campaign/campaignContract'

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
    Object.freeze(value)
  }
  return value
}

/**
 * Part 2 topology only. Stages 2–5 remain contracts until their own scoped implementation parts.
 * Stage 1 runtime content is referenced conceptually and is not imported or modified here.
 */
export const part2CampaignContract: CampaignDefinition = deepFreeze({
  id: 'proxy-zero-commercial-campaign',
  targetDurationMs: 30 * 60 * 1_000,
  arcadeRules: {
    entryFlow: ['character-select', 'combat'],
    startingLives: 2,
    storyCutscenes: false,
  },
  characterExpansion: {
    characterIds: ['han', 'mina', 'jin'],
    minimumUniqueTechniquesPerCharacter: 3,
    minimumAuthoredCombatAnimationsPerCharacter: 18,
  },
  stages: [
    {
      id: 'stage-one',
      ordinal: 1,
      targetDurationMs: 10 * 60 * 1_000,
      capstone: { id: 'boss-silo-dredger', kind: 'boss' },
    },
    {
      id: 'stage-two',
      ordinal: 2,
      targetDurationMs: 5 * 60 * 1_000,
      capstone: { id: 'stage-two-capstone', kind: 'boss-grade-elite' },
    },
    {
      id: 'stage-three',
      ordinal: 3,
      targetDurationMs: 5 * 60 * 1_000,
      capstone: { id: 'stage-three-capstone', kind: 'boss' },
    },
    {
      id: 'stage-four',
      ordinal: 4,
      targetDurationMs: 5 * 60 * 1_000,
      capstone: { id: 'stage-four-capstone', kind: 'boss-grade-elite' },
    },
    {
      id: 'stage-five',
      ordinal: 5,
      targetDurationMs: 5 * 60 * 1_000,
      capstone: { id: 'stage-five-capstone', kind: 'boss' },
    },
  ],
})

/**
 * First verifiable slice: Stage 2's runtime-neutral opening encounter, authored only with
 * existing Stage 1 enemy IDs so it can execute through the proven wave director today.
 */
export const part2FirstVerticalSlice: CombatSliceDefinition = deepFreeze({
  id: 'part2-1-stage-two-opening',
  stageId: 'stage-two',
  arcadeRules: part2CampaignContract.arcadeRules,
  characterIds: ['han', 'mina', 'jin'],
  firstSpawnWithinMs: 1_000,
  openingWave: {
    id: 'stage-two-relay-yard-opening',
    seed: 0x91a2b3c4,
    orders: [
      { id: 'entry-striker', enemyVariantId: 'scout-striker', delayMs: 0 },
      { id: 'lane-sentinel', enemyVariantId: 'bulwark-sentinel', delayMs: 650 },
      { id: 'rear-patrol', enemyVariantId: 'scout-patrol', delayMs: 1_300 },
    ],
  },
})
