import Phaser from 'phaser'

import type { EnemyAttackRange, EnemyPoint } from '../../domain/enemies/types'

interface TelegraphMarker {
  readonly object: Phaser.GameObjects.Ellipse
  remainingMs: number
}

export interface HazardViewSnapshot {
  readonly guardCount: number
  readonly ownedObjectCount: number
  readonly telegraphCount: number
}

const finiteDuration = (durationMs: number): number =>
  Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0

/** Presentation-only telegraph and guard markers; it has no combat-state dependency. */
export class HazardView {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly telegraphs = new Map<string, TelegraphMarker>()
  private readonly guards = new Map<string, Phaser.GameObjects.Ellipse>()

  constructor(private readonly scene: Phaser.Scene) {}

  showTelegraph(
    enemyId: string,
    position: Readonly<EnemyPoint>,
    range: Readonly<EnemyAttackRange>,
    durationMs: number,
  ): void {
    this.destroyTelegraph(enemyId)
    const object = this.own(
      this.scene.add.ellipse(
        position.x,
        position.y,
        Math.max(8, range.x * 2),
        Math.max(8, range.y * 2),
        0xef4444,
        0.14,
      ),
    )
      .setDepth(position.y - 2)
      .setStrokeStyle(2, 0xff6b6b, 0.82)
    this.telegraphs.set(enemyId, { object, remainingMs: finiteDuration(durationMs) })
  }

  setGuard(enemyId: string, position: Readonly<EnemyPoint>, active: boolean): void {
    if (!active) {
      this.destroyGuard(enemyId)
      return
    }
    const existing = this.guards.get(enemyId)
    if (existing) {
      existing.setPosition(position.x, position.y - 30).setDepth(position.y + 1)
      return
    }
    const object = this.own(
      this.scene.add.ellipse(position.x, position.y - 30, 34, 12, 0x67e8f9, 0.25),
    )
      .setDepth(position.y + 1)
      .setStrokeStyle(2, 0x67e8f9, 0.9)
    this.guards.set(enemyId, object)
  }

  update(deltaMs: number): void {
    const elapsed = finiteDuration(deltaMs)
    for (const [enemyId, marker] of this.telegraphs) {
      marker.remainingMs = Math.max(0, marker.remainingMs - elapsed)
      if (marker.remainingMs === 0) this.destroyTelegraph(enemyId)
    }
  }

  clearEnemy(enemyId: string): void {
    this.destroyTelegraph(enemyId)
    this.destroyGuard(enemyId)
  }

  reset(): void {
    for (const enemyId of [...this.telegraphs.keys()]) this.destroyTelegraph(enemyId)
    for (const enemyId of [...this.guards.keys()]) this.destroyGuard(enemyId)
  }

  snapshot(): HazardViewSnapshot {
    return {
      guardCount: this.guards.size,
      ownedObjectCount: this.owned.size,
      telegraphCount: this.telegraphs.size,
    }
  }

  dispose(): void {
    this.reset()
    for (const object of this.owned) object.destroy()
    this.owned.clear()
  }

  private own<Value extends Phaser.GameObjects.GameObject>(object: Value): Value {
    this.owned.add(object)
    return object
  }

  private destroyTelegraph(enemyId: string): void {
    const marker = this.telegraphs.get(enemyId)
    if (!marker) return
    marker.object.destroy()
    this.owned.delete(marker.object)
    this.telegraphs.delete(enemyId)
  }

  private destroyGuard(enemyId: string): void {
    const object = this.guards.get(enemyId)
    if (!object) return
    object.destroy()
    this.owned.delete(object)
    this.guards.delete(enemyId)
  }
}
