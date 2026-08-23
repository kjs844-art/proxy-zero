import Phaser from 'phaser'

import type { CombatActor } from '../../domain/combat/combatReducer'

export const GREYBOX_TEXTURES = {
  han: 'greybox-han',
  mina: 'greybox-mina',
  jin: 'greybox-jin',
  enemy: 'greybox-enemy',
} as const

/** Disposable geometric projection of one domain actor. */
export class ActorView {
  private readonly shadow: Phaser.GameObjects.Ellipse
  private readonly image: Phaser.GameObjects.Image

  constructor(
    scene: Phaser.Scene,
    actor: Readonly<CombatActor>,
    textureKey: string,
  ) {
    this.shadow = scene.add.ellipse(0, 0, actor.body.halfWidth * 2, 8, 0x071018, 0.55)
    this.image = scene.add.image(0, 0, textureKey).setOrigin(0.5, 1)
    this.update(actor)
  }

  update(actor: Readonly<CombatActor>): void {
    const screenY = actor.position.y - actor.position.z
    const depth = actor.position.y

    this.shadow
      .setPosition(actor.position.x, actor.position.y)
      .setDepth(depth - 1)
      .setVisible(actor.mode !== 'defeated')
    this.image
      .setPosition(actor.position.x, screenY)
      .setDepth(depth)
      .setFlipX(actor.facing === -1)
      .setAlpha(actor.mode === 'defeated' ? 0.25 : 1)

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
