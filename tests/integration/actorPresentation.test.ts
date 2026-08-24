import { describe, expect, it } from 'vitest'

import type { CombatActor } from '../../src/domain/combat/combatReducer'
import {
  selectActorFrame,
  type ActorPresentationSnapshot,
} from '../../src/content/animations'

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
  moveSpeed: 150,
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

const snapshot = (
  overrides: Partial<ActorPresentationSnapshot> = {},
): ActorPresentationSnapshot => ({
  profileId: 'han',
  actor: actor(),
  domainTimeMs: 0,
  telegraph: null,
  itemUse: null,
  ...overrides,
})

describe('Task 13 deterministic actor presentation', () => {
  it('selects idle, moving, airborne, attack, hit, down, get-up, and defeated frames', () => {
    expect(selectActorFrame(snapshot())).toContain('/idle/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'moving' }) }))).toContain('/walk/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'airborne' }) }))).toContain('/airborne/')
    expect(selectActorFrame(snapshot({ actor: actor({
      mode: 'attacking',
      activeAttack: {
        attackId: 'han-right-hand', elapsedMs: 120, phase: 'active', hitRecords: {},
      },
    }) }))).toContain('/attack/han-right-hand/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'hitstun' }) }))).toContain('/hitstun/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'knocked-down' }) }))).toContain('/knocked-down/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'getting-up' }) }))).toContain('/getting-up/')
    expect(selectActorFrame(snapshot({ actor: actor({ mode: 'defeated' }) }))).toContain('/defeated/')
  })

  it('prioritizes attack over telegraph, telegraph over item, and item over movement', () => {
    const moving = actor({ mode: 'moving' })
    expect(selectActorFrame(snapshot({
      profileId: 'scout-striker',
      actor: moving,
      telegraph: { attackId: 'scout-striker-jab', elapsedMs: 100 },
      itemUse: { startedAtMs: 0, durationMs: 400 },
      domainTimeMs: 100,
    }))).toContain('/telegraph/')

    expect(selectActorFrame(snapshot({
      actor: actor({
        mode: 'attacking',
        activeAttack: {
          attackId: 'han-right-hand', elapsedMs: 100, phase: 'active', hitRecords: {},
        },
      }),
      telegraph: { attackId: 'han-left-foot', elapsedMs: 100 },
    }))).toContain('/attack/han-right-hand/')

    expect(selectActorFrame(snapshot({
      actor: moving,
      itemUse: { startedAtMs: 0, durationMs: 400 },
      domainTimeMs: 100,
    }))).toContain('/pickup-use/')
  })

  it('is pure for repeated snapshots and freezes when domain time is frozen', () => {
    const fixed = snapshot({ actor: actor({ mode: 'moving' }), domainTimeMs: 250 })
    expect(selectActorFrame(fixed)).toBe(selectActorFrame(fixed))
    expect(selectActorFrame({ ...fixed, domainTimeMs: 250 })).toBe(selectActorFrame(fixed))
  })

  it('reverse-maps normal enemies and keeps elite and boss telegraphs authored', () => {
    const enemy = actor({
      id: 'enemy-1', team: 'enemies', mode: 'attacking',
      activeAttack: {
        attackId: 'han-right-hand', elapsedMs: 100, phase: 'active', hitRecords: {},
      },
    })
    expect(selectActorFrame(snapshot({ profileId: 'scout-striker', actor: enemy }))).toContain(
      '/attack/scout-striker-jab/',
    )
    expect(selectActorFrame(snapshot({
      profileId: 'elite-bulwark-frame', actor: actor({ id: 'elite', team: 'enemies' }),
      telegraph: { attackId: 'elite-lane-charge', elapsedMs: 300 },
    }))).toContain('/telegraph/elite-lane-charge/')
    expect(selectActorFrame(snapshot({
      profileId: 'boss-silo-dredger', actor: actor({ id: 'boss', team: 'enemies' }),
      telegraph: { attackId: 'boss-dredger-slam', elapsedMs: 300 },
    }))).toContain('/telegraph/boss-dredger-slam/')
  })
})
