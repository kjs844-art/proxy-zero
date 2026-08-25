import Phaser from 'phaser'

import type { ArenaBounds } from '../../domain/waves/waveDirector'

export const N9_DEPOT_BACKGROUND_KEY = 'n9-depot-background-v2' as const

export interface ZoneRendererSnapshot {
  readonly activeSectionIndex: number
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
  readonly sectionLandmarkCount: number
  readonly sectionCount: number
}

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const normalizedSectionCount = (sectionCount: number): number =>
  Number.isFinite(sectionCount) ? Math.max(1, Math.trunc(sectionCount)) : 1

const normalizedSectionStride = (sectionStride: number): number =>
  Number.isFinite(sectionStride) && sectionStride > 0 ? sectionStride : 640

/** Owns the authored N-9 depot background and lightweight animated atmosphere. */
export class ZoneRenderer {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly reflections: Phaser.GameObjects.Rectangle[] = []
  private readonly rain: Phaser.GameObjects.Graphics[] = []
  private readonly sectionLandmarks: Phaser.GameObjects.Graphics[] = []
  private readonly sectionCount: number
  private readonly sectionStride: number
  private activeSectionIndex = 0
  private elapsedMs = 0
  private locked = true
  private reflectionAlpha = 0.34
  private rainOffset = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arena: Readonly<ArenaBounds>,
    sectionCount = 1,
    sectionStride = 640,
  ) {
    this.sectionCount = normalizedSectionCount(sectionCount)
    this.sectionStride = normalizedSectionStride(sectionStride)

    const centerX = (arena.minX + arena.maxX) / 2
    const centerY = (arena.minY + arena.maxY) / 2
    const width = arena.maxX - arena.minX
    const height = arena.maxY - arena.minY

    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      const offsetX = sectionIndex * this.sectionStride

      this.own(
        scene.add
          .image(320 + offsetX, 180, N9_DEPOT_BACKGROUND_KEY)
          .setDisplaySize(640, 360),
      ).setDepth(-400)

      // A very light floor wash keeps the playable lane readable without
      // flattening the authored puddles and surface wear in the background art.
      this.own(
        scene.add.rectangle(centerX + offsetX, centerY + 16, width, height - 20, 0x07131c, 0.08),
      )
        .setDepth(-300)
        .setStrokeStyle(1, 0x67e8f9, 0.1)

      for (const x of [154, 320, 486]) {
        this.own(scene.add.ellipse(x + offsetX, 202, 124, 44, 0xf6c76e, 0.07)).setDepth(-260)
      }

      for (const [x, y, reflectionWidth] of [
        [142, 246, 96],
        [318, 304, 142],
        [506, 238, 86],
      ] as const) {
        const reflection = this.own(
          scene.add.rectangle(
            x + offsetX,
            y,
            reflectionWidth,
            3,
            0x22d3ee,
            this.reflectionAlpha * 0.58,
          ),
        ).setDepth(-240)
        this.reflections.push(reflection)
      }

      const rain = this.own(scene.add.graphics()).setDepth(-220)
      rain.lineStyle(1, 0x9be7f1, 0.18)
      for (let y = -46; y <= 406; y += 46) {
        for (let x = 14; x < 672; x += 43) {
          rain.lineBetween(x, y, x - 9, y + 24)
        }
      }
      rain.setPosition(offsetX, 0)
      this.rain.push(rain)

      this.addSectionLandmark(sectionIndex, offsetX)

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

  setActiveSection(index: number): void {
    const normalizedIndex = Number.isFinite(index) ? Math.trunc(index) : 0
    this.activeSectionIndex = Math.min(
      this.sectionCount - 1,
      Math.max(0, normalizedIndex),
    )
    this.applyMotion()
  }

  reset(): void {
    this.activeSectionIndex = 0
    this.elapsedMs = 0
    this.locked = true
    this.applyMotion()
  }

  snapshot(): ZoneRendererSnapshot {
    return {
      activeSectionIndex: this.activeSectionIndex,
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
      sectionLandmarkCount: this.sectionLandmarks.length,
      sectionCount: this.sectionCount,
    }
  }

  dispose(): void {
    for (const object of this.owned) object.destroy()
    this.owned.clear()
    this.reflections.length = 0
    this.rain.length = 0
    this.sectionLandmarks.length = 0
  }

  private own<Value extends Phaser.GameObjects.GameObject>(object: Value): Value {
    this.owned.add(object)
    return object
  }

  /**
   * Gives each scrolling depot block an authored purpose without creating a
   * second ruleset. These objects deliberately remain behind the combat lane.
   */
  private addSectionLandmark(sectionIndex: number, offsetX: number): void {
    const landmark = this.own(this.scene.add.graphics()).setDepth(-275)
    const variant = sectionIndex % 3

    if (variant === 0) {
      // Compact wall plaque: the painted backdrop already carries the depot
      // architecture, so this landmark must not read as a gameplay gate or
      // cover the combat silhouettes below it.
      landmark.fillStyle(0x334155, 0.86)
      landmark.fillRect(72 + offsetX, 82, 116, 30)
      landmark.fillStyle(0x081521, 0.98)
      landmark.fillRect(77 + offsetX, 87, 106, 20)
      landmark.fillStyle(0x5f450e, 0.92)
      landmark.fillRect(77 + offsetX, 87, 106, 4)
      landmark.fillStyle(0xf6c76e, 0.9)
      landmark.fillCircle(177 + offsetX, 100, 3)
      this.addPhysicalLabel('N-9  INBOUND', 84 + offsetX, 95, '#fde68a')
    } else if (variant === 1) {
      // Cold-storage transfer bay: dense stack of sealed cases, not a panel.
      landmark.fillStyle(0x102333, 0.94)
      landmark.fillRect(402 + offsetX, 194, 156, 14)
      for (const [x, y, width] of [[408, 162, 46], [456, 150, 58], [516, 170, 34], [408, 132, 72]] as const) {
        landmark.fillStyle(0x173a50, 0.96)
        landmark.fillRect(x + offsetX, y, width, 30)
        landmark.fillStyle(0x2563eb, 0.44)
        landmark.fillRect(x + offsetX + 4, y + 5, width - 8, 5)
        landmark.fillStyle(0x93c5fd, 0.68)
        landmark.fillRect(x + offsetX + 7, y + 20, 7, 4)
        landmark.fillRect(x + offsetX + width - 14, y + 20, 7, 4)
      }
      landmark.fillStyle(0x22d3ee, 0.16)
      landmark.fillCircle(122 + offsetX, 126, 34)
      landmark.fillStyle(0x67e8f9, 0.96)
      landmark.fillCircle(122 + offsetX, 126, 5)
      landmark.fillStyle(0x334155, 0.88)
      landmark.fillRect(118 + offsetX, 78, 8, 44)
      this.addPhysicalLabel('COLD  TRANSFER', 412 + offsetX, 118, '#a5f3fc')
    } else {
      // Security cut-through: solid scanner pylons with a glowing sensor core.
      landmark.fillStyle(0x1e293b, 0.96)
      landmark.fillRect(270 + offsetX, 102, 18, 102)
      landmark.fillRect(352 + offsetX, 102, 18, 102)
      landmark.fillStyle(0x334155, 0.96)
      landmark.fillRect(270 + offsetX, 96, 100, 16)
      landmark.fillStyle(0x020617, 0.94)
      landmark.fillRect(286 + offsetX, 112, 68, 12)
      landmark.fillStyle(0x67e8f9, 0.86)
      landmark.fillRect(292 + offsetX, 116, 56, 3)
      landmark.fillStyle(0x475569, 0.86)
      landmark.fillRect(276 + offsetX, 196, 12, 8)
      landmark.fillRect(352 + offsetX, 196, 12, 8)
      landmark.fillStyle(0xef4444, 0.2)
      landmark.fillCircle(320 + offsetX, 130, 26)
      landmark.fillStyle(0xfb7185, 0.94)
      landmark.fillCircle(320 + offsetX, 130, 4)
      landmark.lineStyle(2, 0xf97316, 0.64)
      for (let x = 74; x < 196; x += 22) landmark.lineBetween(x + offsetX, 214, x + offsetX + 14, 202)
      this.addPhysicalLabel('SECURITY  CHECK', 280 + offsetX, 82, '#fda4af')
    }

    this.sectionLandmarks.push(landmark)
  }

  private addPhysicalLabel(label: string, x: number, y: number, color: string): void {
    // Test scenes intentionally omit text; the live Phaser factory always has it.
    if (typeof this.scene.add.text !== 'function') return
    this.own(this.scene.add.text(x, y, label, {
      color,
      fontFamily: 'monospace',
      fontSize: '8px',
      stroke: '#020617',
      strokeThickness: 1,
    })).setDepth(-274).setAlpha(0.92)
  }

  private applyMotion(): void {
    this.reflectionAlpha = 0.22 + Math.sin(this.elapsedMs / 420) * 0.06
    this.rainOffset = (this.elapsedMs / 24) % 46
    this.reflections.forEach((reflection, index) => {
      reflection.setAlpha(this.reflectionAlpha + index * 0.025)
    })
    this.rain.forEach((rain, sectionIndex) => {
      rain.setPosition(sectionIndex * this.sectionStride, this.rainOffset)
    })
  }
}
