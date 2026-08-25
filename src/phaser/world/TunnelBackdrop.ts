import Phaser from 'phaser'

import type {
  PuddlePhase,
  TunnelTrainPhase,
} from '../../domain/world/tunnelHazard'

export interface TunnelBackdropSnapshot {
  readonly elapsedMs: number
  readonly ownedObjectCount: number
  readonly puddlePhase: PuddlePhase
  readonly trainPhase: TunnelTrainPhase
  readonly puddleLiveVisible: boolean
  readonly safeLaneVisible: boolean
  readonly trainWarningVisible: boolean
}

const finiteDelta = (deltaMs: number): number =>
  Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0

/** Presentation-only flooded-tunnel projection. It never reads or mutates combat HP. */
export class TunnelBackdrop {
  private readonly owned = new Set<Phaser.GameObjects.GameObject>()
  private readonly puddle: Phaser.GameObjects.Rectangle
  private readonly safeLane: Phaser.GameObjects.Rectangle
  private readonly trainWarning: Phaser.GameObjects.Rectangle
  private readonly trainWarningStripes: Phaser.GameObjects.Graphics
  private readonly runoff: Phaser.GameObjects.Graphics
  private elapsedMs = 0
  private puddlePhase: PuddlePhase = 'safe'
  private trainPhase: TunnelTrainPhase = 'idle'
  private puddleLiveVisible = false
  private trainWarningVisible = false

  constructor(scene: Phaser.Scene) {
    this.own(scene.add.rectangle(320, 180, 640, 360, 0x050b10)).setDepth(-400)
    this.own(scene.add.rectangle(320, 254, 544, 132, 0x10232b))
      .setDepth(-300)
      .setStrokeStyle(1, 0x315b66, 0.22)

    // These ribs sit just above the arena floor projection so their lower legs
    // remain visible instead of disappearing behind the shared arena rectangle.
    const tunnelShell = this.own(scene.add.graphics()).setDepth(-292)
    tunnelShell.fillStyle(0x0b1922, 1)
    tunnelShell.fillRect(0, 72, 640, 122)
    tunnelShell.fillStyle(0x0c2028, 1)
    tunnelShell.fillRect(0, 170, 52, 150)
    tunnelShell.fillRect(588, 170, 52, 150)
    tunnelShell.lineStyle(2, 0x3d6872, 0.9)
    tunnelShell.lineBetween(56, 110, 584, 110)
    tunnelShell.lineBetween(48, 164, 592, 164)
    tunnelShell.lineStyle(1, 0x67e8f9, 0.25)
    tunnelShell.lineBetween(74, 88, 566, 88)

    const pipes = this.own(scene.add.graphics()).setDepth(-286)
    pipes.fillStyle(0x152f38, 1)
    pipes.fillRect(0, 78, 640, 92)
    pipes.lineStyle(8, 0x34515a, 0.9)
    pipes.lineBetween(18, 118, 622, 118)
    pipes.lineStyle(3, 0xf97316, 0.55)
    for (let x = 42; x < 620; x += 72) pipes.lineBetween(x, 102, x, 136)

    const wallLights = this.own(scene.add.graphics()).setDepth(-280)
    for (const [x, color] of [[94, 0xf97316], [258, 0x67e8f9], [422, 0xf97316], [546, 0x67e8f9]] as const) {
      wallLights.fillStyle(color, 0.18)
      wallLights.fillCircle(x, 156, 10)
      wallLights.fillStyle(color, 0.95)
      wallLights.fillCircle(x, 156, 3)
    }

    const archRibs = this.own(scene.add.graphics()).setDepth(-278)
    const drawArch = (centerY: number, radiusX: number, radiusY: number, color: number): void => {
      archRibs.lineStyle(4, color, 0.88)
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

    this.safeLane = this.own(scene.add.rectangle(320, 214, 544, 52, 0x164e63, 0.22))
      .setDepth(-250)
      .setStrokeStyle(1, 0x67e8f9, 0.45)
    this.puddle = this.own(scene.add.rectangle(320, 283, 480, 74, 0x0e7490, 0.34))
      .setDepth(-245)
      .setStrokeStyle(2, 0x22d3ee, 0.6)
    this.trainWarning = this.own(scene.add.rectangle(320, 216, 544, 56, 0xef4444, 0.08))
      .setDepth(-230)
      .setStrokeStyle(2, 0xfb7185, 0.8)
    this.trainWarningStripes = this.own(scene.add.graphics()).setDepth(-229)
    this.trainWarningStripes.lineStyle(2, 0xfb7185, 0.58)
    for (let x = 40; x < 640; x += 28) {
      this.trainWarningStripes.lineBetween(x, 242, x + 32, 190)
    }

    this.runoff = this.own(scene.add.graphics()).setDepth(-220)
    this.runoff.lineStyle(2, 0x67e8f9, 0.3)
    for (let y = 226; y <= 308; y += 22) {
      for (let x = 74; x <= 568; x += 56) this.runoff.lineBetween(x, y, x + 22, y + 5)
    }
    this.applyPhases()
  }

  update(activeDeltaMs: number, puddlePhase: PuddlePhase, trainPhase: TunnelTrainPhase): void {
    this.elapsedMs += finiteDelta(activeDeltaMs)
    this.puddlePhase = puddlePhase
    this.trainPhase = trainPhase
    this.applyPhases()
  }

  reset(): void {
    this.elapsedMs = 0
    this.puddlePhase = 'safe'
    this.trainPhase = 'idle'
    this.applyPhases()
  }

  snapshot(): TunnelBackdropSnapshot {
    return {
      elapsedMs: this.elapsedMs,
      ownedObjectCount: this.owned.size,
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
    this.puddle.setAlpha(puddleAlpha)
    this.safeLane.setVisible(true).setAlpha(this.puddlePhase === 'live' ? 0.62 : 0.24)
    this.trainWarning.setAlpha(this.trainPhase === 'sweep' ? 0.72 : this.trainWarningVisible ? 0.38 : 0.04)
    this.trainWarningStripes.setAlpha(this.trainPhase === 'sweep' ? 0.76 : this.trainWarningVisible ? 0.38 : 0.04)
    this.runoff.setPosition(0, (this.elapsedMs * 0.025) % 22)
  }
}
