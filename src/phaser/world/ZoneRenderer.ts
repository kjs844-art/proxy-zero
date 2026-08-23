import Phaser from 'phaser'

import type { ArenaBounds } from '../../domain/waves/waveDirector'

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

/** Owns the procedural, asset-free visual projection of the N-9 rail-yard arena. */
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

    this.own(scene.add.rectangle(320, 180, 640, 360, 0x050a12)).setDepth(-400)

    const skyline = this.own(scene.add.graphics()).setDepth(-390)
    skyline.fillStyle(0x0b1d29, 1)
    skyline.fillRect(0, 76, 640, 116)
    skyline.fillStyle(0x153243, 1)
    for (let x = 18; x < 640; x += 78) skyline.fillRect(x, 92, 48, 100)
    skyline.lineStyle(2, 0x254b5e, 0.7)
    skyline.lineBetween(0, 128, 640, 96)
    skyline.lineBetween(0, 154, 640, 122)

    this.own(scene.add.rectangle(centerX, centerY, width, height, 0x102634))
      .setDepth(-300)
      .setStrokeStyle(2, 0x1f5068, 1)

    const rails = this.own(scene.add.graphics()).setDepth(-280)
    rails.lineStyle(4, 0x52606a, 0.95)
    rails.lineBetween(arena.minX, 220, arena.maxX, 220)
    rails.lineBetween(arena.minX, 282, arena.maxX, 282)
    rails.lineStyle(2, 0x19242d, 0.95)
    for (let x = arena.minX; x <= arena.maxX; x += 24) {
      rails.lineBetween(x, 202, x + 6, 300)
    }

    for (const x of [154, 320, 486]) {
      this.own(scene.add.ellipse(x, 202, 124, 44, 0xf6c76e, 0.12)).setDepth(-260)
    }

    for (const [x, y, reflectionWidth] of [
      [142, 246, 96],
      [318, 304, 142],
      [506, 238, 86],
    ] as const) {
      const reflection = this.own(
        scene.add.rectangle(x, y, reflectionWidth, 4, 0x22d3ee, this.reflectionAlpha),
      ).setDepth(-240)
      this.reflections.push(reflection)
    }

    this.rain = this.own(scene.add.graphics()).setDepth(-220)
    this.rain.lineStyle(1, 0x9be7f1, 0.22)
    for (let x = 14; x < 640; x += 31) {
      this.rain.lineBetween(x, 74 + (x % 37), x - 8, 96 + (x % 37))
      this.rain.lineBetween(x, 190 + (x % 41), x - 8, 212 + (x % 41))
    }

    for (const x of [arena.minX - 7, arena.maxX + 7]) {
      const gate = this.own(scene.add.rectangle(x, centerY, 10, height + 22, 0xef4444, 0.85))
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
    this.reflectionAlpha = 0.34 + Math.sin(this.elapsedMs / 420) * 0.08
    this.rainOffset = (this.elapsedMs / 24) % 22
    this.reflections.forEach((reflection, index) => {
      reflection.setAlpha(this.reflectionAlpha + index * 0.025)
    })
    this.rain.setPosition(0, this.rainOffset)
    for (const gate of this.gates) gate.setAlpha(this.locked ? 0.86 : 0.16)
  }
}
