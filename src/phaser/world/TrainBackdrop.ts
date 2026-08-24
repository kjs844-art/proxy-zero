import Phaser from 'phaser'

import type { ItemPickupSnapshot } from '../../domain/items/itemReducer'
import type { TrainHazardPhase } from '../../domain/world/trainHazard'

export interface TrainBackdropSnapshot {
  readonly offset: number
  readonly ownedObjectCount: number
  readonly platformCenterX: number
  readonly visiblePickupCount: number
  readonly warningVisible: boolean
}

/** Presentation-only service-train projection. Gameplay decisions stay in pure domains. */
export class TrainBackdrop {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly warningStrips: Phaser.GameObjects.Rectangle[] = []
  private readonly pickupObjects = new Map<string, Phaser.GameObjects.Ellipse>()
  private readonly parallax: Phaser.GameObjects.Graphics
  private readonly platform: Phaser.GameObjects.Rectangle
  private offset = 0
  private platformCenterX = 278
  private warningVisible = false

  constructor(scene: Phaser.Scene, pickups: readonly Readonly<ItemPickupSnapshot>[]) {
    this.own(scene.add.rectangle(320, 180, 640, 360, 0x060913)).setDepth(-400)
    this.parallax = this.own(scene.add.graphics()).setDepth(-390)
    this.parallax.fillStyle(0x111827, 1)
    this.parallax.fillRect(-80, 70, 800, 122)
    this.parallax.fillStyle(0x263244, 1)
    for (let x = -70; x < 710; x += 96) this.parallax.fillRect(x, 88, 62, 92)

    this.own(scene.add.rectangle(320, 254, 544, 132, 0x172033))
      .setDepth(-300)
      .setStrokeStyle(2, 0x64748b, 0.8)
    this.own(scene.add.rectangle(320, 286, 148, 68, 0x020617, 0.9))
      .setDepth(-260)
      .setStrokeStyle(2, 0xfacc15, 0.45)

    for (let x = 252; x <= 388; x += 24) {
      const strip = this.own(scene.add.rectangle(x, 254, 12, 6, 0xfacc15, 0.35))
        .setDepth(-210)
      this.warningStrips.push(strip)
    }
    this.platform = this.own(scene.add.rectangle(278, 286, 112, 14, 0x22d3ee, 0.75))
      .setDepth(-180)
      .setStrokeStyle(2, 0xa5f3fc, 1)

    for (const pickup of pickups) {
      const color = pickup.itemId === 'repair-kit' ? 0x4ade80 : 0x60a5fa
      const object = this.own(
        scene.add.ellipse(pickup.position.x, pickup.position.y - 8, 18, 18, color, 0.9),
      )
        .setDepth(pickup.position.y + 2)
        .setStrokeStyle(2, 0xf8fafc, 0.9)
      this.pickupObjects.set(pickup.id, object)
    }
    this.applyMotion('safe', pickups)
  }

  update(
    activeDeltaMs: number,
    phase: TrainHazardPhase,
    platformCenterX: number,
    pickups: readonly Readonly<ItemPickupSnapshot>[],
  ): void {
    const elapsed = Number.isFinite(activeDeltaMs) ? Math.max(0, activeDeltaMs) : 0
    this.offset = (this.offset + elapsed * 0.07) % 96
    this.platformCenterX = platformCenterX
    this.applyMotion(phase, pickups)
  }

  reset(pickups: readonly Readonly<ItemPickupSnapshot>[]): void {
    this.offset = 0
    this.platformCenterX = 278
    this.applyMotion('safe', pickups)
  }

  snapshot(): TrainBackdropSnapshot {
    let visiblePickupCount = 0
    for (const pickup of this.pickupObjects.values()) {
      if (pickup.visible) visiblePickupCount += 1
    }
    return {
      offset: this.offset,
      ownedObjectCount: this.owned.size,
      platformCenterX: this.platformCenterX,
      visiblePickupCount,
      warningVisible: this.warningVisible,
    }
  }

  dispose(): void {
    for (const object of this.owned) object.destroy()
    this.owned.clear()
    this.warningStrips.length = 0
    this.pickupObjects.clear()
  }

  private own<Value extends Phaser.GameObjects.GameObject>(object: Value): Value {
    this.owned.add(object)
    return object
  }

  private applyMotion(
    phase: TrainHazardPhase,
    pickups: readonly Readonly<ItemPickupSnapshot>[],
  ): void {
    this.parallax.setPosition(-this.offset, 0)
    this.platform.setPosition(this.platformCenterX, 286)
    this.warningVisible = phase === 'warning' || phase === 'open'
    const alpha = phase === 'open' ? 1 : phase === 'warning' ? 0.75 : 0.22
    for (const strip of this.warningStrips) strip.setAlpha(alpha)
    for (const pickup of pickups) {
      this.pickupObjects.get(pickup.id)?.setVisible(!pickup.consumed)
    }
  }
}
