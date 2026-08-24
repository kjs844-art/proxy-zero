import Phaser from 'phaser'

import {
  ACTOR_ATLAS_KEY,
  getActorVisualProfile,
  selectActorFrame,
  type ActorItemUseSnapshot,
  type ActorTelegraphSnapshot,
} from '../../content/animations'
import type { CombatActor } from '../../domain/combat/combatReducer'

export interface ActorViewPresentation {
  readonly domainTimeMs: number
  readonly telegraph: Readonly<ActorTelegraphSnapshot> | null
  readonly itemUse: Readonly<ActorItemUseSnapshot> | null
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

  constructor(
    scene: Phaser.Scene,
    actor: Readonly<CombatActor>,
    private readonly profileId: string,
  ) {
    const profile = getActorVisualProfile(profileId)
    this.shadow = scene.add.ellipse(
      0,
      0,
      profile.shadow.width,
      profile.shadow.height,
      0x071018,
      0.58,
    )
    this.image = scene.add
      .image(0, 0, ACTOR_ATLAS_KEY, profile.clips.idle.frames[0])
      .setOrigin(profile.anchor.x, profile.anchor.y)
    this.update(actor)
  }

  update(
    actor: Readonly<CombatActor>,
    presentation: Readonly<ActorViewPresentation> = defaultPresentation,
  ): void {
    const screenX = Math.round(actor.position.x)
    const screenY = Math.round(actor.position.y - actor.position.z)
    const depth = Math.round(actor.position.y)
    const frame = selectActorFrame({
      profileId: this.profileId,
      actor,
      domainTimeMs: presentation.domainTimeMs,
      telegraph: presentation.telegraph,
      itemUse: presentation.itemUse,
    })

    this.shadow
      .setPosition(screenX, Math.round(actor.position.y))
      .setDepth(depth - 1)
      .setVisible(actor.mode !== 'defeated')
    this.image
      .setFrame(frame)
      .setPosition(screenX, screenY)
      .setDepth(depth)
      .setFlipX(actor.facing === -1)
      .setAlpha(1)

    if (actor.mode === 'hitstun') {
      this.image.setTintFill(0xffffff)
    } else {
      this.image.clearTint()
    }
  }

  dispose(): void {
    this.shadow.destroy()
    this.image.destroy()
  }
}
