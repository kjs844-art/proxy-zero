import Phaser from 'phaser'

import type { ItemPickupSnapshot } from '../../domain/items/itemReducer'

const BOB_PERIOD_MS = 1_100
const BOB_DISTANCE_PX = 3
const PICKUP_Y_OFFSET_PX = 11

interface PickupMarker {
  readonly itemId: ItemPickupSnapshot['itemId']
  readonly object: Phaser.GameObjects.Graphics
  readonly phaseMs: number
}

export interface EnemyDropViewSnapshot {
  readonly elapsedMs: number
  readonly ownedObjectCount: number
  readonly pickupObjectCount: number
  readonly visiblePickupCount: number
}

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const stablePhaseMs = (pickupId: string): number => {
  let hash = 0
  for (const character of pickupId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  }
  return hash % BOB_PERIOD_MS
}

/** Presentation-only projection for authored and enemy-spawned pickups in any zone. */
export class EnemyDropView {
  private readonly pickupObjects = new Map<string, PickupMarker>()
  private elapsedMs = 0

  constructor(private readonly scene: Phaser.Scene) {}

  update(
    deltaMs: number,
    pickups: readonly Readonly<ItemPickupSnapshot>[],
  ): void {
    this.elapsedMs = (this.elapsedMs + finiteDelta(deltaMs)) % BOB_PERIOD_MS
    const activePickupIds = new Set<string>()

    for (const pickup of pickups) {
      if (activePickupIds.has(pickup.id)) continue
      activePickupIds.add(pickup.id)

      let marker = this.pickupObjects.get(pickup.id)
      if (marker && marker.itemId !== pickup.itemId) {
        this.destroyPickup(pickup.id)
        marker = undefined
      }
      marker ??= this.createPickup(pickup)

      const angle = ((this.elapsedMs + marker.phaseMs) / BOB_PERIOD_MS) * Math.PI * 2
      const bob = Math.sin(angle) * BOB_DISTANCE_PX
      const glow = 0.84 + (Math.cos(angle) + 1) * 0.07
      marker.object
        .setPosition(pickup.position.x, pickup.position.y - PICKUP_Y_OFFSET_PX + bob)
        .setDepth(pickup.position.y + 2)
        .setAlpha(glow)
        .setVisible(!pickup.consumed)
    }

    for (const pickupId of [...this.pickupObjects.keys()]) {
      if (!activePickupIds.has(pickupId)) this.destroyPickup(pickupId)
    }
  }

  reset(pickups: readonly Readonly<ItemPickupSnapshot>[] = []): void {
    for (const pickupId of [...this.pickupObjects.keys()]) this.destroyPickup(pickupId)
    this.elapsedMs = 0
    if (pickups.length > 0) this.update(0, pickups)
  }

  snapshot(): EnemyDropViewSnapshot {
    let visiblePickupCount = 0
    for (const marker of this.pickupObjects.values()) {
      if (marker.object.visible) visiblePickupCount += 1
    }
    return {
      elapsedMs: this.elapsedMs,
      ownedObjectCount: this.pickupObjects.size,
      pickupObjectCount: this.pickupObjects.size,
      visiblePickupCount,
    }
  }

  dispose(): void {
    this.reset()
  }

  private createPickup(pickup: Readonly<ItemPickupSnapshot>): PickupMarker {
    const object = this.scene.add.graphics()
    this.drawPickup(object, pickup.itemId)
    const marker = {
      itemId: pickup.itemId,
      object,
      phaseMs: stablePhaseMs(pickup.id),
    }
    this.pickupObjects.set(pickup.id, marker)
    return marker
  }

  private drawPickup(
    object: Phaser.GameObjects.Graphics,
    itemId: ItemPickupSnapshot['itemId'],
  ): void {
    if (itemId === 'repair-kit') {
      this.drawRepairCrate(object)
    } else {
      this.drawEmpCan(object)
    }
  }

  private drawRepairCrate(object: Phaser.GameObjects.Graphics): void {
    object.fillStyle(0x4ade80, 0.13)
    object.fillCircle(0, 0, 19)
    object.fillStyle(0x020617, 0.58)
    object.fillRect(-13, 9, 26, 4)
    object.fillStyle(0x10251a, 0.98)
    object.fillRect(-12, -8, 24, 17)
    object.lineStyle(2, 0x4ade80, 0.96)
    object.strokeRect(-12, -8, 24, 17)
    object.lineStyle(1, 0xbbf7d0, 0.62)
    object.lineBetween(-8, -5, 8, -5)
    object.fillStyle(0x4ade80, 0.96)
    object.fillRect(-6, -2, 12, 4)
    object.fillRect(-2, -6, 4, 12)
  }

  private drawEmpCan(object: Phaser.GameObjects.Graphics): void {
    object.fillStyle(0x22d3ee, 0.14)
    object.fillCircle(0, 0, 19)
    object.fillStyle(0x020617, 0.58)
    object.fillRect(-11, 10, 22, 4)
    object.fillStyle(0x0b2530, 0.98)
    object.fillCircle(0, -7, 8)
    object.fillRect(-8, -7, 16, 16)
    object.fillCircle(0, 9, 8)
    object.lineStyle(2, 0x22d3ee, 0.96)
    object.strokeRect(-8, -7, 16, 16)
    object.lineStyle(1, 0xa5f3fc, 0.78)
    object.lineBetween(-6, -6, 6, -6)
    object.lineBetween(-6, 7, 6, 7)
    object.fillStyle(0x67e8f9, 0.92)
    object.fillRect(-2, -3, 4, 7)
  }

  private destroyPickup(pickupId: string): void {
    const marker = this.pickupObjects.get(pickupId)
    if (!marker) return
    marker.object.destroy()
    this.pickupObjects.delete(pickupId)
  }
}
