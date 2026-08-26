import Phaser from 'phaser'

import type {
  BossAttackPlan,
  BossRangedPattern,
} from '../../domain/combat/bossAttackDirector'
import { canBossRangedPatternHitHeight } from '../../domain/combat/bossAttackDirector'

export interface BossProjectileTarget {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly radius: number
}

export interface BossProjectileImpact {
  readonly sourceId: string
  readonly pattern: BossRangedPattern
  readonly damage: number
  readonly hitstunMs: number
}

interface ProjectileRuntime {
  readonly id: number
  readonly sourceId: string
  readonly pattern: BossRangedPattern
  readonly object: Phaser.GameObjects.Container
  readonly velocity: { readonly x: number; readonly y: number }
  readonly damage: number
  readonly hitstunMs: number
  readonly collisionRadius: number
  readonly totalTtlMs: number
  remainingTtlMs: number
  x: number
  y: number
}

const finiteDelta = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const projectileSize = (pattern: BossRangedPattern): number =>
  pattern === 'ground-shockwave' ? 18 : pattern === 'three-way-spread' ? 8 : 11

/** Renderer-owned boss projectile motion and collision projection. */
export class BossProjectileView {
  private readonly projectiles = new Map<number, ProjectileRuntime>()
  private nextId = 1

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(sourceId: string, plan: Readonly<BossAttackPlan>): void {
    for (const projectile of plan.projectiles) {
      const size = projectileSize(plan.pattern)
      const color = plan.pattern === 'ground-shockwave'
        ? 0xf59e0b
        : plan.sourceClass === 'boss'
          ? 0xfb7185
          : 0x67e8f9
      const glow = this.scene.add.ellipse(0, 0, size * 2.7, size * 1.8, color, 0.2)
      const core = this.scene.add.ellipse(
        0,
        0,
        plan.pattern === 'ground-shockwave' ? size * 2.2 : size,
        plan.pattern === 'ground-shockwave' ? size * 0.68 : size,
        color,
        0.96,
      ).setStrokeStyle(1, 0xfff7ed, 0.9)
      const object = this.scene.add
        .container(plan.origin.x, plan.origin.y - (plan.pattern === 'ground-shockwave' ? 4 : 28), [glow, core])
        .setDepth(plan.origin.y + 4)
        .setRotation(Math.atan2(projectile.velocity.y, projectile.velocity.x))
      const id = this.nextId++
      this.projectiles.set(id, {
        id,
        sourceId,
        pattern: plan.pattern,
        object,
        velocity: { ...projectile.velocity },
        damage: projectile.damage,
        hitstunMs: projectile.hitstunMs,
        collisionRadius: size + 5,
        totalTtlMs: projectile.ttlMs,
        remainingTtlMs: projectile.ttlMs,
        x: plan.origin.x,
        y: plan.origin.y,
      })
    }
  }

  advance(deltaMs: number, target: Readonly<BossProjectileTarget>): BossProjectileImpact[] {
    const elapsedMs = finiteDelta(deltaMs)
    const seconds = elapsedMs / 1_000
    const impacts: BossProjectileImpact[] = []
    for (const runtime of [...this.projectiles.values()]) {
      runtime.remainingTtlMs = Math.max(0, runtime.remainingTtlMs - elapsedMs)
      runtime.x += runtime.velocity.x * seconds
      runtime.y += runtime.velocity.y * seconds
      const lift = runtime.pattern === 'ground-shockwave' ? 4 : 28
      const progress = runtime.totalTtlMs <= 0
        ? 1
        : 1 - runtime.remainingTtlMs / runtime.totalTtlMs
      runtime.object
        .setPosition(runtime.x, runtime.y - lift)
        .setDepth(runtime.y + 4)
        .setScale(0.94 + Math.sin(progress * Math.PI * 8) * 0.08)

      const hitDistance = runtime.collisionRadius + Math.max(8, target.radius)
      if (
        canBossRangedPatternHitHeight(runtime.pattern, target.z) &&
        Math.hypot(runtime.x - target.x, runtime.y - target.y) <= hitDistance
      ) {
        impacts.push({
          sourceId: runtime.sourceId,
          pattern: runtime.pattern,
          damage: runtime.damage,
          hitstunMs: runtime.hitstunMs,
        })
        this.destroy(runtime.id)
      } else if (runtime.remainingTtlMs === 0) {
        this.destroy(runtime.id)
      }
    }
    return impacts
  }

  clearSource(sourceId: string): void {
    for (const runtime of [...this.projectiles.values()]) {
      if (runtime.sourceId === sourceId) this.destroy(runtime.id)
    }
  }

  reset(): void {
    for (const id of [...this.projectiles.keys()]) this.destroy(id)
  }

  snapshot(): { readonly count: number } {
    return { count: this.projectiles.size }
  }

  dispose(): void {
    this.reset()
  }

  private destroy(id: number): void {
    const runtime = this.projectiles.get(id)
    if (!runtime) return
    runtime.object.destroy(true)
    this.projectiles.delete(id)
  }
}
