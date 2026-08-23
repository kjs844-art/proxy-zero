import { describe, expect, it } from 'vitest'
import {
  enemyBaseBodies,
  enemyVariants,
  getEnemyVariant,
} from '../../src/content/enemies'
import {
  createEnemyBrainState,
  stepEnemyBrain,
  type EnemyBrainSnapshot,
  type EnemyRandomSource,
} from '../../src/domain/enemies/enemyBrain'
import { SeededRandom } from '../../src/runtime/SeededRandom'

const playerPosition = { x: 0, y: 0 }

const snapshotFor = (
  state: ReturnType<typeof createEnemyBrainState>,
  variantId = 'scout-striker',
  deltaMs = 0,
): EnemyBrainSnapshot => ({
  enemyId: 'enemy-1',
  definition: getEnemyVariant(variantId),
  state,
  position: { x: 48, y: 0 },
  playerPosition,
  deltaMs,
})

const scriptedRandom = (...values: number[]): EnemyRandomSource => {
  let index = 0
  return {
    next: () => values[index++] ?? values.at(-1) ?? 0,
  }
}

describe('enemy content and deterministic brain', () => {
  it('defines exactly two reusable base bodies with data-driven variants', () => {
    expect(enemyBaseBodies.map((body) => body.id)).toEqual(['scout-frame', 'bulwark-frame'])
    expect(new Set(enemyVariants.map((variant) => variant.baseBodyId))).toEqual(
      new Set(enemyBaseBodies.map((body) => body.id)),
    )
    expect(enemyVariants.every((variant) => variant.attacks.length > 0)).toBe(true)

    const isolated = getEnemyVariant('scout-striker')
    const anotherRun = getEnemyVariant('scout-striker')
    expect(isolated).not.toBe(anotherRun)
    expect(isolated.attacks).not.toBe(anotherRun.attacks)
    expect(isolated.attacks[0].range).not.toBe(anotherRun.attacks[0].range)
  })

  it('uses equal seeded generators and equal snapshots for equal intent sequences', () => {
    const run = (seed: number) => {
      const random = new SeededRandom(seed)
      let state = createEnemyBrainState('chase')
      const intents: unknown[] = []

      for (const deltaMs of [0, 1, 200, 200, 1, 120, 300]) {
        const result = stepEnemyBrain(snapshotFor(state, 'scout-striker', deltaMs), random)
        intents.push(result.intents)
        state = result.state
      }

      return intents
    }

    expect(run(7_331)).toEqual(run(7_331))
  })

  it('telegraphs the authored X/Y range before the attack can hit', () => {
    const random = new SeededRandom(4)
    const initial = snapshotFor(createEnemyBrainState('chase'))
    const before = structuredClone(initial)

    const telegraph = stepEnemyBrain(initial, random)
    const selectedAttack = getEnemyVariant('scout-striker').attacks.find(
      (attack) => attack.id === telegraph.state.attackId,
    )!
    expect(telegraph.state.mode).toBe('telegraph')
    expect(telegraph.intents).toEqual([
      expect.objectContaining({
        type: 'telegraph',
        range: selectedAttack.range,
      }),
    ])
    expect(initial).toEqual(before)

    const stillTelegraphing = stepEnemyBrain(
      snapshotFor(telegraph.state, 'scout-striker', 1),
      random,
    )
    expect(stillTelegraphing.state.mode).toBe('telegraph')
    expect(stillTelegraphing.intents.some((intent) => intent.type === 'attack')).toBe(false)

    const attack = stepEnemyBrain(
      snapshotFor(
        stillTelegraphing.state,
        'scout-striker',
        selectedAttack.telegraphMs - 1,
      ),
      random,
    )
    expect(attack.state.mode).toBe('attack')
    expect(attack.state.elapsedMs).toBe(0)
    expect(attack.intents).toEqual([
      expect.objectContaining({
        type: 'attack',
        range: selectedAttack.range,
      }),
    ])

    const active = stepEnemyBrain(
      snapshotFor(attack.state, 'scout-striker', selectedAttack.activeMs - 1),
      random,
    )
    expect(active.state).toMatchObject({
      mode: 'attack',
      attackId: selectedAttack.id,
      elapsedMs: selectedAttack.activeMs - 1,
    })
    expect(active.intents).toEqual([expect.objectContaining({ type: 'attack' })])

    const recovered = stepEnemyBrain(snapshotFor(active.state, 'scout-striker', 1), random)
    expect(recovered.state).toEqual({
      mode: 'recover',
      attackId: selectedAttack.id,
      elapsedMs: 0,
    })
    expect(recovered.intents).toEqual([])
  })

  it('carries telegraph, attack, and recovery overshoot identically across frame slicing', () => {
    const attack = getEnemyVariant('scout-striker').attacks[0]
    const initial = {
      mode: 'telegraph' as const,
      attackId: attack.id,
      elapsedMs: 0,
    }
    const totalMs = attack.telegraphMs + attack.activeMs + 50

    const oneFrame = stepEnemyBrain(snapshotFor(initial, 'scout-striker', totalMs), scriptedRandom())
    const telegraphBoundary = stepEnemyBrain(
      snapshotFor(initial, 'scout-striker', attack.telegraphMs),
      scriptedRandom(),
    )
    const attackBoundary = stepEnemyBrain(
      snapshotFor(telegraphBoundary.state, 'scout-striker', attack.activeMs),
      scriptedRandom(),
    )
    const splitFrames = stepEnemyBrain(
      snapshotFor(attackBoundary.state, 'scout-striker', 50),
      scriptedRandom(),
    )

    expect(telegraphBoundary.state).toEqual({
      mode: 'attack',
      attackId: attack.id,
      elapsedMs: 0,
    })
    expect(attackBoundary.state).toEqual({
      mode: 'recover',
      attackId: attack.id,
      elapsedMs: 0,
    })
    expect(oneFrame.state).toEqual({
      mode: 'recover',
      attackId: attack.id,
      elapsedMs: 50,
    })
    expect(splitFrames.state).toEqual(oneFrame.state)

    const recoveryBoundary = stepEnemyBrain(
      snapshotFor(splitFrames.state, 'scout-striker', attack.recoveryMs - 50),
      scriptedRandom(),
    )
    const splitRecoveryOvershoot = stepEnemyBrain(
      snapshotFor(recoveryBoundary.state, 'scout-striker', 1),
      scriptedRandom(0),
    )
    const oneFrameRecoveryOvershoot = stepEnemyBrain(
      snapshotFor(oneFrame.state, 'scout-striker', attack.recoveryMs - 49),
      scriptedRandom(0),
    )
    expect(recoveryBoundary.state).toEqual({ mode: 'chase', attackId: null, elapsedMs: 0 })
    expect(oneFrameRecoveryOvershoot.state).toEqual({
      mode: 'telegraph',
      attackId: attack.id,
      elapsedMs: 1,
    })
    expect(splitRecoveryOvershoot.state).toEqual(oneFrameRecoveryOvershoot.state)
  })

  it('forces guard, preserves its exact boundary, and carries guard overshoot into chase timing', () => {
    const guarded = stepEnemyBrain(
      snapshotFor(createEnemyBrainState('chase'), 'bulwark-sentinel'),
      scriptedRandom(0, 0.99, 0),
    )
    const guardDurationMs = getEnemyVariant('bulwark-sentinel').guardDurationMs
    expect(guarded).toEqual({
      state: { mode: 'guard', attackId: null, elapsedMs: 0 },
      intents: [{ type: 'guard', durationMs: guardDurationMs }],
    })

    const beforeBoundary = stepEnemyBrain(
      snapshotFor(guarded.state, 'bulwark-sentinel', guardDurationMs - 1),
      scriptedRandom(),
    )
    expect(beforeBoundary.state).toEqual({
      mode: 'guard',
      attackId: null,
      elapsedMs: guardDurationMs - 1,
    })

    const exactBoundary = stepEnemyBrain(
      snapshotFor(beforeBoundary.state, 'bulwark-sentinel', 1),
      scriptedRandom(0.99, 0),
    )
    expect(exactBoundary.state).toEqual({ mode: 'chase', attackId: null, elapsedMs: 0 })

    const splitOvershoot = stepEnemyBrain(
      snapshotFor(exactBoundary.state, 'bulwark-sentinel', 1),
      scriptedRandom(0.99, 0),
    )
    const oneFrameOvershoot = stepEnemyBrain(
      snapshotFor(guarded.state, 'bulwark-sentinel', guardDurationMs + 1),
      scriptedRandom(0.99, 0),
    )
    const attackId = getEnemyVariant('bulwark-sentinel').attacks[0].id
    expect(oneFrameOvershoot.state).toEqual({ mode: 'telegraph', attackId, elapsedMs: 1 })
    expect(splitOvershoot.state).toEqual(oneFrameOvershoot.state)
  })

  it('supports the down state without mutating the caller state', () => {
    const down = createEnemyBrainState('down')
    const result = stepEnemyBrain(snapshotFor(down, 'bulwark-sentinel', 1_000), new SeededRandom(1))
    expect(result).toEqual({ state: down, intents: [] })
  })

  it('serializes and restores seeded random state independently of the original generator', () => {
    const source = new SeededRandom(99)
    source.next()
    const saved = JSON.parse(JSON.stringify(source.snapshot()))
    const expected = source.next()
    const restored = new SeededRandom(0)
    restored.restore(saved)

    expect(restored.next()).toBe(expected)
  })
})
