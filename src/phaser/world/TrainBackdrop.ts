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
  private readonly warningBeacons: Phaser.GameObjects.Ellipse[] = []
  private readonly pickupObjects = new Map<string, Phaser.GameObjects.Ellipse>()
  private readonly parallax: Phaser.GameObjects.Graphics
  private readonly platform: Phaser.GameObjects.Rectangle
  private offset = 0
  private platformCenterX = 278
  private warningVisible = false

  constructor(scene: Phaser.Scene, pickups: readonly Readonly<ItemPickupSnapshot>[]) {
    this.own(scene.add.rectangle(320, 180, 640, 360, 0x060913)).setDepth(-400)
    this.parallax = this.own(scene.add.graphics()).setDepth(-390)
    this.parallax.fillStyle(0x08111e, 1)
    this.parallax.fillRect(-128, 64, 896, 134)
    this.parallax.lineStyle(3, 0x31475e, 0.95)
    this.parallax.lineBetween(-128, 176, 768, 176)
    this.parallax.lineStyle(1, 0x71d8e8, 0.35)
    this.parallax.lineBetween(-128, 184, 768, 184)
    for (let carX = -168; carX < 800; carX += 224) {
      this.parallax.fillStyle(0x13253a, 1)
      this.parallax.fillRect(carX, 86, 198, 84)
      this.parallax.fillStyle(0x284761, 1)
      this.parallax.fillRect(carX + 8, 96, 182, 62)
      this.parallax.fillStyle(0x0b1726, 1)
      this.parallax.fillRect(carX + 88, 100, 32, 58)
      this.parallax.lineStyle(2, 0x6d8da1, 0.8)
      this.parallax.lineBetween(carX + 104, 102, carX + 104, 156)
      for (const windowOffset of [20, 54, 132, 164]) {
        this.parallax.fillStyle(0x67e8f9, 0.4)
        this.parallax.fillRect(carX + windowOffset, 108, 22, 19)
        this.parallax.fillStyle(0xa5f3fc, 0.9)
        this.parallax.fillRect(carX + windowOffset + 3, 111, 16, 5)
      }
      this.parallax.fillStyle(0x020617, 1)
      this.parallax.fillCircle(carX + 42, 172, 11)
      this.parallax.fillCircle(carX + 158, 172, 11)
      this.parallax.fillStyle(0x94a3b8, 0.8)
      this.parallax.fillCircle(carX + 42, 172, 4)
      this.parallax.fillCircle(carX + 158, 172, 4)
    }

    const railbed = this.own(scene.add.graphics()).setDepth(-340)
    railbed.fillStyle(0x0b1726, 0.96)
    railbed.fillRect(42, 238, 556, 72)
    railbed.lineStyle(3, 0x64748b, 0.9)
    railbed.lineBetween(48, 250, 592, 250)
    railbed.lineBetween(48, 302, 592, 302)
    railbed.lineStyle(2, 0x243447, 1)
    for (let x = 54; x < 592; x += 28) railbed.lineBetween(x, 244, x + 12, 308)

    this.own(scene.add.rectangle(320, 254, 544, 132, 0x172033))
      .setDepth(-300)
      .setStrokeStyle(1, 0x64748b, 0.22)
    this.own(scene.add.rectangle(320, 286, 148, 68, 0x020617, 0.9))
      .setDepth(-260)
      .setStrokeStyle(2, 0xfacc15, 0.45)

    for (let x = 252; x <= 388; x += 24) {
      const strip = this.own(scene.add.rectangle(x, 254, 12, 6, 0xfacc15, 0.35))
        .setDepth(-210)
      this.warningStrips.push(strip)
    }
    for (const x of [76, 564]) {
      const beacon = this.own(scene.add.ellipse(x, 202, 18, 18, 0xef4444, 0.12))
        .setDepth(-175)
        .setStrokeStyle(2, 0xfb7185, 0.82)
      this.warningBeacons.push(beacon)
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
    // The authored cars repeat every 224 px; wrapping on the same period keeps
    // the parallax seam continuous instead of jumping part-way through a car.
    this.offset = (this.offset + elapsed * 0.07) % 224
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
    this.warningBeacons.length = 0
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
    const beaconAlpha = phase === 'open'
      ? 0.8 + Math.sin(this.offset / 4) * 0.15
      : phase === 'warning'
        ? 0.52 + Math.sin(this.offset / 6) * 0.18
        : 0.14
    for (const beacon of this.warningBeacons) beacon.setAlpha(beaconAlpha)
    for (const pickup of pickups) {
      this.pickupObjects.get(pickup.id)?.setVisible(!pickup.consumed)
    }
  }
}
