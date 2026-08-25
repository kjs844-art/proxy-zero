import Phaser from 'phaser'

import type { ItemPickupSnapshot } from '../../domain/items/itemReducer'
import type { TrainHazardPhase } from '../../domain/world/trainHazard'

export const SERVICE_TRAIN_BACKGROUND_KEY = 'service-train-background-v2' as const

export interface TrainBackdropSnapshot {
  readonly activeSectionIndex: number
  readonly offset: number
  readonly ownedObjectCount: number
  readonly platformCenterX: number
  readonly sectionCount: number
  readonly sectionLandmarkCount: number
  readonly visiblePickupCount: number
  readonly warningVisible: boolean
}

const DEFAULT_SECTION_COUNT = 1
const DEFAULT_SECTION_STRIDE = 640

const normalizedSectionCount = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_SECTION_COUNT
  return Math.max(DEFAULT_SECTION_COUNT, Math.floor(value))
}

const normalizedSectionStride = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : DEFAULT_SECTION_STRIDE

const normalizedSectionIndex = (value: number, sectionCount: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(sectionCount - 1, Math.max(0, Math.floor(value)))
}

/** Presentation-only service-train projection. Gameplay decisions stay in pure domains. */
export class TrainBackdrop {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly warningStrips: Phaser.GameObjects.Graphics[] = []
  private readonly warningBeacons: Phaser.GameObjects.Graphics[] = []
  private readonly sectionLandmarks: Phaser.GameObjects.Graphics[] = []
  private readonly pickupObjects = new Map<string, Phaser.GameObjects.Graphics>()
  private readonly parallax: Phaser.GameObjects.Graphics
  private readonly platform: Phaser.GameObjects.Graphics
  private readonly sectionCount: number
  private readonly sectionStride: number
  private offset = 0
  private platformCenterX = 278
  private activeSectionIndex = 0
  private warningVisible = false

  constructor(
    scene: Phaser.Scene,
    pickups: readonly Readonly<ItemPickupSnapshot>[],
    sectionCount = DEFAULT_SECTION_COUNT,
    sectionStride = DEFAULT_SECTION_STRIDE,
  ) {
    this.sectionCount = normalizedSectionCount(sectionCount)
    this.sectionStride = normalizedSectionStride(sectionStride)

    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      const sectionOffset = sectionIndex * this.sectionStride
      this.own(
        scene.add
          .image(320 + sectionOffset, 180, SERVICE_TRAIN_BACKGROUND_KEY)
          .setDisplaySize(640, 360),
      ).setDepth(-400)
      this.addSectionLandmark(scene, sectionIndex, sectionOffset)
    }

    // The authored car interior owns the room. This stays as a thin moving
    // reflection only, so it gives motion without painting over the art.
    this.parallax = this.own(scene.add.graphics()).setDepth(-390)
    this.parallax.lineStyle(1, 0x67e8f9, 0.12)
    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      const sectionOffset = sectionIndex * this.sectionStride
      for (let x = -160; x < 800; x += 224) {
        this.parallax.lineBetween(x + sectionOffset, 228, x + sectionOffset + 96, 228)
        this.parallax.lineBetween(x + sectionOffset + 34, 240, x + sectionOffset + 174, 240)
      }
    }

    const railbed = this.own(scene.add.graphics()).setDepth(-340)
    railbed.lineStyle(2, 0x64748b, 0.18)
    railbed.lineStyle(1, 0x243447, 0.24)
    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      const sectionOffset = sectionIndex * this.sectionStride
      railbed.lineBetween(48 + sectionOffset, 250, 592 + sectionOffset, 250)
      railbed.lineBetween(48 + sectionOffset, 302, 592 + sectionOffset, 302)
      for (let x = 54; x < 592; x += 28) {
        railbed.lineBetween(x + sectionOffset, 244, x + sectionOffset + 12, 308)
      }
    }

    // Keep a low-opacity lane wash: it improves fighter contrast but preserves
    // the authored floor reflections and panel detail beneath it.
    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      this.own(scene.add.rectangle(320 + sectionIndex * this.sectionStride, 254, 544, 132, 0x07131c, 0.1))
        .setDepth(-300)
        .setStrokeStyle(1, 0x64748b, 0.16)
    }
    // A recessed maintenance hatch marks the moving-platform danger lane. It
    // deliberately has the same footprint as the old outline, but reads as a
    // physical piece of train hardware instead of a debug rectangle.
    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      const maintenanceHatch = this.own(scene.add.graphics()).setDepth(-260)
      maintenanceHatch.setPosition(320 + sectionIndex * this.sectionStride, 286)
      maintenanceHatch.fillStyle(0x020617, 0.68)
      maintenanceHatch.fillRect(-74, -34, 148, 68)
      maintenanceHatch.lineStyle(2, 0x9a6b18, 0.72)
      maintenanceHatch.strokeRect(-74, -34, 148, 68)
      maintenanceHatch.lineStyle(1, 0xfacc15, 0.38)
      maintenanceHatch.strokeRect(-66, -26, 132, 52)
      maintenanceHatch.lineStyle(2, 0x5f450e, 0.75)
      for (let x = -58; x <= 48; x += 26) {
        maintenanceHatch.lineBetween(x, -22, x + 18, -4)
        maintenanceHatch.lineBetween(x, 22, x + 18, 4)
      }
      maintenanceHatch.lineStyle(1, 0x67e8f9, 0.26)
      maintenanceHatch.lineBetween(-54, 0, 54, 0)
    }

    for (let x = 252; x <= 388; x += 24) {
      const strip = this.own(scene.add.graphics()).setDepth(-210)
      strip.setPosition(x, 254)
      strip.fillStyle(0x4a3208, 0.88)
      strip.fillRect(-8, -4, 16, 8)
      strip.lineStyle(1, 0xfacc15, 0.95)
      strip.lineBetween(-6, 3, 1, -3)
      strip.lineBetween(0, 3, 7, -3)
      this.warningStrips.push(strip)
    }
    for (const x of [76, 564]) {
      const beacon = this.own(scene.add.graphics()).setDepth(-175)
      beacon.setPosition(x, 202)
      beacon.fillStyle(0x080d16, 0.94)
      beacon.fillRect(-8, -9, 16, 18)
      beacon.lineStyle(1, 0x9f1239, 0.8)
      beacon.strokeRect(-8, -9, 16, 18)
      beacon.fillStyle(0xef4444, 0.9)
      beacon.fillCircle(0, -3, 4)
      beacon.lineStyle(1, 0xfb7185, 0.72)
      beacon.lineBetween(-5, 5, 5, 5)
      this.warningBeacons.push(beacon)
    }
    this.platform = this.own(scene.add.graphics()).setDepth(-180)
    this.platform.fillStyle(0x071923, 0.95)
    this.platform.fillRect(-56, -7, 112, 14)
    this.platform.lineStyle(2, 0x67e8f9, 0.92)
    this.platform.strokeRect(-56, -7, 112, 14)
    this.platform.lineStyle(1, 0xa5f3fc, 0.86)
    this.platform.lineBetween(-48, -3, 48, -3)
    this.platform.lineStyle(2, 0x0e7490, 0.92)
    for (let x = -40; x <= 32; x += 24) this.platform.lineBetween(x, 3, x + 14, 3)
    this.platform.fillStyle(0x22d3ee, 0.7)
    this.platform.fillCircle(-46, 0, 2)
    this.platform.fillCircle(46, 0, 2)

    for (const pickup of pickups) {
      const object = this.own(scene.add.graphics())
        .setPosition(pickup.position.x, pickup.position.y - 8)
        .setDepth(pickup.position.y + 2)
      this.drawPickupProp(object, pickup.itemId)
      this.pickupObjects.set(pickup.id, object)
    }
    this.applyMotion('safe', pickups)
  }

  update(
    activeDeltaMs: number,
    phase: TrainHazardPhase,
    platformCenterX: number,
    pickups: readonly Readonly<ItemPickupSnapshot>[],
    activeSectionIndex = 0,
  ): void {
    const elapsed = Number.isFinite(activeDeltaMs) ? Math.max(0, activeDeltaMs) : 0
    // The authored cars repeat every 224 px; wrapping on the same period keeps
    // the parallax seam continuous instead of jumping part-way through a car.
    this.offset = (this.offset + elapsed * 0.07) % 224
    this.platformCenterX = Number.isFinite(platformCenterX) ? platformCenterX : 278
    this.activeSectionIndex = normalizedSectionIndex(activeSectionIndex, this.sectionCount)
    this.applyMotion(phase, pickups)
  }

  reset(pickups: readonly Readonly<ItemPickupSnapshot>[]): void {
    this.offset = 0
    this.platformCenterX = 278
    this.activeSectionIndex = 0
    this.applyMotion('safe', pickups)
  }

  snapshot(): TrainBackdropSnapshot {
    let visiblePickupCount = 0
    for (const pickup of this.pickupObjects.values()) {
      if (pickup.visible) visiblePickupCount += 1
    }
    return {
      activeSectionIndex: this.activeSectionIndex,
      offset: this.offset,
      ownedObjectCount: this.owned.size,
      platformCenterX: this.platformCenterX,
      sectionCount: this.sectionCount,
      sectionLandmarkCount: this.sectionLandmarks.length,
      visiblePickupCount,
      warningVisible: this.warningVisible,
    }
  }

  dispose(): void {
    for (const object of this.owned) object.destroy()
    this.owned.clear()
    this.warningStrips.length = 0
    this.warningBeacons.length = 0
    this.sectionLandmarks.length = 0
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
    const activeSectionOffset = this.activeSectionIndex * this.sectionStride
    this.platform.setPosition(this.platformCenterX + activeSectionOffset, 286)
    this.warningVisible = phase === 'warning' || phase === 'open'
    const alpha = phase === 'open' ? 1 : phase === 'warning' ? 0.75 : 0.22
    for (const [index, strip] of this.warningStrips.entries()) {
      strip.setPosition(252 + index * 24 + activeSectionOffset, 254)
      strip.setAlpha(alpha)
    }
    const beaconAlpha = phase === 'open'
      ? 0.8 + Math.sin(this.offset / 4) * 0.15
      : phase === 'warning'
        ? 0.52 + Math.sin(this.offset / 6) * 0.18
        : 0.14
    for (const [index, beacon] of this.warningBeacons.entries()) {
      beacon.setPosition((index === 0 ? 76 : 564) + activeSectionOffset, 202)
      beacon.setAlpha(beaconAlpha)
    }
    for (const pickup of pickups) {
      this.pickupObjects.get(pickup.id)?.setVisible(!pickup.consumed)
    }
  }

  /** Static car identities make the forward scroll feel like a journey. */
  private addSectionLandmark(scene: Phaser.Scene, sectionIndex: number, offsetX: number): void {
    const landmark = this.own(scene.add.graphics()).setDepth(-365)
    const variant = sectionIndex % 3

    if (variant === 0) {
      // Service loading car: layered timetable casing and a solid tool locker.
      landmark.fillStyle(0x475569, 0.92)
      landmark.fillRect(54 + offsetX, 72, 150, 52)
      landmark.fillStyle(0x111827, 0.98)
      landmark.fillRect(60 + offsetX, 78, 138, 40)
      landmark.fillStyle(0x5f450e, 0.92)
      landmark.fillRect(60 + offsetX, 78, 138, 6)
      landmark.fillStyle(0xfde68a, 0.8)
      for (const x of [72, 96, 120, 144, 168]) landmark.fillRect(x + offsetX, 96, 14, 3)
      landmark.fillStyle(0x334155, 0.96)
      landmark.fillRect(474 + offsetX, 126, 54, 88)
      landmark.fillStyle(0x0f172a, 0.94)
      landmark.fillRect(480 + offsetX, 132, 42, 76)
      landmark.fillStyle(0x64748b, 0.9)
      landmark.fillRect(498 + offsetX, 136, 6, 68)
      landmark.fillStyle(0xfacc15, 0.72)
      landmark.fillRect(486 + offsetX, 154, 8, 4)
      landmark.fillRect(510 + offsetX, 154, 8, 4)
      this.addPhysicalLabel(scene, 'SERVICE  01', 68 + offsetX, 84, '#fde68a')
    } else if (variant === 1) {
      // Medical transfer car: cool light, cross bar, and stacked sealed cases.
      landmark.fillStyle(0x22d3ee, 0.12)
      landmark.fillCircle(516 + offsetX, 102, 34)
      landmark.fillStyle(0xa5f3fc, 0.9)
      landmark.fillRect(505 + offsetX, 96, 22, 7)
      landmark.fillRect(512 + offsetX, 89, 8, 21)
      landmark.fillStyle(0x12364a, 0.94)
      landmark.fillRect(70 + offsetX, 138, 122, 66)
      landmark.fillStyle(0x0b2030, 0.96)
      landmark.fillRect(76 + offsetX, 144, 110, 54)
      landmark.fillStyle(0x60a5fa, 0.42)
      for (let x = 84; x < 176; x += 30) landmark.fillRect(x + offsetX, 150, 22, 7)
      landmark.fillStyle(0xa5f3fc, 0.64)
      for (let x = 86; x < 176; x += 30) landmark.fillRect(x + offsetX, 184, 6, 5)
      this.addPhysicalLabel(scene, 'MED  TRANSFER', 78 + offsetX, 124, '#a5f3fc')
    } else {
      // Restricted cargo car: red seal lamp and a dense containment hatch.
      landmark.fillStyle(0x7f1d1d, 0.16)
      landmark.fillCircle(104 + offsetX, 106, 30)
      landmark.fillStyle(0xfb7185, 0.95)
      landmark.fillCircle(104 + offsetX, 106, 5)
      landmark.fillStyle(0x431515, 0.94)
      landmark.fillRect(390 + offsetX, 90, 164, 124)
      landmark.fillStyle(0x160b10, 0.96)
      landmark.fillRect(398 + offsetX, 98, 148, 108)
      landmark.fillStyle(0x7f1d1d, 0.88)
      for (let x = 406; x <= 530; x += 30) landmark.fillRect(x + offsetX, 100, 10, 104)
      landmark.fillStyle(0xf97316, 0.68)
      for (let x = 410; x < 532; x += 24) landmark.fillRect(x + offsetX, 190, 14, 4)
      this.addPhysicalLabel(scene, 'RESTRICTED', 406 + offsetX, 78, '#fda4af')
    }

    this.sectionLandmarks.push(landmark)
  }

  private addPhysicalLabel(
    scene: Phaser.Scene,
    label: string,
    x: number,
    y: number,
    color: string,
  ): void {
    if (typeof scene.add.text !== 'function') return
    this.own(scene.add.text(x, y, label, {
      color,
      fontFamily: 'monospace',
      fontSize: '8px',
      stroke: '#020617',
      strokeThickness: 1,
    })).setDepth(-364).setAlpha(0.92)
  }

  private drawPickupProp(
    object: Phaser.GameObjects.Graphics,
    itemId: ItemPickupSnapshot['itemId'],
  ): void {
    const accent = itemId === 'repair-kit' ? 0x4ade80 : 0x60a5fa
    const darkAccent = itemId === 'repair-kit' ? 0x166534 : 0x1d4ed8

    object.fillStyle(0x020617, 0.56)
    object.fillRect(-12, 7, 24, 4)
    object.fillStyle(0x0f172a, 0.98)
    object.fillRect(-11, -8, 22, 15)
    object.lineStyle(1, accent, 0.96)
    object.strokeRect(-11, -8, 22, 15)
    object.fillStyle(darkAccent, 0.94)
    object.fillRect(-8, -5, 16, 8)
    object.lineStyle(1, 0xf8fafc, 0.64)
    object.lineBetween(-5, -2, 5, -2)
    object.lineStyle(2, accent, 0.9)
    object.lineBetween(-4, 5, 4, 5)
    object.fillStyle(accent, 0.88)
    object.fillCircle(0, 1, 2)
    object.lineStyle(1, 0xcbd5e1, 0.7)
    object.lineBetween(-5, -10, 5, -10)
    object.lineBetween(-5, -10, -5, -7)
    object.lineBetween(5, -10, 5, -7)
  }
}
