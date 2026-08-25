import { describe, expect, it } from 'vitest'
import { getEnemyBaseBody, getEnemyVariant } from '../../src/content/enemies'
import {
  part2CampaignRoute,
  part2ContinueContract,
  part2StageThreeVerticalSlice,
} from '../../src/content/part2/part2Progression'
import { part2CampaignContract } from '../../src/content/part2/part2Campaign'
import { validateCombatSlice } from '../../src/domain/campaign/campaignContract'
import {
  clearCurrentStage,
  createCampaignProgression,
  createStageStartCheckpoint,
  resumeCampaignFromContinue,
  validateCampaignRoute,
  type CampaignRouteDefinition,
} from '../../src/domain/campaign/campaignProgression'
import {
  advanceWaveDirector,
  createZoneWaveRuntime,
  type EnemyContentResolver,
  type WaveDirectorInput,
} from '../../src/domain/waves/waveDirector'

const enemyContent: EnemyContentResolver = {
  getVariant: getEnemyVariant,
  getBaseBody: getEnemyBaseBody,
}

const waveInput: WaveDirectorInput = {
  deltaMs: 0,
  activeEnemies: [],
  arena: { minX: 0, maxX: 640, minY: 180, maxY: 320 },
  playerPosition: { x: 120, y: 248 },
  playerSafeSeparation: { x: 72, y: 34 },
}

describe('Part 2-2 campaign progression', () => {
  it('makes all five ordered stages and every capstone reachable', () => {
    const report = validateCampaignRoute(part2CampaignRoute, part2CampaignContract)

    expect(report.reachableStageIds).toEqual([
      'stage-one',
      'stage-two',
      'stage-three',
      'stage-four',
      'stage-five',
    ])
    expect(report.reachableBossIds).toEqual([
      'boss-silo-dredger',
      'stage-three-capstone',
      'stage-five-capstone',
    ])
    expect(report.reachableBossGradeEliteIds).toEqual([
      'stage-two-capstone',
      'stage-four-capstone',
    ])
  })

  it('advances only on stage clear and completes after Stage 5', () => {
    let state = createCampaignProgression(part2CampaignRoute, part2CampaignContract)
    expect(state).toEqual({
      currentStageId: 'stage-one',
      clearedStageIds: [],
      complete: false,
    })

    for (const [index, stage] of part2CampaignContract.stages.entries()) {
      const result = clearCurrentStage(state, part2CampaignRoute, part2CampaignContract)
      expect(result.clearedStageId).toBe(stage.id)
      expect(result.nextStageId).toBe(part2CampaignContract.stages[index + 1]?.id ?? null)
      state = result.state
    }

    expect(state).toEqual({
      currentStageId: null,
      clearedStageIds: ['stage-one', 'stage-two', 'stage-three', 'stage-four', 'stage-five'],
      complete: true,
    })
    expect(() =>
      clearCurrentStage(state, part2CampaignRoute, part2CampaignContract),
    ).toThrowError('Completed campaign has no stage to clear.')
  })

  it('rejects skipped stages before a boss or elite can become unreachable', () => {
    const skippedStageRoute: CampaignRouteDefinition = {
      ...part2CampaignRoute,
      transitions: part2CampaignRoute.transitions.map((transition) =>
        transition.clearedStageId === 'stage-two'
          ? { ...transition, nextStageId: 'stage-four' }
          : transition,
      ),
    }

    expect(() =>
      validateCampaignRoute(skippedStageRoute, part2CampaignContract),
    ).toThrowError('Route transition after "stage-two" must target "stage-three".')
  })

  it('restores a stage-start checkpoint directly into combat with LIFE ×2', () => {
    const stageOne = createCampaignProgression(part2CampaignRoute, part2CampaignContract)
    const stageTwo = clearCurrentStage(
      stageOne,
      part2CampaignRoute,
      part2CampaignContract,
    ).state
    const checkpoint = createStageStartCheckpoint(
      stageTwo,
      'stage-two-relay-yard-opening',
      part2CampaignRoute,
      part2CampaignContract,
    )

    expect(checkpoint).toEqual({
      schemaVersion: 1,
      stageId: 'stage-two',
      stageStartWaveId: 'stage-two-relay-yard-opening',
      clearedStageIds: ['stage-one'],
    })

    expect(
      resumeCampaignFromContinue(
        checkpoint,
        1,
        part2ContinueContract,
        part2CampaignRoute,
        part2CampaignContract,
      ),
    ).toEqual({
      progress: stageTwo,
      stageStartWaveId: 'stage-two-relay-yard-opening',
      lives: 2,
      flow: 'combat',
      storyCutscenes: false,
      continuesRemaining: 0,
    })

    expect(() =>
      resumeCampaignFromContinue(
        checkpoint,
        0,
        part2ContinueContract,
        part2CampaignRoute,
        part2CampaignContract,
      ),
    ).toThrowError('No continues remain.')
  })

  it('runs the next-stage fixture through existing enemy and wave contracts', () => {
    let progress = createCampaignProgression(part2CampaignRoute, part2CampaignContract)
    progress = clearCurrentStage(progress, part2CampaignRoute, part2CampaignContract).state
    progress = clearCurrentStage(progress, part2CampaignRoute, part2CampaignContract).state
    expect(progress.currentStageId).toBe(part2StageThreeVerticalSlice.stageId)

    expect(() =>
      validateCombatSlice(part2StageThreeVerticalSlice, part2CampaignContract),
    ).not.toThrow()

    const runtime = createZoneWaveRuntime(
      part2StageThreeVerticalSlice.openingWave,
      part2StageThreeVerticalSlice.openingWave.seed,
      enemyContent,
    )
    expect(Object.values(runtime.enemiesById).map((enemy) => enemy.enemyVariantId)).toEqual([
      'bulwark-enforcer',
      'scout-striker',
      'scout-patrol',
    ])
    expect(Object.values(runtime.enemiesById).every((enemy) => enemy.maxHp > 0)).toBe(true)

    const result = advanceWaveDirector(runtime.wave, waveInput)
    expect(result.events).toContainEqual({
      type: 'enemy-spawned',
      waveId: 'stage-three-grid-spine-opening',
      orderId: 'entry-enforcer',
      enemyId: 'stage-three-grid-spine-opening:entry-enforcer',
      enemyVariantId: 'bulwark-enforcer',
    })
  })
})
