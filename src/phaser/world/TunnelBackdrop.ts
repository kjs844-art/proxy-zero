import Phaser from 'phaser'

import type {
  PuddlePhase,
  TunnelTrainPhase,
} from '../../domain/world/tunnelHazard'

export const FLOODED_TUNNEL_BACKGROUND_KEY = 'flooded-tunnel-background-v2' as const

export interface TunnelBackdropSnapshot {
  readonly elapsedMs: number
  readonly ownedObjectCount: number
  readonly sectionCount: number
  readonly sectionStride: number
  readonly sectionLandmarkCount: number
  readonly activeSectionIndex: number
  readonly puddlePhase: PuddlePhase
  readonly trainPhase: TunnelTrainPhase
  readonly puddleLiveVisible: boolean
  readonly safeLaneVisible: boolean
  readonly trainWarningVisible: boolean
}

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

const positiveIntegerOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

const positiveStrideOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback

/** Presentation-only flooded-tunnel projection. It never reads or mutates combat HP. */
export class TunnelBackdrop {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly puddle: Phaser.GameObjects.Graphics
  private readonly safeLane: Phaser.GameObjects.Graphics
  private readonly trainWarning: Phaser.GameObjects.Graphics
  private readonly trainWarningStripes: Phaser.GameObjects.Graphics
  private readonly runoff: Phaser.GameObjects.Graphics
  private readonly sectionLandmarks: Phaser.GameObjects.Graphics[] = []
  private readonly sectionCount: number
  private readonly sectionStride: number
  private elapsedMs = 0
  private activeSectionIndex = 0
  private puddlePhase: PuddlePhase = 'safe'
  private trainPhase: TunnelTrainPhase = 'idle'
  private puddleLiveVisible = false
  private trainWarningVisible = false

  constructor(scene: Phaser.Scene, sectionCount = 1, sectionStride = 640) {
    this.sectionCount = positiveIntegerOr(sectionCount, 1)
    this.sectionStride = positiveStrideOr(sectionStride, 640)
    for (let sectionIndex = 0; sectionIndex < this.sectionCount; sectionIndex += 1) {
      this.addStaticSection(scene, sectionIndex * this.sectionStride, sectionIndex)
    }

    // These props preserve the authored hazard rectangles while expressing
    // them as built tunnel infrastructure: a raised dry route, a shallow
    // flooded trench, and a pair of signal rails. Their visibility still
    // comes only from the deterministic domain phases below.
    this.safeLane = this.own(scene.add.graphics()).setDepth(-250)
    this.safeLane.fillStyle(0x06131a, 0.52)
    this.safeLane.fillRect(-272, -26, 544, 52)
    this.safeLane.lineStyle(1, 0x315b66, 0.86)
    this.safeLane.lineBetween(-272, -26, 272, -26)
    this.safeLane.lineBetween(-272, 26, 272, 26)
    this.safeLane.lineStyle(1, 0x67e8f9, 0.45)
    for (let x = -252; x < 252; x += 48) {
      this.safeLane.lineBetween(x, -18, x + 26, -18)
      this.safeLane.lineBetween(x + 6, 18, x + 32, 18)
    }
    this.safeLane.lineStyle(1, 0x0e7490, 0.58)
    for (let x = -224; x <= 224; x += 56) this.safeLane.lineBetween(x, -22, x, 22)

    this.puddle = this.own(scene.add.graphics()).setDepth(-245)
    this.puddle.fillStyle(0x082f49, 0.44)
    this.puddle.fillRect(-240, -37, 480, 74)
    this.puddle.lineStyle(2, 0x164e63, 0.82)
    this.puddle.lineBetween(-240, -37, 240, -37)
    this.puddle.lineBetween(-240, 37, 240, 37)
    this.puddle.lineStyle(1, 0x22d3ee, 0.48)
    for (let x = -220; x <= 196; x += 52) {
      this.puddle.lineBetween(x, -22, x + 30, -22)
      this.puddle.lineBetween(x + 12, 4, x + 46, 4)
      this.puddle.lineBetween(x - 10, 24, x + 18, 24)
    }
    this.puddle.fillStyle(0x67e8f9, 0.26)
    for (const x of [-176, -64, 72, 184]) {
      this.puddle.fillCircle(x, -7, 3)
      this.puddle.fillCircle(x + 10, 18, 2)
    }

    this.trainWarning = this.own(scene.add.graphics()).setDepth(-230)
    this.trainWarning.fillStyle(0x450a0a, 0.32)
    this.trainWarning.fillRect(-272, -28, 544, 56)
    this.trainWarning.lineStyle(2, 0xef4444, 0.88)
    this.trainWarning.lineBetween(-272, -25, 272, -25)
    this.trainWarning.lineBetween(-272, 25, 272, 25)
    this.trainWarning.lineStyle(1, 0xfb7185, 0.72)
    for (let x = -248; x <= 232; x += 48) {
      this.trainWarning.lineBetween(x, -19, x + 16, -19)
      this.trainWarning.lineBetween(x + 8, 19, x + 24, 19)
    }
    this.trainWarningStripes = this.own(scene.add.graphics()).setDepth(-229)
    this.trainWarningStripes.lineStyle(2, 0xf97316, 0.78)
    for (let x = 40; x < 640; x += 36) {
      this.trainWarningStripes.lineBetween(x, 239, x + 18, 193)
      this.trainWarningStripes.lineBetween(x + 18, 193, x + 25, 211)
    }

    this.runoff = this.own(scene.add.graphics()).setDepth(-220)
    this.runoff.lineStyle(1, 0x67e8f9, 0.28)
    for (let y = 228; y <= 300; y += 24) {
      for (let x = 72; x <= 556; x += 72) {
        this.runoff.lineBetween(x, y, x + 26, y + 3)
        this.runoff.lineBetween(x + 38, y + 3, x + 52, y + 1)
      }
    }
    this.runoff.lineStyle(1, 0xf97316, 0.2)
    for (let x = 92; x < 560; x += 92) this.runoff.lineBetween(x, 314, x + 34, 314)
    this.applyPhases()
  }

  private addStaticSection(scene: Phaser.Scene, sectionOffsetX: number, sectionIndex: number): void {
    this.own(
      scene.add
        .image(320 + sectionOffsetX, 180, FLOODED_TUNNEL_BACKGROUND_KEY)
        .setDisplaySize(640, 360),
    ).setDepth(-400)
    this.own(scene.add.rectangle(320 + sectionOffsetX, 254, 544, 132, 0x07131c, 0.08))
      .setDepth(-300)
      .setStrokeStyle(1, 0x315b66, 0.16)

    // The background already carries the tunnel structure. These are restrained
    // glints only, leaving its arches, pipes, and wet floor fully readable.
    const tunnelShell = this.own(scene.add.graphics())
      .setPosition(sectionOffsetX, 0)
      .setDepth(-292)
    tunnelShell.lineStyle(2, 0x3d6872, 0.2)
    tunnelShell.lineBetween(56, 110, 584, 110)
    tunnelShell.lineBetween(48, 164, 592, 164)
    tunnelShell.lineStyle(1, 0x67e8f9, 0.12)
    tunnelShell.lineBetween(74, 88, 566, 88)

    const pipes = this.own(scene.add.graphics())
      .setPosition(sectionOffsetX, 0)
      .setDepth(-286)
    pipes.lineStyle(3, 0x34515a, 0.2)
    pipes.lineBetween(18, 118, 622, 118)
    pipes.lineStyle(2, 0xf97316, 0.28)
    for (let x = 42; x < 620; x += 72) pipes.lineBetween(x, 102, x, 136)

    const wallLights = this.own(scene.add.graphics())
      .setPosition(sectionOffsetX, 0)
      .setDepth(-280)
    for (const [x, color] of [[94, 0xf97316], [258, 0x67e8f9], [422, 0xf97316], [546, 0x67e8f9]] as const) {
      wallLights.fillStyle(color, 0.18)
      wallLights.fillCircle(x, 156, 10)
      wallLights.fillStyle(color, 0.95)
      wallLights.fillCircle(x, 156, 3)
    }

    const archRibs = this.own(scene.add.graphics())
      .setPosition(sectionOffsetX, 0)
      .setDepth(-278)
    const drawArch = (centerY: number, radiusX: number, radiusY: number, color: number): void => {
      archRibs.lineStyle(2, color, 0.24)
      const shoulderY = 220
      const floorY = 312
      const shoulderAngle = Math.asin((centerY - shoulderY) / radiusY)
      const startAngle = Math.PI + shoulderAngle
      const endAngle = Math.PI * 2 - shoulderAngle
      let previousX = 320 + Math.cos(startAngle) * radiusX
      let previousY = shoulderY
      const leftX = previousX
      for (let segment = 1; segment <= 18; segment += 1) {
        const angle = startAngle + ((endAngle - startAngle) * segment) / 18
        const x = 320 + Math.cos(angle) * radiusX
        const y = centerY + Math.sin(angle) * radiusY
        archRibs.lineBetween(previousX, previousY, x, y)
        previousX = x
        previousY = y
      }
      archRibs.lineBetween(leftX, shoulderY, leftX, floorY)
      archRibs.lineBetween(previousX, shoulderY, previousX, floorY)
    }
    drawArch(316, 272, 194, 0x315b66)
    drawArch(316, 232, 156, 0x244b59)
    this.addSectionLandmark(scene, sectionOffsetX, sectionIndex)
  }

  /** Section-specific infrastructure gives each flooded block a clear identity. */
  private addSectionLandmark(scene: Phaser.Scene, offsetX: number, sectionIndex: number): void {
    const landmark = this.own(scene.add.graphics()).setDepth(-276)
    const variant = sectionIndex % 3

    if (variant === 0) {
      // Pump room: heavy, filled intake duct and amber maintenance lamp.
      landmark.fillStyle(0x29444c, 0.92)
      landmark.fillRect(64 + offsetX, 104, 158, 22)
      landmark.fillStyle(0x102a32, 0.98)
      landmark.fillRect(70 + offsetX, 109, 146, 12)
      landmark.fillStyle(0x52727a, 0.74)
      for (let x = 78; x < 208; x += 26) landmark.fillRect(x + offsetX, 105, 7, 20)
      landmark.fillStyle(0xf97316, 0.18)
      landmark.fillCircle(186 + offsetX, 138, 24)
      landmark.fillStyle(0xfbbf24, 0.94)
      landmark.fillCircle(186 + offsetX, 138, 4)
    } else if (variant === 1) {
      // Overflow bay: stacked flood crates and a blue emergency lamp.
      landmark.fillStyle(0x102733, 0.9)
      landmark.fillRect(426 + offsetX, 138, 128, 72)
      for (const [x, y, width] of [[434, 170, 46], [482, 158, 62], [434, 140, 72]] as const) {
        landmark.fillStyle(0x164e63, 0.96)
        landmark.fillRect(x + offsetX, y, width, 30)
        landmark.fillStyle(0x22d3ee, 0.42)
        landmark.fillRect(x + offsetX + 4, y + 5, width - 8, 5)
        landmark.fillStyle(0xa5f3fc, 0.62)
        landmark.fillRect(x + offsetX + 7, y + 20, 6, 4)
      }
      landmark.fillStyle(0x22d3ee, 0.18)
      landmark.fillCircle(104 + offsetX, 146, 28)
      landmark.fillStyle(0xa5f3fc, 0.94)
      landmark.fillCircle(104 + offsetX, 146, 4)
    } else {
      // Signal junction: solid gate posts and a barred maintenance shutter.
      landmark.fillStyle(0x334155, 0.94)
      landmark.fillRect(282 + offsetX, 98, 14, 108)
      landmark.fillRect(344 + offsetX, 98, 14, 108)
      landmark.fillRect(282 + offsetX, 96, 76, 16)
      landmark.fillStyle(0x111827, 0.98)
      landmark.fillRect(296 + offsetX, 112, 48, 84)
      landmark.fillStyle(0x64748b, 0.84)
      for (let x = 302; x < 340; x += 10) landmark.fillRect(x + offsetX, 116, 4, 76)
      landmark.fillStyle(0xef4444, 0.2)
      landmark.fillCircle(320 + offsetX, 132, 24)
      landmark.fillStyle(0xfda4af, 0.96)
      landmark.fillCircle(320 + offsetX, 132, 4)
    }

    this.sectionLandmarks.push(landmark)
  }

  update(
    activeDeltaMs: number,
    puddlePhase: PuddlePhase,
    trainPhase: TunnelTrainPhase,
    activeSectionIndex = 0,
  ): void {
    this.elapsedMs += finiteDelta(activeDeltaMs)
    this.puddlePhase = puddlePhase
    this.trainPhase = trainPhase
    this.activeSectionIndex = Math.min(
      this.sectionCount - 1,
      Math.max(0, Math.floor(Number.isFinite(activeSectionIndex) ? activeSectionIndex : 0)),
    )
    this.applyPhases()
  }

  reset(): void {
    this.elapsedMs = 0
    this.activeSectionIndex = 0
    this.puddlePhase = 'safe'
    this.trainPhase = 'idle'
    this.applyPhases()
  }

  snapshot(): TunnelBackdropSnapshot {
    return {
      elapsedMs: this.elapsedMs,
      ownedObjectCount: this.owned.size,
      sectionCount: this.sectionCount,
      sectionStride: this.sectionStride,
      sectionLandmarkCount: this.sectionLandmarks.length,
      activeSectionIndex: this.activeSectionIndex,
      puddlePhase: this.puddlePhase,
      trainPhase: this.trainPhase,
      puddleLiveVisible: this.puddleLiveVisible,
      safeLaneVisible: this.safeLane.visible,
      trainWarningVisible: this.trainWarningVisible,
    }
  }

  dispose(): void {
    for (const object of this.owned) object.destroy()
    this.owned.clear()
    this.sectionLandmarks.length = 0
  }

  private own<Value extends Phaser.GameObjects.GameObject>(object: Value): Value {
    this.owned.add(object)
    return object
  }

  private applyPhases(): void {
    this.puddleLiveVisible = this.puddlePhase === 'live'
    this.trainWarningVisible = this.trainPhase === 'warning' || this.trainPhase === 'sweep'
    const puddleAlpha = this.puddlePhase === 'live'
      ? 0.82
      : this.puddlePhase === 'warning'
        ? 0.58
        : this.puddlePhase === 'recover'
          ? 0.24
          : 0.14
    const activeSectionOffsetX = this.activeSectionIndex * this.sectionStride
    this.puddle.setPosition(320 + activeSectionOffsetX, 283).setAlpha(puddleAlpha)
    this.safeLane.setVisible(true).setAlpha(this.puddlePhase === 'live' ? 0.62 : 0.24)
    this.safeLane.setPosition(320 + activeSectionOffsetX, 214)
    this.trainWarning.setAlpha(this.trainPhase === 'sweep' ? 0.72 : this.trainWarningVisible ? 0.38 : 0.04)
    this.trainWarning.setPosition(320 + activeSectionOffsetX, 216)
    this.trainWarningStripes.setAlpha(this.trainPhase === 'sweep' ? 0.76 : this.trainWarningVisible ? 0.38 : 0.04)
    this.trainWarningStripes.setPosition(activeSectionOffsetX, 0)
    this.runoff.setPosition(activeSectionOffsetX, (this.elapsedMs * 0.025) % 22)
  }
}
