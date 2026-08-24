import Phaser from 'phaser'

import {
  type GameServices,
  probeGameCapabilities,
  SCENE_KEYS,
} from '../../app/GameServices'
import { ACTOR_ATLAS_KEY } from '../../content/animations'
import { AUDIO_CUE_IDS } from '../../presentation/AudioBus'

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
    for (const cueId of AUDIO_CUE_IDS) {
      this.load.audio(cueId, `./assets/audio/${cueId}.wav`)
    }
  }

  create(): void {
    this.services.enterBootScene()
    this.services.recordCapabilities(probeGameCapabilities(globalThis))
    this.scene.start(SCENE_KEYS.Title)
  }
}
