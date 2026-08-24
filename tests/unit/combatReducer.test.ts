import { describe, expect, it } from 'vitest'

import {
  combatReducer,
  type CombatActor,
  type CombatCommand,
  type CombatState,
} from '../../src/domain/combat/combatReducer'

const actor = (overrides: Partial<CombatActor> = {}): CombatActor => ({
  id: 'han',
  team: 'heroes',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  facing: 1,
  body: { halfWidth: 12, halfDepth: 12, height: 48 },
  hp: 100,
  maxHp: 100,
  meter: 0,
  damageScale: 1,
  attackSpeedScale: 1,
  moveSpeedScale: 1,
  moveSpeed: 180,
  jumpSpeed: 300,
  gravity: 900,
  mode: 'idle',
  activeAttack: null,
  hitstunRemainingMs: 0,
  knockdownRemainingMs: 0,
  wakeInvulnerabilityRemainingMs: 0,
  pendingKnockdown: false,
  reactionSource: null,
  ...overrides,
})

const state = (...actors: CombatActor[]): CombatState => ({
  elapsedMs: 0,
  hitstopRemainingMs: 0,
  playerId: actors[0]?.id ?? 'han',
  actors: Object.fromEntries(actors.map((entry) => [entry.id, entry])),
  combo: { hitCount: 0, lastHitAtMs: null, lastAttackerId: null, lastTargetId: null },
  events: [],
})

const attack = (actorId: string, attackId: string): CombatCommand => ({
  actorId,
  moveX: 0,
  moveY: 0,
  attackId,
})

describe('combatReducer', () => {
  it('lets each elite lane sweep hit the player at most once', () => {
    let current = state(
      actor({ id: 'elite', team: 'enemies', position: { x: 0, y: 0, z: 0 } }),
      actor({ id: 'han', position: { x: 150, y: 0, z: 0 } }),
    )
    current.playerId = 'han'
    current = combatReducer(current, [attack('elite', 'elite-lane-charge')], 0)
    expect(current.actors.han.hp).toBe(80)
    expect(current.actors.elite.activeAttack?.hitRecords.han?.count).toBe(1)

    current = combatReducer(current, [], 110)
    current = combatReducer(current, [], 1)
    expect(current.actors.han.hp).toBe(80)
    expect(current.actors.elite.activeAttack?.hitRecords.han?.count).toBe(1)
  })

  it('resolves a lane sweep that crosses its active interval in one large step', () => {
    const initial = state(
      actor({ id: 'elite', team: 'enemies', position: { x: 0, y: 0, z: 0 } }),
      actor({ id: 'han', position: { x: 150, y: 0, z: 0 } }),
    )
    initial.playerId = 'han'

    let current = combatReducer(initial, [attack('elite', 'elite-lane-charge')], 221)
    let split = combatReducer(initial, [attack('elite', 'elite-lane-charge')], 110)
    split = combatReducer(split, [], 111)

    expect(current.actors.han.hp).toBe(80)
    expect(current.actors.han.hp).toBe(split.actors.han.hp)
    expect(split.actors.elite.activeAttack?.hitRecords.han?.count).toBe(1)
    expect(current.actors.elite.activeAttack).toMatchObject({
      attackId: 'elite-lane-charge',
      phase: 'recovery',
      hitRecords: { han: { count: 1 } },
    })

    current = combatReducer(current, [], 110)
    current = combatReducer(current, [], 1)
    expect(current.actors.han.hp).toBe(80)
    expect(current.actors.elite.activeAttack?.hitRecords.han?.count).toBe(1)
  })

  it('applies one reducer-owned environmental impact atomically', () => {
    const falling = state(actor({
      hp: 30,
      mode: 'attacking',
      activeAttack: {
        attackId: 'han-right-hand', elapsedMs: 100, phase: 'active',
        hitRecords: { stale: { count: 1, lastHitAtMs: 0 } },
      },
      wakeInvulnerabilityRemainingMs: 500,
      reactionSource: { attackerId: 'stale', attackId: 'stale', strength: 3 },
    }))
    const impacted = combatReducer(falling, [{
      actorId: 'han', moveX: 1, moveY: 1,
      environmentalImpact: {
        damage: 18,
        recoveryPosition: { x: 576, y: 236, z: 0 },
        knockdownMs: 850,
      },
    }], 0)
    expect(impacted.actors.han).toMatchObject({
      hp: 12,
      position: { x: 576, y: 236, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      mode: 'knocked-down',
      activeAttack: null,
      knockdownRemainingMs: 850,
      wakeInvulnerabilityRemainingMs: 0,
      pendingKnockdown: false,
      reactionSource: null,
    })
    expect(impacted.events).toContainEqual({
      type: 'environmental-impact', atMs: 0, actorId: 'han', damage: 18,
    })
  })

  it('lets environmental damage own defeat and ignores invalid repeat impact', () => {
    const defeated = combatReducer(state(actor({ hp: 10 })), [{
      actorId: 'han', moveX: 0, moveY: 0,
      environmentalImpact: {
        damage: 18,
        recoveryPosition: { x: 300, y: 236, z: 0 },
        knockdownMs: 850,
      },
    }], 0)
    expect(defeated.actors.han).toMatchObject({ hp: 0, mode: 'defeated' })
    const ignored = combatReducer(defeated, [{
      actorId: 'han', moveX: 0, moveY: 0,
      environmentalImpact: {
        damage: Number.NaN,
        recoveryPosition: { x: Number.NaN, y: 0, z: 0 },
        knockdownMs: Number.POSITIVE_INFINITY,
      },
    }], 0)
    expect(ignored.actors.han).toEqual(defeated.actors.han)
  })
  it('moves on world X/Y, jumps on Z, and clamps a landing', () => {
    const initial = state(actor())
    const jumped = combatReducer(
      initial,
      [{ actorId: 'han', moveX: 1, moveY: -1, jump: true }],
      100,
    )

    expect(jumped.actors.han.position).toEqual({ x: 18, y: -18, z: 21 })
    expect(jumped.actors.han.velocity.z).toBe(210)
    expect(jumped.actors.han.mode).toBe('airborne')

    const landed = combatReducer(jumped, [], 1_000)
    expect(landed.actors.han.position.z).toBe(0)
    expect(landed.actors.han.velocity.z).toBe(0)
    expect(landed.actors.han.mode).toBe('idle')
  })

  it('tracks scaled startup, active, recovery, and completion', () => {
    const initial = state(actor({ attackSpeedScale: 2 }))
    const startup = combatReducer(initial, [attack('han', 'han-right-hand')], 49)
    expect(startup.actors.han.activeAttack?.phase).toBe('startup')

    const active = combatReducer(startup, [], 1)
    expect(active.actors.han.activeAttack?.phase).toBe('active')

    const recovery = combatReducer(active, [], 50.001)
    expect(recovery.actors.han.activeAttack?.phase).toBe('recovery')

    const complete = combatReducer(recovery, [], 150)
    expect(complete.actors.han.activeAttack).toBeNull()
    expect(complete.actors.han.mode).toBe('idle')
  })

  it('allows cancel from the scaled active-tail boundary but not earlier or in recovery', () => {
    const started = combatReducer(state(actor()), [attack('han', 'han-right-hand')], 0)
    const tooEarly = combatReducer(
      combatReducer(started, [], 164.999),
      [attack('han', 'han-left-hand')],
      0,
    )
    expect(tooEarly.actors.han.activeAttack?.attackId).toBe('han-right-hand')

    const atBoundary = combatReducer(
      combatReducer(started, [], 165),
      [attack('han', 'han-left-hand')],
      0,
    )
    expect(atBoundary.actors.han.activeAttack?.attackId).toBe('han-left-hand')

    const inRecovery = combatReducer(
      combatReducer(started, [], 200.001),
      [attack('han', 'han-left-hand')],
      0,
    )
    expect(inRecovery.actors.han.activeAttack?.attackId).toBe('han-right-hand')
    expect(inRecovery.actors.han.activeAttack?.phase).toBe('recovery')
  })

  it.each([
    ['han-right-hand', 45],
    ['han-cross-strike', 75],
    ['jin-fault-line', 110],
  ])('maps %s strength to exact hitstop', (attackId, expectedHitstop) => {
    const attackerId = attackId.startsWith('jin') ? 'jin' : 'han'
    const targetId = 'target'
    const initial = state(
      actor({ id: attackerId, meter: 100 }),
      actor({
        id: targetId,
        team: 'enemies',
        position: { x: 40, y: 0, z: 0 },
        hp: 500,
        maxHp: 500,
      }),
    )
    const startup = attackId === 'han-right-hand' ? 100 : attackId === 'han-cross-strike' ? 140 : 260
    const result = combatReducer(initial, [attack(attackerId, attackId)], startup)

    expect(result.hitstopRemainingMs).toBe(expectedHitstop)
    expect(result.events.some((event) => event.type === 'hit-confirmed')).toBe(true)
  })

  it('applies scaled damage, meter, hitstun, facing knockback, and emits stable events', () => {
    const initial = state(
      actor({ damageScale: 1.5, facing: -1 }),
      actor({ id: 'target', team: 'enemies', position: { x: -30, y: 0, z: 0 } }),
    )
    const result = combatReducer(initial, [attack('han', 'han-right-hand')], 100)

    expect(result.actors.target.hp).toBe(85)
    expect(result.actors.target.hitstunRemainingMs).toBe(180)
    expect(result.actors.target.velocity.x).toBe(-42)
    expect(result.actors.han.meter).toBe(10)
    expect(result.events.map((event) => event.type)).toEqual(['attack-started', 'hit-confirmed'])
  })

  it('freezes domain time and all combat timers during hitstop, then simulates leftover once', () => {
    const frozen = state(
      actor({
        activeAttack: {
          attackId: 'han-right-hand',
          elapsedMs: 120,
          phase: 'active',
          hitRecords: {},
        },
        wakeInvulnerabilityRemainingMs: 500,
        mode: 'attacking',
      }),
      actor({
        id: 'target',
        team: 'enemies',
        position: { x: 1_000, y: 0, z: 0 },
        mode: 'hitstun',
        hitstunRemainingMs: 100,
      }),
    )
    frozen.elapsedMs = 500
    frozen.hitstopRemainingMs = 45

    const stillFrozen = combatReducer(frozen, [], 30)
    expect(stillFrozen.elapsedMs).toBe(500)
    expect(stillFrozen.hitstopRemainingMs).toBe(15)
    expect(stillFrozen.actors.han.activeAttack?.elapsedMs).toBe(120)
    expect(stillFrozen.actors.target.hitstunRemainingMs).toBe(100)

    const resumed = combatReducer(stillFrozen, [], 25)
    expect(resumed.elapsedMs).toBe(510)
    expect(resumed.hitstopRemainingMs).toBe(0)
    expect(resumed.actors.han.activeAttack?.elapsedMs).toBe(130)
    expect(resumed.actors.target.hitstunRemainingMs).toBe(90)
  })

  it('enforces per-target count and hit interval for a multi-hit attack', () => {
    let current = state(
      actor({ meter: 100 }),
      actor({ id: 'target', team: 'enemies', position: { x: 42, y: 0, z: 0 }, hp: 500, maxHp: 500 }),
    )
    current = combatReducer(current, [attack('han', 'han-iron-tempest')], 260)
    expect(current.actors.target.hp).toBe(487)

    current = combatReducer(current, [], 110)
    current = combatReducer(current, [], 89)
    expect(current.actors.target.hp).toBe(487)
    current = combatReducer(current, [], 1)
    expect(current.actors.target.hp).toBe(474)

    for (let hit = 0; hit < 4; hit += 1) {
      current = combatReducer(current, [], 110)
      current = combatReducer(current, [], 90)
    }
    expect(current.actors.target.hp).toBe(448)
    expect(current.actors.han.activeAttack?.hitRecords.target.count).toBe(4)
  })

  it('uses exact knockdown and wake windows and blocks hits during wake invulnerability', () => {
    const knockedDown = state(
      actor({
        id: 'target',
        team: 'enemies',
        mode: 'knocked-down',
        knockdownRemainingMs: 850,
      }),
      actor({ id: 'han' }),
    )
    const beforeWake = combatReducer(knockedDown, [], 849)
    expect(beforeWake.actors.target.mode).toBe('knocked-down')
    const wake = combatReducer(beforeWake, [], 1)
    expect(wake.actors.target.mode).toBe('getting-up')
    expect(wake.actors.target.wakeInvulnerabilityRemainingMs).toBe(450)

    const attemptedHit = combatReducer(wake, [attack('han', 'han-right-hand')], 100)
    expect(attemptedHit.actors.target.hp).toBe(100)
    const vulnerable = combatReducer(attemptedHit, [], 350)
    expect(vulnerable.actors.target.mode).toBe('idle')
    expect(vulnerable.actors.target.wakeInvulnerabilityRemainingMs).toBe(0)
  })

  it('does not let an overlapping hit bypass an existing knockdown and wake lifecycle', () => {
    const knockedDown = state(
      actor({ id: 'han' }),
      actor({
        id: 'target',
        team: 'enemies',
        position: { x: 35, y: 0, z: 0 },
        mode: 'knocked-down',
        knockdownRemainingMs: 700,
      }),
    )

    const overlapDuringKnockdown = combatReducer(
      knockedDown,
      [attack('han', 'han-right-hand')],
      100,
    )
    expect(overlapDuringKnockdown.actors.target.hp).toBe(100)
    expect(overlapDuringKnockdown.actors.target.mode).toBe('knocked-down')
    expect(overlapDuringKnockdown.actors.target.knockdownRemainingMs).toBe(600)
    expect(overlapDuringKnockdown.events.some((event) => event.type === 'hit-confirmed')).toBe(
      false,
    )

    const wake = combatReducer(overlapDuringKnockdown, [], 600)
    expect(wake.actors.target.mode).toBe('getting-up')
    expect(wake.actors.target.wakeInvulnerabilityRemainingMs).toBe(450)
  })

  it('carries timer overflow across the exact knockdown and wake boundary', () => {
    const knockedDown = state(
      actor({ mode: 'knocked-down', knockdownRemainingMs: 850 }),
    )
    const oneMillisecondIntoWake = combatReducer(knockedDown, [], 851)
    expect(oneMillisecondIntoWake.actors.han.mode).toBe('getting-up')
    expect(oneMillisecondIntoWake.actors.han.wakeInvulnerabilityRemainingMs).toBe(449)

    const fullyRecovered = combatReducer(knockedDown, [], 1_300)
    expect(fullyRecovered.actors.han.mode).toBe('idle')
    expect(fullyRecovered.actors.han.wakeInvulnerabilityRemainingMs).toBe(0)
  })

  it('resolves targets in ID order and never mutates the caller state', () => {
    const initial = state(
      actor(),
      actor({ id: 'z-target', team: 'enemies', position: { x: 35, y: 0, z: 0 } }),
      actor({ id: 'a-target', team: 'enemies', position: { x: 35, y: 0, z: 0 } }),
    )
    const before = structuredClone(initial)
    const result = combatReducer(initial, [attack('han', 'han-right-hand')], 100)

    expect(
      result.events
        .filter((event) => event.type === 'hit-confirmed')
        .map((event) => event.targetId),
    ).toEqual(['a-target', 'z-target'])
    expect(initial).toEqual(before)
    expect(result).not.toBe(initial)
    expect(result.actors.han).not.toBe(initial.actors.han)
  })

  it('owns clamped item healing before full-hitstop early return', () => {
    const frozen = state(actor({ hp: 70 }))
    frozen.hitstopRemainingMs = 45

    const result = combatReducer(
      frozen,
      [{ actorId: 'han', moveX: 1, moveY: 0, healAmount: 45 }],
      16,
    )

    expect(result.actors.han.hp).toBe(100)
    expect(result.actors.han.position.x).toBe(0)
    expect(result.hitstopRemainingMs).toBe(29)
    expect(result.events).toContainEqual({
      type: 'actor-healed',
      atMs: 0,
      actorId: 'han',
      amount: 30,
    })
  })

  it('merges status commands and interrupts an active attack before hit resolution', () => {
    const attacking = state(
      actor({
        id: 'enemy',
        team: 'enemies',
        mode: 'attacking',
        activeAttack: {
          attackId: 'han-right-hand',
          elapsedMs: 100,
          phase: 'active',
          hitRecords: {},
        },
      }),
      actor({ id: 'target', position: { x: 30, y: 0, z: 0 } }),
    )

    const result = combatReducer(
      attacking,
      [
        { actorId: 'enemy', moveX: 1, moveY: 0, attackId: 'han-right-hand' },
        {
          actorId: 'enemy',
          moveX: 0,
          moveY: 0,
          interruptAttack: true,
          suppressActions: true,
          clearGuard: true,
        },
      ],
      16,
    )

    expect(result.actors.enemy.activeAttack).toBeNull()
    expect(result.actors.enemy.mode).toBe('idle')
    expect(result.actors.enemy.position.x).toBe(0)
    expect(result.actors.enemy.wakeInvulnerabilityRemainingMs).toBe(0)
    expect(result.actors.target.hp).toBe(100)
    expect(result.events).toContainEqual({
      type: 'actor-interrupted',
      atMs: 0,
      actorId: 'enemy',
    })
  })
})
