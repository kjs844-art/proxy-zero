import {
  validateCampaignDefinition,
  type CampaignDefinition,
} from './campaignContract'

export interface CampaignStageTransition {
  readonly clearedStageId: string
  readonly nextStageId: string | null
}

export interface CampaignRouteDefinition {
  readonly entryStageId: string
  readonly transitions: readonly CampaignStageTransition[]
}

export interface CampaignReachabilityReport {
  readonly reachableStageIds: readonly string[]
  readonly reachableBossIds: readonly string[]
  readonly reachableBossGradeEliteIds: readonly string[]
}

export interface CampaignProgressionState {
  readonly currentStageId: string | null
  readonly clearedStageIds: readonly string[]
  readonly complete: boolean
}

export interface StageClearResult {
  readonly state: CampaignProgressionState
  readonly clearedStageId: string
  readonly nextStageId: string | null
}

export interface ArcadeContinueContract {
  readonly checkpointKind: 'stage-start'
  readonly continueLimit: 1
  readonly restoredLives: 2
  readonly resumeFlow: 'combat'
  readonly storyCutscenes: false
}

export interface CampaignStageCheckpoint {
  readonly schemaVersion: 1
  readonly stageId: string
  readonly stageStartWaveId: string
  readonly clearedStageIds: readonly string[]
}

export interface ContinueResumeResult {
  readonly progress: CampaignProgressionState
  readonly stageStartWaveId: string
  readonly lives: 2
  readonly flow: 'combat'
  readonly storyCutscenes: false
  readonly continuesRemaining: number
}

const nonEmpty = (value: string): boolean => value.trim().length > 0

const sameValuesInOrder = <Value>(left: readonly Value[], right: readonly Value[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

/**
 * Proves that the authored route is a single ordered chain through all five stage capstones.
 * This contract intentionally has no scene, asset, or runtime-AI dependency.
 */
export const validateCampaignRoute = (
  route: Readonly<CampaignRouteDefinition>,
  campaign: Readonly<CampaignDefinition>,
): CampaignReachabilityReport => {
  validateCampaignDefinition(campaign)
  const stageIds = campaign.stages.map((stage) => stage.id)

  if (route.entryStageId !== stageIds[0]) {
    throw new Error(`Campaign route must enter at "${stageIds[0]}".`)
  }
  if (route.transitions.length !== campaign.stages.length) {
    throw new Error('Campaign route requires exactly one transition per stage.')
  }

  const transitionsByStage = new Map<string, CampaignStageTransition>()
  for (const transition of route.transitions) {
    if (!nonEmpty(transition.clearedStageId) || transitionsByStage.has(transition.clearedStageId)) {
      throw new Error(
        `Campaign route transition IDs must be non-empty and unique: "${transition.clearedStageId}".`,
      )
    }
    transitionsByStage.set(transition.clearedStageId, transition)
  }

  campaign.stages.forEach((stage, index) => {
    const transition = transitionsByStage.get(stage.id)
    if (!transition) throw new Error(`Campaign route is missing stage "${stage.id}".`)
    const expectedNextStageId = campaign.stages[index + 1]?.id ?? null
    if (transition.nextStageId !== expectedNextStageId) {
      throw new Error(
        `Route transition after "${stage.id}" must target ${
          expectedNextStageId === null ? 'campaign completion' : `"${expectedNextStageId}"`
        }.`,
      )
    }
  })

  const reachableStageIds: string[] = []
  const visited = new Set<string>()
  let stageId: string | null = route.entryStageId
  while (stageId !== null) {
    if (visited.has(stageId)) throw new Error(`Campaign route contains a cycle at "${stageId}".`)
    const transition: CampaignStageTransition | undefined = transitionsByStage.get(stageId)
    if (!transition) throw new Error(`Campaign route cannot leave stage "${stageId}".`)
    visited.add(stageId)
    reachableStageIds.push(stageId)
    stageId = transition.nextStageId
  }

  if (!sameValuesInOrder(reachableStageIds, stageIds)) {
    throw new Error('Campaign route does not make every stage reachable in order.')
  }

  const reachableStages = reachableStageIds.map((reachableId) =>
    campaign.stages.find((stage) => stage.id === reachableId)!,
  )
  return {
    reachableStageIds,
    reachableBossIds: reachableStages
      .filter((stage) => stage.capstone.kind === 'boss')
      .map((stage) => stage.capstone.id),
    reachableBossGradeEliteIds: reachableStages
      .filter((stage) => stage.capstone.kind === 'boss-grade-elite')
      .map((stage) => stage.capstone.id),
  }
}

const validateProgressionState = (
  state: Readonly<CampaignProgressionState>,
  campaign: Readonly<CampaignDefinition>,
): void => {
  const stageIds = campaign.stages.map((stage) => stage.id)
  const expectedCleared = stageIds.slice(0, state.clearedStageIds.length)
  if (!sameValuesInOrder(state.clearedStageIds, expectedCleared)) {
    throw new Error('Campaign progress must clear stages in authored order.')
  }

  if (state.complete) {
    if (state.currentStageId !== null || state.clearedStageIds.length !== stageIds.length) {
      throw new Error('Completed campaign progress is inconsistent.')
    }
    return
  }

  const expectedCurrentStageId = stageIds[state.clearedStageIds.length]
  if (state.currentStageId !== expectedCurrentStageId) {
    throw new Error(`Campaign progress must continue at "${expectedCurrentStageId}".`)
  }
}

export const createCampaignProgression = (
  route: Readonly<CampaignRouteDefinition>,
  campaign: Readonly<CampaignDefinition>,
): CampaignProgressionState => {
  validateCampaignRoute(route, campaign)
  return { currentStageId: route.entryStageId, clearedStageIds: [], complete: false }
}

/** Applies one stage-clear event; callers cannot skip or replay an authored stage. */
export const clearCurrentStage = (
  state: Readonly<CampaignProgressionState>,
  route: Readonly<CampaignRouteDefinition>,
  campaign: Readonly<CampaignDefinition>,
): StageClearResult => {
  validateCampaignRoute(route, campaign)
  if (state.complete || state.currentStageId === null) {
    throw new Error('Completed campaign has no stage to clear.')
  }
  validateProgressionState(state, campaign)

  const transition = route.transitions.find(
    (entry) => entry.clearedStageId === state.currentStageId,
  )!
  const clearedStageIds = [...state.clearedStageIds, state.currentStageId]
  const complete = transition.nextStageId === null
  const nextState: CampaignProgressionState = {
    currentStageId: transition.nextStageId,
    clearedStageIds,
    complete,
  }
  validateProgressionState(nextState, campaign)

  return {
    state: nextState,
    clearedStageId: state.currentStageId,
    nextStageId: transition.nextStageId,
  }
}

export const createStageStartCheckpoint = (
  progress: Readonly<CampaignProgressionState>,
  stageStartWaveId: string,
  route: Readonly<CampaignRouteDefinition>,
  campaign: Readonly<CampaignDefinition>,
): CampaignStageCheckpoint => {
  validateCampaignRoute(route, campaign)
  validateProgressionState(progress, campaign)
  if (progress.complete || progress.currentStageId === null) {
    throw new Error('Completed campaign cannot create a stage-start checkpoint.')
  }
  if (!nonEmpty(stageStartWaveId)) {
    throw new Error('Stage-start checkpoint requires a wave ID.')
  }

  return {
    schemaVersion: 1,
    stageId: progress.currentStageId,
    stageStartWaveId,
    clearedStageIds: [...progress.clearedStageIds],
  }
}

const validateContinueContract = (contract: Readonly<ArcadeContinueContract>): void => {
  if (contract.checkpointKind !== 'stage-start') {
    throw new Error('Continue checkpoints must restore the stage start.')
  }
  if (contract.continueLimit !== 1) throw new Error('Campaign allows exactly one Continue.')
  if (contract.restoredLives !== 2) throw new Error('Continue must restore LIFE ×2.')
  if (contract.resumeFlow !== 'combat') throw new Error('Continue must resume directly in combat.')
  if (contract.storyCutscenes !== false) {
    throw new Error('Continue cannot insert a story cutscene.')
  }
}

const progressFromCheckpoint = (
  checkpoint: Readonly<CampaignStageCheckpoint>,
  campaign: Readonly<CampaignDefinition>,
): CampaignProgressionState => {
  if (checkpoint.schemaVersion !== 1) throw new Error('Unsupported campaign checkpoint schema.')
  if (!nonEmpty(checkpoint.stageStartWaveId)) {
    throw new Error('Campaign checkpoint requires a stage-start wave ID.')
  }
  const progress: CampaignProgressionState = {
    currentStageId: checkpoint.stageId,
    clearedStageIds: [...checkpoint.clearedStageIds],
    complete: false,
  }
  validateProgressionState(progress, campaign)
  return progress
}

/** Restores only campaign position; combat HP, enemies, phases, and timers are never checkpointed. */
export const resumeCampaignFromContinue = (
  checkpoint: Readonly<CampaignStageCheckpoint>,
  continuesRemaining: number,
  contract: Readonly<ArcadeContinueContract>,
  route: Readonly<CampaignRouteDefinition>,
  campaign: Readonly<CampaignDefinition>,
): ContinueResumeResult => {
  validateCampaignRoute(route, campaign)
  validateContinueContract(contract)
  if (!Number.isInteger(continuesRemaining) || continuesRemaining <= 0) {
    throw new Error('No continues remain.')
  }
  if (continuesRemaining > contract.continueLimit) {
    throw new Error('Continue count exceeds the campaign contract.')
  }
  const progress = progressFromCheckpoint(checkpoint, campaign)

  return {
    progress,
    stageStartWaveId: checkpoint.stageStartWaveId,
    lives: contract.restoredLives,
    flow: contract.resumeFlow,
    storyCutscenes: contract.storyCutscenes,
    continuesRemaining: continuesRemaining - 1,
  }
}
