import Phaser from 'phaser'

import type { ArenaBounds } from '../../domain/waves/waveDirector'

export const N9_DEPOT_BACKGROUND_KEY = 'n9-depot-background-v2' as const

export interface ZoneRendererSnapshot {
  readonly depthLayerCount: number
  readonly elapsedMs: number
  readonly hasCyanReflections: boolean
  readonly hasRain: boolean
  readonly hasRails: boolean
  readonly hasTungstenPools: boolean
  readonly hasWarningRed: boolean
  readonly locked: boolean
  readonly ownedObjectCount: number
  readonly rainOffset: number
  readonly reflectionAlpha: number
}

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

/** Owns the authored N-9 depot background and lightweight animated atmosphere. */
export class ZoneRenderer {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly reflections: Phaser.GameObjects.Rectangle[] = []
  private readonly gates: Phaser.GameObjects.Rectangle[] = []
  private readonly rain: Phaser.GameObjects.Graphics
  private elapsedMs = 0
  private locked = true
  private reflectionAlpha = 0.34
  private rainOffset = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arena: Readonly<ArenaBounds>,
  ) {
    const centerX = (arena.minX + arena.maxX) / 2
    const centerY = (arena.minY + arena.maxY) / 2
    const width = arena.maxX - arena.minX
    const height = arena.maxY - arena.minY

    this.own(
      scene.add
        .image(320, 180, N9_DEPOT_BACKGROUND_KEY)
        .setDisplaySize(640, 360),
    ).setDepth(-400)

    // A very light floor wash keeps the playable lane readable without
    // flattening the authored puddles and surface wear in the background art.
    this.own(scene.add.rectangle(centerX, centerY + 16, width, height - 20, 0x07131c, 0.08))
      .setDepth(-300)
      .setStrokeStyle(1, 0x67e8f9, 0.1)

    for (const x of [154, 320, 486]) {
      this.own(scene.add.ellipse(x, 202, 124, 44, 0xf6c76e, 0.07)).setDepth(-260)
    }

    for (const [x, y, reflectionWidth] of [
      [142, 246, 96],
      [318, 304, 142],
      [506, 238, 86],
    ] as const) {
      const reflection = this.own(
        scene.add.rectangle(x, y, reflectionWidth, 3, 0x22d3ee, this.reflectionAlpha * 0.58),
      ).setDepth(-240)
      this.reflections.push(reflection)
    }

    this.rain = this.own(scene.add.graphics()).setDepth(-220)
    this.rain.lineStyle(1, 0x9be7f1, 0.18)
    for (let y = -46; y <= 406; y += 46) {
      for (let x = 14; x < 672; x += 43) {
        this.rain.lineBetween(x, y, x - 9, y + 24)
      }
    }

    for (const x of [arena.minX - 7, arena.maxX + 7]) {
      const gate = this.own(scene.add.rectangle(x, centerY, 8, height + 22, 0xef4444, 0.68))
        .setDepth(-180)
        .setStrokeStyle(2, 0xff6b6b, 1)
      this.gates.push(gate)
    }

    this.applyMotion()
  }

  update(deltaMs: number): void {
    this.elapsedMs += finiteDelta(deltaMs)
    this.applyMotion()
  }

  setLocked(locked: boolean): void {
    this.locked = locked
    this.applyMotion()
  }

  reset(): void {
    this.elapsedMs = 0
    this.locked = true
    this.applyMotion()
  }

  snapshot(): ZoneRendererSnapshot {
    return {
      depthLayerCount: 5,
      elapsedMs: this.elapsedMs,
      hasCyanReflections: true,
      hasRain: true,
      hasRails: true,
      hasTungstenPools: true,
      hasWarningRed: true,
      locked: this.locked,
      ownedObjectCount: this.owned.size,
      rainOffset: this.rainOffset,
      reflectionAlpha: this.reflectionAlpha,
    }
  }

  dispose(): void {
    for (const object of this.owned) object.destroy()
    this.owned.clear()
    this.reflections.length = 0
    this.gates.length = 0
  }

  private own<Value extends Phaser.GameObjects.GameObject>(object: Value): Value {
    this.owned.add(object)
    return object
  }

  private applyMotion(): void {
    this.reflectionAlpha = 0.22 + Math.sin(this.elapsedMs / 420) * 0.06
    this.rainOffset = (this.elapsedMs / 24) % 46
    this.reflections.forEach((reflection, index) => {
      reflection.setAlpha(this.reflectionAlpha + index * 0.025)
    })
    this.rain.setPosition(0, this.rainOffset)
    for (const gate of this.gates) gate.setAlpha(this.locked ? 0.86 : 0.16)
  }
}
