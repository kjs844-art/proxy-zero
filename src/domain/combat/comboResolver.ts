import type { BufferedAction } from './inputBuffer'
import type { LimbInput } from './types'

export interface AcceptedAttackInput {
  limb: LimbInput
  enqueuedAtMs: number
}

export interface ComboRecipe {
  id: string
  inputs: readonly LimbInput[]
  attackId: string
  maxGapMs: number
  meterCost: number
  groundedOnly: boolean
  airborneOnly: boolean
  requiresFullMeter: boolean
}

/** The smallest character-content surface needed by the pure resolver. */
export interface ComboResolverProfile {
  normalAttackIds: Readonly<Record<LimbInput, string>>
  jumpAttackId: string
  techniqueRecipes: readonly ComboRecipe[]
  superRecipe: ComboRecipe
}

export interface ComboResolutionContext {
  airborne: boolean
  meter: number
}

export interface ResolvedAttack {
  attackId: string
  recipeId?: string
  meterCost: number
}

const completesRecipe = (
  inputs: readonly AcceptedAttackInput[],
  recipe: ComboRecipe,
): boolean => {
  if (recipe.inputs.length === 0 || recipe.inputs.length > inputs.length) return false

  const suffix = inputs.slice(inputs.length - recipe.inputs.length)
  for (let index = 0; index < suffix.length; index += 1) {
    if (suffix[index].limb !== recipe.inputs[index]) return false
    if (index > 0) {
      const gapMs = suffix[index].enqueuedAtMs - suffix[index - 1].enqueuedAtMs
      if (gapMs < 0 || gapMs > recipe.maxGapMs) return false
    }
  }
  return true
}

const isEligible = (
  recipe: ComboRecipe,
  context: ComboResolutionContext,
): boolean => {
  if (recipe.groundedOnly && context.airborne) return false
  if (recipe.airborneOnly && !context.airborne) return false
  if (recipe.requiresFullMeter && context.meter < recipe.meterCost) return false
  return true
}

/**
 * Resolves only recipes completed by this edge. A partial recipe never delays
 * the current normal/jump attack, so callers can start an attack immediately.
 */
export const resolveCombo = (
  currentAction: Readonly<BufferedAction>,
  acceptedHistory: readonly AcceptedAttackInput[],
  profile: ComboResolverProfile,
  context: ComboResolutionContext,
): ResolvedAttack | undefined => {
  if (currentAction.edge.type !== 'attack') return undefined

  const currentInput: AcceptedAttackInput = {
    limb: currentAction.edge.limb,
    enqueuedAtMs: currentAction.enqueuedAtMs,
  }
  const completedInputs = [...acceptedHistory, currentInput]
  const authoredRecipes = [...profile.techniqueRecipes, profile.superRecipe]
  let selected: ComboRecipe | undefined

  for (const recipe of authoredRecipes) {
    if (!isEligible(recipe, context) || !completesRecipe(completedInputs, recipe)) continue
    if (selected === undefined || recipe.inputs.length > selected.inputs.length) {
      selected = recipe
    }
  }

  if (selected !== undefined) {
    return {
      attackId: selected.attackId,
      recipeId: selected.id,
      meterCost: selected.meterCost,
    }
  }

  return {
    attackId: context.airborne
      ? profile.jumpAttackId
      : profile.normalAttackIds[currentAction.edge.limb],
    meterCost: 0,
  }
}
