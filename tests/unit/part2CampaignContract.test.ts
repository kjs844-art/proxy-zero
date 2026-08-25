import { describe, expect, it } from 'vitest'
import {
  createWaveDirectorState,
  advanceWaveDirector,
  type WaveDirectorInput,
} from '../../src/domain/waves/waveDirector'
import {
  validateCampaignDefinition,
  validateCombatSlice,
  type CampaignDefinition,
  type CombatSliceDefinition,
} from '../../src/domain/campaign/campaignContract'
import {
  part2CampaignContract,
  part2FirstVerticalSlice,
} from '../../src/content/part2/part2Campaign'

const waveInput: WaveDirectorInput = {
  deltaMs: 0,
  activeEnemies: [],
  arena: { minX: 0, maxX: 640, minY: 180, maxY: 320 },
  playerPosition: { x: 120, y: 248 },
  playerSafeSeparation: { x: 72, y: 34 },
}

const replaceCampaign = (
  overrides: Partial<CampaignDefinition>,
): CampaignDefinition => ({ ...part2CampaignContract, ...overrides })

describe('Part 2-1 campaign contract', () => {
  it('freezes the thirty-minute, five-stage arcade campaign shape', () => {
    expect(() => validateCampaignDefinition(part2CampaignContract)).not.toThrow()
    expect(part2CampaignContract.arcadeRules).toEqual({
      entryFlow: ['character-select', 'combat'],
      startingLives: 2,
      storyCutscenes: false,
    })
    expect(part2CampaignContract.targetDurationMs).toBe(30 * 60 * 1_000)
    expect(part2CampaignContract.stages).toHaveLength(5)
    expect(part2CampaignContract.stages.map((stage) => stage.ordinal)).toEqual([1, 2, 3, 4, 5])
    expect(part2CampaignContract.stages.map((stage) => stage.capstone.kind)).toEqual([
      'boss',
      'boss-grade-elite',
      'boss',
      'boss-grade-elite',
      'boss',
    ])
    expect(part2CampaignContract.characterExpansion).toEqual({
      characterIds: ['han', 'mina', 'jin'],
      minimumUniqueTechniquesPerCharacter: 3,
      minimumAuthoredCombatAnimationsPerCharacter: 18,
    })
    expect(Object.isFrozen(part2CampaignContract)).toBe(true)
    expect(Object.isFrozen(part2CampaignContract.stages)).toBe(true)
    expect(Object.isFrozen(part2CampaignContract.stages[0])).toBe(true)
  })

  it('rejects campaign drift in stage, capstone, duration, and arcade invariants', () => {
    expect(() =>
      validateCampaignDefinition(replaceCampaign({ stages: part2CampaignContract.stages.slice(0, 4) })),
    ).toThrowError('Campaign requires exactly five full stages.')

    const allBosses = part2CampaignContract.stages.map((stage) => ({
      ...stage,
      capstone: { ...stage.capstone, kind: 'boss' as const },
    }))
    expect(() => validateCampaignDefinition(replaceCampaign({ stages: allBosses }))).toThrowError(
      'Campaign requires exactly three bosses and two boss-grade elites.',
    )

    expect(() =>
      validateCampaignDefinition(replaceCampaign({ targetDurationMs: 1_799_999 })),
    ).toThrowError('Campaign target duration must equal the sum of stage targets.')

    expect(() =>
      validateCampaignDefinition({
        ...part2CampaignContract,
        arcadeRules: { ...part2CampaignContract.arcadeRules, storyCutscenes: true },
      } as unknown as CampaignDefinition),
    ).toThrowError('Campaign story cutscenes must remain disabled.')
  })

  it('proves the first vertical slice enters combat immediately with deterministic authored content', () => {
    expect(() =>
      validateCombatSlice(part2FirstVerticalSlice, part2CampaignContract),
    ).not.toThrow()
    expect(part2FirstVerticalSlice.arcadeRules).toEqual(part2CampaignContract.arcadeRules)
    expect(part2FirstVerticalSlice.characterIds).toEqual(['han', 'mina', 'jin'])
    expect(part2FirstVerticalSlice.firstSpawnWithinMs).toBeLessThanOrEqual(4_000)

    const state = createWaveDirectorState(
      part2FirstVerticalSlice.openingWave,
      part2FirstVerticalSlice.openingWave.seed,
    )
    const result = advanceWaveDirector(state, waveInput)
    expect(result.events).toContainEqual({
      type: 'enemy-spawned',
      waveId: 'stage-two-relay-yard-opening',
      orderId: 'entry-striker',
      enemyId: 'stage-two-relay-yard-opening:entry-striker',
      enemyVariantId: 'scout-striker',
    })
    expect(Object.isFrozen(part2FirstVerticalSlice.openingWave.orders)).toBe(true)
  })

  it('rejects delayed, cinematic, or roster-incomplete slices before runtime integration', () => {
    expect(() =>
      validateCombatSlice(
        {
          ...part2FirstVerticalSlice,
          openingWave: {
            ...part2FirstVerticalSlice.openingWave,
            orders: part2FirstVerticalSlice.openingWave.orders.map((order) => ({
              ...order,
              delayMs: order.delayMs + 1,
            })),
          },
        },
        part2CampaignContract,
      ),
    ).toThrowError('Combat slice requires an enemy spawn at time zero.')

    expect(() =>
      validateCombatSlice(
        {
          ...part2FirstVerticalSlice,
          arcadeRules: { ...part2FirstVerticalSlice.arcadeRules, storyCutscenes: true },
        } as unknown as CombatSliceDefinition,
        part2CampaignContract,
      ),
    ).toThrowError('Combat slice story cutscenes must remain disabled.')

    expect(() =>
      validateCombatSlice(
        { ...part2FirstVerticalSlice, characterIds: ['han', 'mina'] },
        part2CampaignContract,
      ),
    ).toThrowError('Combat slice must support HAN, MINA, and JIN.')
  })
})
