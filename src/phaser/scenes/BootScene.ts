import Phaser from 'phaser'

import {
  type GameServices,
  probeGameCapabilities,
  SCENE_KEYS,
} from '../../app/GameServices'
import { ACTOR_ATLAS_KEY } from '../../content/animations'
import { AUDIO_CUE_IDS } from '../../presentation/AudioBus'
import { FLOODED_TUNNEL_BACKGROUND_KEY } from '../world/TunnelBackdrop'
import { SERVICE_TRAIN_BACKGROUND_KEY } from '../world/TrainBackdrop'
import { N9_DEPOT_BACKGROUND_KEY } from '../world/ZoneRenderer'

const AUTHORED_BACKGROUND_KEYS = Object.freeze([
  N9_DEPOT_BACKGROUND_KEY,
  SERVICE_TRAIN_BACKGROUND_KEY,
  FLOODED_TUNNEL_BACKGROUND_KEY,
])

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
    this.load.image(
      N9_DEPOT_BACKGROUND_KEY,
      './assets/environment/n9-depot-v2.png',
    )
    this.load.image(
      SERVICE_TRAIN_BACKGROUND_KEY,
      './assets/environment/service-train-v2.png',
    )
    this.load.image(
      FLOODED_TUNNEL_BACKGROUND_KEY,
      './assets/environment/flooded-tunnel-v2.png',
    )
    for (const cueId of AUDIO_CUE_IDS) {
      this.load.audio(cueId, `./assets/audio/${cueId}.wav`)
    }
  }

  create(): void {
    // Keep actors pixel-crisp while using linear downsampling for the authored
    // 16:9 environment paintings, which are larger than the 640x360 canvas.
    for (const textureKey of AUTHORED_BACKGROUND_KEYS) {
      this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR)
    }
    this.services.enterBootScene()
    this.services.recordCapabilities(probeGameCapabilities(globalThis))
    this.scene.start(SCENE_KEYS.Title)
  }
}
