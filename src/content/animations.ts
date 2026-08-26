import type { CombatActor } from '../domain/combat/combatReducer'

export const ACTOR_ATLAS_KEY = 'actors' as const
export const ACTOR_ANIMATION_FPS = 10
export const ACTOR_WALK_FPS = 9
export const ACTOR_RUN_FPS = 14

export const ACTOR_PROFILE_IDS = [
  'han',
  'mina',
  'jin',
  'scout-striker',
  'scout-patrol',
  'bulwark-sentinel',
  'bulwark-enforcer',
  'elite-bulwark-frame',
  'boss-silo-dredger',
] as const

export type ActorVisualProfileId = (typeof ACTOR_PROFILE_IDS)[number]
export type ActorSheetId = 'players' | 'enemies' | 'boss'
export type ActorBaseClipId =
  | 'idle'
  | 'walk'
  | 'run'
  | 'airborne'
  | 'hitstun'
  | 'knocked-down'
  | 'getting-up'
  | 'pickup-use'
  | 'item-use'
  | 'defeated'

export interface ActorAnimationClip {
  readonly id: string
  readonly state: ActorBaseClipId | 'attack' | 'telegraph'
  readonly loop: boolean
  readonly frames: readonly string[]
  readonly fps?: number
  readonly authoredAttackId?: string
  readonly domainAttackId?: string
}

export interface ActorVisualProfile {
  readonly id: ActorVisualProfileId
  readonly sheet: ActorSheetId
  readonly cell: { readonly width: number; readonly height: number }
  readonly targetHeight: number
  readonly anchor: { readonly x: 0.5; readonly y: 1 }
  readonly visibleBounds: { readonly left: number; readonly right: number }
  readonly shadow: { readonly width: number; readonly height: number }
  readonly clips: Readonly<Record<ActorBaseClipId, ActorAnimationClip>>
  readonly attacks: Readonly<Record<string, ActorAnimationClip>>
  readonly telegraphs: Readonly<Record<string, ActorAnimationClip>>
}

const frameNames = (
  profileId: ActorVisualProfileId,
  state: ActorAnimationClip['state'],
  id: string,
  count: number,
): readonly string[] => Array.from({ length: count }, (_, index) => {
  const clipPath = state === 'attack' || state === 'telegraph' ? `${state}/${id}` : id
  return `${profileId}/${clipPath}/${String(index).padStart(2, '0')}`
})

const baseClip = (
  profileId: ActorVisualProfileId,
  id: ActorBaseClipId,
  count: number,
  loop = false,
  fps?: number,
): ActorAnimationClip => ({
  id,
  state: id,
  loop,
  frames: frameNames(profileId, id, id, count),
  ...(fps === undefined ? {} : { fps }),
})

const attackClip = (
  profileId: ActorVisualProfileId,
  authoredAttackId: string,
  domainAttackId = authoredAttackId,
): ActorAnimationClip => ({
  id: authoredAttackId,
  state: 'attack',
  loop: false,
  frames: frameNames(profileId, 'attack', authoredAttackId, 3),
  authoredAttackId,
  domainAttackId,
})

const telegraphClip = (
  profileId: ActorVisualProfileId,
  authoredAttackId: string,
  domainAttackId = authoredAttackId,
): ActorAnimationClip => ({
  id: authoredAttackId,
  state: 'telegraph',
  loop: false,
  frames: frameNames(profileId, 'telegraph', authoredAttackId, 2),
  authoredAttackId,
  domainAttackId,
})

const playerAttacks: Readonly<Record<'han' | 'mina' | 'jin', readonly string[]>> = {
  han: [
    'han-right-hand', 'han-left-hand', 'han-right-foot', 'han-left-foot',
    'han-cross-strike', 'han-rising-kick', 'han-jump-kick', 'han-iron-tempest',
  ],
  mina: [
    'mina-right-hand', 'mina-left-hand', 'mina-right-foot', 'mina-left-foot',
    'mina-flash-step', 'mina-sky-needle', 'mina-jump-heel', 'mina-prism-rush',
  ],
  jin: [
    'jin-right-hand', 'jin-left-hand', 'jin-right-foot', 'jin-left-foot',
    'jin-anchor-blow', 'jin-fault-line', 'jin-jump-crush', 'jin-zero-breaker',
  ],
}

const enemyAttackPairs: Readonly<
  Partial<Record<ActorVisualProfileId, readonly (readonly [string, string])[]>>
> = {
  'scout-striker': [
    ['scout-striker-jab', 'han-right-hand'],
    ['scout-striker-sweep', 'han-left-foot'],
  ],
  'scout-patrol': [['scout-patrol-kick', 'han-right-foot']],
  'bulwark-sentinel': [['bulwark-sentinel-slam', 'jin-anchor-blow']],
  'bulwark-enforcer': [
    ['bulwark-enforcer-punch', 'han-left-hand'],
    ['bulwark-enforcer-charge', 'han-rising-kick'],
  ],
  'elite-bulwark-frame': [
    ['elite-rail-hammer', 'elite-rail-hammer'],
    ['elite-lane-charge', 'elite-lane-charge'],
  ],
  'boss-silo-dredger': [
    ['boss-dredger-slam', 'boss-dredger-slam'],
    ['boss-floodline-charge', 'boss-floodline-charge'],
  ],
}

const profileLayout: ReadonlyArray<{
  readonly id: ActorVisualProfileId
  readonly sheet: ActorSheetId
  readonly targetHeight: number
  readonly visibleBounds: { readonly left: number; readonly right: number }
}> = [
  { id: 'han', sheet: 'players', targetHeight: 120, visibleBounds: { left: 59, right: 59 } },
  { id: 'mina', sheet: 'players', targetHeight: 150, visibleBounds: { left: 69, right: 70 } },
  { id: 'jin', sheet: 'players', targetHeight: 124, visibleBounds: { left: 68, right: 67 } },
  { id: 'scout-striker', sheet: 'enemies', targetHeight: 126, visibleBounds: { left: 74, right: 73 } },
  { id: 'scout-patrol', sheet: 'enemies', targetHeight: 126, visibleBounds: { left: 75, right: 74 } },
  { id: 'bulwark-sentinel', sheet: 'enemies', targetHeight: 126, visibleBounds: { left: 76, right: 76 } },
  { id: 'bulwark-enforcer', sheet: 'enemies', targetHeight: 154, visibleBounds: { left: 107, right: 106 } },
  { id: 'elite-bulwark-frame', sheet: 'enemies', targetHeight: 168, visibleBounds: { left: 124, right: 124 } },
  { id: 'boss-silo-dredger', sheet: 'boss', targetHeight: 190, visibleBounds: { left: 171, right: 171 } },
]

const makeProfile = (
  layout: (typeof profileLayout)[number],
): ActorVisualProfile => {
  const { id, sheet, targetHeight, visibleBounds } = layout
  const player = id === 'han' || id === 'mina' || id === 'jin'
  const attackPairs = player
    ? playerAttacks[id].map((attackId) => [attackId, attackId] as const)
    : enemyAttackPairs[id] ?? []
  const attacks = Object.fromEntries(
    attackPairs.map(([authored, domain]) => [authored, attackClip(id, authored, domain)]),
  )
  const telegraphs = player
    ? {}
    : Object.fromEntries(
        attackPairs.map(([authored, domain]) => [authored, telegraphClip(id, authored, domain)]),
      )
  const boss = sheet === 'boss'
  const walk = baseClip(
    id,
    'walk',
    player ? 6 : 4,
    true,
    player ? ACTOR_WALK_FPS : undefined,
  )
  const run = player
    ? baseClip(id, 'run', 6, true, ACTOR_RUN_FPS)
    : walk
  return {
    id,
    sheet,
    cell: boss ? { width: 384, height: 384 } : { width: 256, height: 256 },
    targetHeight,
    anchor: { x: 0.5, y: 1 },
    visibleBounds,
    shadow: { width: boss ? 84 : sheet === 'enemies' ? 50 : 42, height: boss ? 14 : 10 },
    clips: {
      idle: baseClip(id, 'idle', 2, true),
      walk,
      run,
      airborne: baseClip(id, 'airborne', 1),
      hitstun: baseClip(id, 'hitstun', 1),
      'knocked-down': baseClip(id, 'knocked-down', 1),
      'getting-up': baseClip(id, 'getting-up', 2),
      'pickup-use': baseClip(id, 'pickup-use', player ? 4 : 2),
      'item-use': baseClip(id, 'item-use', 2),
      defeated: baseClip(id, 'defeated', 1),
    },
    attacks,
    telegraphs,
  }
}

const profiles = profileLayout.map(makeProfile)
const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

export const actorAnimationManifest = Object.freeze({
  schemaVersion: 1 as const,
  atlasKey: ACTOR_ATLAS_KEY,
  fps: ACTOR_ANIMATION_FPS,
  profiles,
})

export const isActorVisualProfileId = (value: string): value is ActorVisualProfileId =>
  profileById.has(value as ActorVisualProfileId)

/** Unknown renderer IDs fall back to HAN instead of producing a missing texture. */
export const getActorVisualProfile = (profileId: string): ActorVisualProfile =>
  profileById.get(profileId as ActorVisualProfileId) ?? profiles[0]

/** Stable profile-wide clamp: every authored frame remains visible without frame-to-frame jitter. */
export const clampActorPresentationX = (
  profileId: string,
  domainX: number,
  viewportWidth: number,
): number => {
  const profile = getActorVisualProfile(profileId)
  const extent = Math.max(profile.visibleBounds.left, profile.visibleBounds.right)
  const width = Number.isFinite(viewportWidth) ? Math.max(0, Math.round(viewportWidth)) : 0
  if (width <= extent * 2) return Math.round(width / 2)
  const x = Number.isFinite(domainX) ? Math.round(domainX) : Math.round(width / 2)
  return Math.max(extent, Math.min(width - extent, x))
}

export const resolveVisualAttackId = (profileId: string, domainAttackId: string): string => {
  const profile = getActorVisualProfile(profileId)
  const match = Object.values(profile.attacks).find(
    (entry) => entry.domainAttackId === domainAttackId,
  )
  return match?.authoredAttackId ?? domainAttackId
}

export interface ActorTelegraphSnapshot {
  readonly attackId: string
  readonly elapsedMs: number
}

export interface ActorItemUseSnapshot {
  readonly kind: 'pickup' | 'use'
  readonly startedAtMs: number
  readonly durationMs: number
}

export interface ActorPresentationSnapshot {
  readonly profileId: string
  readonly actor: Readonly<CombatActor>
  readonly domainTimeMs: number
  readonly telegraph: Readonly<ActorTelegraphSnapshot> | null
  readonly itemUse: Readonly<ActorItemUseSnapshot> | null
}

const frameAt = (clip: Readonly<ActorAnimationClip>, elapsedMs: number): string => {
  const safeElapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const fps = clip.fps ?? ACTOR_ANIMATION_FPS
  const rawIndex = Math.floor((safeElapsed * fps) / 1_000)
  const index = clip.loop
    ? rawIndex % clip.frames.length
    : Math.min(rawIndex, clip.frames.length - 1)
  return clip.frames[index] ?? clip.frames[0]
}

/** Pure domain-clock projection. It never reads Phaser's wall clock or animation manager. */
export const selectActorFrame = (snapshot: Readonly<ActorPresentationSnapshot>): string => {
  const profile = getActorVisualProfile(snapshot.profileId)
  const { actor } = snapshot
  let clip: ActorAnimationClip | undefined
  let elapsedMs = snapshot.domainTimeMs

  if (actor.mode === 'defeated' || actor.hp <= 0) {
    clip = profile.clips.defeated
  } else if (actor.mode === 'knocked-down') {
    clip = profile.clips['knocked-down']
  } else if (actor.mode === 'getting-up') {
    clip = profile.clips['getting-up']
  } else if (actor.mode === 'hitstun') {
    clip = profile.clips.hitstun
  } else if (actor.activeAttack) {
    const visualAttackId = resolveVisualAttackId(profile.id, actor.activeAttack.attackId)
    clip = profile.attacks[visualAttackId]
    elapsedMs = actor.activeAttack.elapsedMs
  } else if (snapshot.telegraph) {
    const visualAttackId = resolveVisualAttackId(profile.id, snapshot.telegraph.attackId)
    clip = profile.telegraphs[visualAttackId]
    elapsedMs = snapshot.telegraph.elapsedMs
  } else if (
    snapshot.itemUse &&
    snapshot.domainTimeMs >= snapshot.itemUse.startedAtMs &&
    snapshot.domainTimeMs - snapshot.itemUse.startedAtMs < snapshot.itemUse.durationMs
  ) {
    clip = snapshot.itemUse.kind === 'pickup'
      ? profile.clips['pickup-use']
      : profile.clips['item-use']
    elapsedMs = snapshot.domainTimeMs - snapshot.itemUse.startedAtMs
  } else if (actor.mode === 'airborne' || actor.position.z > 0) {
    clip = profile.clips.airborne
  } else if (
    actor.mode === 'moving' || actor.velocity.x !== 0 || actor.velocity.y !== 0
  ) {
    clip = actor.isRunning === true ? profile.clips.run : profile.clips.walk
    elapsedMs = actor.locomotionElapsedMs ?? snapshot.domainTimeMs
  } else {
    clip = profile.clips.idle
  }

  return frameAt(clip ?? profile.clips.idle, elapsedMs)
}
