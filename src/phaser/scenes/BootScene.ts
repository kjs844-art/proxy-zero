import Phaser from 'phaser'

import {
  type GameServices,
  probeGameCapabilities,
  SCENE_KEYS,
} from '../../app/GameServices'
import { ACTOR_ATLAS_KEY } from '../../content/animations'

export class BootScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Boot })
  }

  preload(): void {
    this.load.multiatlas(
      ACTOR_ATLAS_KEY,
      './assets/sprites/actors.multiatlas.json',
      './assets/sprites/',
    )
  }

  create(): void {
    this.services.enterBootScene()
    this.services.recordCapabilities(probeGameCapabilities(globalThis))
    this.scene.start(SCENE_KEYS.Title)
  }
}
