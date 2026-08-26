import Phaser from 'phaser'

import {
  ACTOR_ATLAS_KEY,
  getActorVisualProfile,
  selectActorFrame,
  type ActorItemUseSnapshot,
  type ActorTelegraphSnapshot,
} from '../../content/animations'
import type { CombatActor } from '../../domain/combat/combatReducer'

const POSITION_SMOOTHING_MS = 46
const TELEPORT_SNAP_DISTANCE = 180

/**
 * Keep the fighters readable while restoring the wider belt-scroll playfield
 * proportions requested for Stage 1. Boss silhouettes remain deliberately
 * larger than players and normal enemies.
 */
export const actorDisplayScale = (profileId: string): number => {
  if (profileId === 'boss-silo-dredger') return 0.92
  if (profileId === 'elite-bulwark-frame') return 0.89
  if (profileId === 'han' || profileId === 'mina' || profileId === 'jin') return 0.84
  return 0.86
}

const finiteDelta = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.max(0, value ?? 0) : 0

const halfPixel = (value: number): number => Math.round(value * 2) / 2

const lerp = (from: number, to: number, alpha: number): number =>
  from + (to - from) * alpha

export interface ActorViewPresentation {
  readonly domainTimeMs: number
  readonly telegraph: Readonly<ActorTelegraphSnapshot> | null
  readonly itemUse: Readonly<ActorItemUseSnapshot> | null
  /** Render-only delta. Omit it in deterministic projection tests to snap. */
  readonly renderDeltaMs?: number
  readonly snap?: boolean
}

const defaultPresentation: ActorViewPresentation = {
  domainTimeMs: 0,
  telegraph: null,
  itemUse: null,
}

/** Disposable projection of one actor; all frame truth comes from domain snapshots. */
export class ActorView {
  private readonly shadow: Phaser.GameObjects.Ellipse
  private readonly image: Phaser.GameObjects.Image
  private visualX: number | null = null
  private visualY: number | null = null
  private visualGroundY: number | null = null
  private lastDomainTimeMs = 0

  constructor(
    scene: Phaser.Scene,
    actor: Readonly<CombatActor>,
    private readonly profileId: string,
  ) {
    const profile = getActorVisualProfile(profileId)
    const displayScale = actorDisplayScale(profileId)
    this.shadow = scene.add.ellipse(
      0,
      0,
      profile.shadow.width,
      profile.shadow.height,
      0x071018,
      0.58,
    ).setScale(Math.max(0.82, displayScale))
    this.image = scene.add
      .image(0, 0, ACTOR_ATLAS_KEY, profile.clips.idle.frames[0])
      .setOrigin(profile.anchor.x, profile.anchor.y)
      .setScale(displayScale)
    this.update(actor)
  }

  update(
    actor: Readonly<CombatActor>,
    presentation: Readonly<ActorViewPresentation> = defaultPresentation,
  ): void {
    const targetX = actor.position.x
    const targetY = actor.position.y - actor.position.z
    const targetGroundY = actor.position.y
    const renderDeltaMs = finiteDelta(presentation.renderDeltaMs)
    const distance = this.visualX === null || this.visualY === null
      ? Number.POSITIVE_INFINITY
      : Math.hypot(targetX - this.visualX, targetY - this.visualY)
    const shouldSnap =
      presentation.snap === true ||
      presentation.renderDeltaMs === undefined ||
      presentation.domainTimeMs < this.lastDomainTimeMs ||
      distance >= TELEPORT_SNAP_DISTANCE ||
      this.visualGroundY === null
    const alpha = shouldSnap
      ? 1
      : 1 - Math.exp(-renderDeltaMs / POSITION_SMOOTHING_MS)

    this.visualX = this.visualX === null ? targetX : lerp(this.visualX, targetX, alpha)
    this.visualY = this.visualY === null ? targetY : lerp(this.visualY, targetY, alpha)
    this.visualGroundY = this.visualGroundY === null
      ? targetGroundY
      : lerp(this.visualGroundY, targetGroundY, alpha)
    this.lastDomainTimeMs = presentation.domainTimeMs

    // Half-logical-pixel alignment maps to whole pixels in the 2x render target.
    const worldX = halfPixel(this.visualX)
    const worldY = halfPixel(this.visualY)
    const groundY = halfPixel(this.visualGroundY)
    const depth = Math.round(actor.position.y)
    const frame = selectActorFrame({
      profileId: this.profileId,
      actor,
      domainTimeMs: presentation.domainTimeMs,
      telegraph: presentation.telegraph,
      itemUse: presentation.itemUse,
    })

    this.shadow
      .setPosition(worldX, groundY)
      .setDepth(depth - 1)
      .setVisible(actor.mode !== 'defeated')
    this.image
      .setFrame(frame)
      .setPosition(worldX, worldY)
      .setDepth(depth)
      .setFlipX(actor.facing === -1)
      .setAlpha(1)

    // Hit flashes are event-timed by CombatVfx; a state-wide tint would persist
    // for the complete hitstun window (up to ~480 ms) and wash out the sprite art.
    this.image.clearTint()
  }

  dispose(): void {
    this.shadow.destroy()
    this.image.destroy()
  }
}
