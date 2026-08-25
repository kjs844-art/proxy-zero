import type { WaveDefinition, WaveSpawnOrder } from '../enemies/types'

export type CampaignCharacterId = 'han' | 'mina' | 'jin'
export type CampaignStageOrdinal = 1 | 2 | 3 | 4 | 5
export type CampaignCapstoneKind = 'boss' | 'boss-grade-elite'

export interface ArcadeCampaignRules {
  readonly entryFlow: readonly ['character-select', 'combat']
  readonly startingLives: 2
  readonly storyCutscenes: false
}

export interface CampaignCapstoneDefinition {
  readonly id: string
  readonly kind: CampaignCapstoneKind
}

export interface CampaignStageDefinition {
  readonly id: string
  readonly ordinal: CampaignStageOrdinal
  readonly targetDurationMs: number
  readonly capstone: CampaignCapstoneDefinition
}

export interface CharacterExpansionContract {
  readonly characterIds: readonly CampaignCharacterId[]
  readonly minimumUniqueTechniquesPerCharacter: number
  readonly minimumAuthoredCombatAnimationsPerCharacter: number
}

export interface CampaignDefinition {
  readonly id: string
  readonly targetDurationMs: number
  readonly arcadeRules: ArcadeCampaignRules
  readonly stages: readonly CampaignStageDefinition[]
  readonly characterExpansion: CharacterExpansionContract
}

export interface CampaignWaveDefinition extends WaveDefinition {
  readonly seed: number
  readonly orders: readonly WaveSpawnOrder[]
}

export interface CombatSliceDefinition {
  readonly id: string
  readonly stageId: string
  readonly arcadeRules: ArcadeCampaignRules
  readonly characterIds: readonly CampaignCharacterId[]
  readonly firstSpawnWithinMs: number
  readonly openingWave: CampaignWaveDefinition
}

const EXPECTED_CHARACTERS: readonly CampaignCharacterId[] = ['han', 'mina', 'jin']

const nonEmpty = (value: string): boolean => value.trim().length > 0

const sameValuesInOrder = <Value>(left: readonly Value[], right: readonly Value[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const validateArcadeRules = (
  rules: Readonly<ArcadeCampaignRules>,
  scope: 'Campaign' | 'Combat slice',
): void => {
  if (!sameValuesInOrder(rules.entryFlow, ['character-select', 'combat'])) {
    throw new Error(`${scope} must enter combat directly after character select.`)
  }
  if (rules.startingLives !== 2) {
    throw new Error(`${scope} must start with LIFE ×2.`)
  }
  if (rules.storyCutscenes !== false) {
    throw new Error(`${scope} story cutscenes must remain disabled.`)
  }
}

/**
 * Guards the commercial campaign topology without coupling it to Phaser or Stage 1 runtime files.
 * Future content can be added behind this stable seam and rejected before scene integration.
 */
export const validateCampaignDefinition = (
  definition: Readonly<CampaignDefinition>,
): void => {
  if (!nonEmpty(definition.id)) throw new Error('Campaign ID must be non-empty.')
  if (definition.stages.length !== 5) {
    throw new Error('Campaign requires exactly five full stages.')
  }

  const stageIds = new Set<string>()
  const capstoneIds = new Set<string>()
  let durationMs = 0
  let bossCount = 0
  let eliteCount = 0

  definition.stages.forEach((stage, index) => {
    const expectedOrdinal = index + 1
    if (stage.ordinal !== expectedOrdinal) {
      throw new Error(`Campaign stage ${expectedOrdinal} must use ordinal ${expectedOrdinal}.`)
    }
    if (!nonEmpty(stage.id) || stageIds.has(stage.id)) {
      throw new Error(`Campaign stage IDs must be non-empty and unique: "${stage.id}".`)
    }
    if (!Number.isFinite(stage.targetDurationMs) || stage.targetDurationMs <= 0) {
      throw new Error(`Campaign stage "${stage.id}" requires a positive target duration.`)
    }
    if (!nonEmpty(stage.capstone.id) || capstoneIds.has(stage.capstone.id)) {
      throw new Error(`Campaign capstone IDs must be non-empty and unique: "${stage.capstone.id}".`)
    }

    stageIds.add(stage.id)
    capstoneIds.add(stage.capstone.id)
    durationMs += stage.targetDurationMs
    if (stage.capstone.kind === 'boss') bossCount += 1
    if (stage.capstone.kind === 'boss-grade-elite') eliteCount += 1
  })

  if (definition.targetDurationMs !== durationMs) {
    throw new Error('Campaign target duration must equal the sum of stage targets.')
  }
  if (bossCount !== 3 || eliteCount !== 2) {
    throw new Error('Campaign requires exactly three bosses and two boss-grade elites.')
  }

  validateArcadeRules(definition.arcadeRules, 'Campaign')

  if (!sameValuesInOrder(definition.characterExpansion.characterIds, EXPECTED_CHARACTERS)) {
    throw new Error('Campaign character expansion must cover HAN, MINA, and JIN.')
  }
  if (definition.characterExpansion.minimumUniqueTechniquesPerCharacter < 3) {
    throw new Error('Campaign must expand every character to at least three unique techniques.')
  }
  if (definition.characterExpansion.minimumAuthoredCombatAnimationsPerCharacter < 18) {
    throw new Error('Campaign must require at least eighteen authored combat animations per character.')
  }
}

/** Validates a runtime-neutral combat slice before existing scenes opt into it. */
export const validateCombatSlice = (
  slice: Readonly<CombatSliceDefinition>,
  campaign: Readonly<CampaignDefinition>,
): void => {
  validateCampaignDefinition(campaign)
  if (!nonEmpty(slice.id)) throw new Error('Combat slice ID must be non-empty.')
  if (!campaign.stages.some((stage) => stage.id === slice.stageId)) {
    throw new Error(`Combat slice references an unknown campaign stage: "${slice.stageId}".`)
  }

  validateArcadeRules(slice.arcadeRules, 'Combat slice')

  if (!sameValuesInOrder(slice.characterIds, EXPECTED_CHARACTERS)) {
    throw new Error('Combat slice must support HAN, MINA, and JIN.')
  }
  if (
    !Number.isFinite(slice.firstSpawnWithinMs) ||
    slice.firstSpawnWithinMs < 0 ||
    slice.firstSpawnWithinMs > 4_000
  ) {
    throw new Error('Combat slice first spawn must be ready within four seconds.')
  }
  if (!nonEmpty(slice.openingWave.id) || slice.openingWave.orders.length === 0) {
    throw new Error('Combat slice requires a non-empty opening wave.')
  }

  const orderIds = new Set<string>()
  for (const order of slice.openingWave.orders) {
    if (!nonEmpty(order.id) || orderIds.has(order.id)) {
      throw new Error(`Combat slice spawn order IDs must be non-empty and unique: "${order.id}".`)
    }
    if (!nonEmpty(order.enemyVariantId)) {
      throw new Error(`Combat slice spawn order "${order.id}" requires an enemy variant.`)
    }
    if (!Number.isFinite(order.delayMs) || order.delayMs < 0) {
      throw new Error(`Combat slice spawn order "${order.id}" has an invalid delay.`)
    }
    orderIds.add(order.id)
  }

  if (!slice.openingWave.orders.some((order) => order.delayMs === 0)) {
    throw new Error('Combat slice requires an enemy spawn at time zero.')
  }
}
