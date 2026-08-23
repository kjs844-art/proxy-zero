import { describe, expect, it } from 'vitest'

import {
  combatReducer,
  type CombatActor,
  type CombatState,
} from '../../src/domain/combat/combatReducer'
import { fixedStepMs } from '../../src/domain/combat/tuning'

const makeActor = (overrides: Partial<CombatActor>): CombatActor => ({
  id: 'actor',
  team: 'heroes',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  facing: 1,
  body: { halfWidth: 12, halfDepth: 12, height: 48 },
  hp: 200,
  maxHp: 200,
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

describe('combat loop', () => {
  it('traces attack, hitstop, launch, knockdown, wake, and a later valid hit', () => {
    const attacker = makeActor({ id: 'jin', meter: 100 })
    const target = makeActor({
      id: 'enemy',
      team: 'enemies',
      position: { x: 50, y: 0, z: 0 },
      hp: 300,
      maxHp: 300,
    })
    let state: CombatState = {
      elapsedMs: 0,
      hitstopRemainingMs: 0,
      playerId: 'jin',
      actors: { jin: attacker, enemy: target },
      combo: { hitCount: 0, lastHitAtMs: null, lastAttackerId: null, lastTargetId: null },
      events: [],
    }

    state = combatReducer(
      state,
      [{ actorId: 'jin', moveX: 0, moveY: 0, attackId: 'jin-fault-line' }],
      260,
    )
    expect(state.actors.enemy.hp).toBe(269)
    expect(state.actors.enemy.pendingKnockdown).toBe(true)
    expect(state.hitstopRemainingMs).toBe(110)

    state = combatReducer(state, [], 110)
    expect(state.elapsedMs).toBe(260)

    const observedEvents: string[] = []
    for (let step = 0; step < 240 && state.actors.enemy.mode !== 'knocked-down'; step += 1) {
      state = combatReducer(state, [], fixedStepMs)
      observedEvents.push(...state.events.map((event) => event.type))
    }
    expect(state.actors.enemy.mode).toBe('knocked-down')
    expect(observedEvents).toContain('actor-knocked-down')
    expect(state.actors.enemy.knockdownRemainingMs).toBe(850)

    state = combatReducer(state, [], 850)
    expect(state.actors.enemy.mode).toBe('getting-up')
    expect(state.actors.enemy.wakeInvulnerabilityRemainingMs).toBe(450)
    state = combatReducer(state, [], 450)
    expect(state.actors.enemy.mode).toBe('idle')

    state.actors.enemy.position = { x: state.actors.jin.position.x + 40, y: 0, z: 0 }
    state = combatReducer(
      state,
      [{ actorId: 'jin', moveX: 0, moveY: 0, attackId: 'jin-right-hand' }],
      100,
    )
    expect(state.actors.enemy.hp).toBeLessThan(269)
    expect(state.events.some((event) => event.type === 'hit-confirmed')).toBe(true)
  })

  it('makes defeat terminal and emits it once', () => {
    const attacker = makeActor({ id: 'han', damageScale: 2 })
    const target = makeActor({
      id: 'enemy',
      team: 'enemies',
      position: { x: 35, y: 0, z: 0 },
      hp: 15,
      maxHp: 15,
    })
    let state: CombatState = {
      elapsedMs: 0,
      hitstopRemainingMs: 0,
      playerId: 'han',
      actors: { han: attacker, enemy: target },
      combo: { hitCount: 0, lastHitAtMs: null, lastAttackerId: null, lastTargetId: null },
      events: [],
    }

    state = combatReducer(
      state,
      [{ actorId: 'han', moveX: 0, moveY: 0, attackId: 'han-right-hand' }],
      100,
    )
    expect(state.actors.enemy.hp).toBe(0)
    expect(state.actors.enemy.mode).toBe('defeated')
    expect(state.events.filter((event) => event.type === 'actor-defeated')).toHaveLength(1)

    state = combatReducer(state, [], 45)
    state = combatReducer(state, [], 100)
    expect(state.actors.enemy.mode).toBe('defeated')
    expect(state.events.filter((event) => event.type === 'actor-defeated')).toHaveLength(0)
  })
})
