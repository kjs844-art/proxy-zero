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
      .setStrokeStyle(2, 0x315b66, 0.9)

    const pipes = this.own(scene.add.graphics()).setDepth(-330)
    pipes.fillStyle(0x152f38, 1)
    pipes.fillRect(0, 78, 640, 92)
    pipes.lineStyle(8, 0x34515a, 0.9)
    pipes.lineBetween(18, 118, 622, 118)
    pipes.lineStyle(3, 0xf97316, 0.55)
    for (let x = 42; x < 620; x += 72) pipes.lineBetween(x, 102, x, 136)

    this.safeLane = this.own(scene.add.rectangle(320, 214, 544, 52, 0x164e63, 0.22))
      .setDepth(-250)
      .setStrokeStyle(1, 0x67e8f9, 0.45)
    this.puddle = this.own(scene.add.rectangle(320, 283, 480, 74, 0x0e7490, 0.34))
      .setDepth(-245)
      .setStrokeStyle(2, 0x22d3ee, 0.6)
    this.trainWarning = this.own(scene.add.rectangle(320, 216, 544, 56, 0xef4444, 0.08))
      .setDepth(-230)
      .setStrokeStyle(2, 0xfb7185, 0.8)

    this.runoff = this.own(scene.add.graphics()).setDepth(-220)
    this.runoff.lineStyle(2, 0x67e8f9, 0.3)
    for (let x = 92; x <= 548; x += 38) this.runoff.lineBetween(x, 250, x - 18, 312)
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
    this.runoff.setPosition(0, (this.elapsedMs * 0.025) % 18)
  }
}
