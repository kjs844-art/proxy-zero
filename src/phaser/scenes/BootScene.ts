import Phaser from 'phaser'

import {
  type GameServices,
  probeGameCapabilities,
  SCENE_KEYS,
} from '../../app/GameServices'
import { GREYBOX_TEXTURES } from '../actors/ActorView'

const textureColors: Readonly<Record<string, number>> = {
  [GREYBOX_TEXTURES.han]: 0x2dd4bf,
  [GREYBOX_TEXTURES.mina]: 0xf472b6,
  [GREYBOX_TEXTURES.jin]: 0xfbbf24,
  [GREYBOX_TEXTURES.enemy]: 0xef4444,
}

export class BootScene extends Phaser.Scene {
  constructor(private readonly services: GameServices) {
    super({ key: SCENE_KEYS.Boot })
  }

  create(): void {
    this.services.enterScene(SCENE_KEYS.Boot)
    this.services.recordCapabilities(probeGameCapabilities(globalThis))
    this.createGreyboxTextures()
    this.scene.start(SCENE_KEYS.Title)
  }

  private createGreyboxTextures(): void {
    for (const [textureKey, color] of Object.entries(textureColors)) {
      if (this.textures.exists(textureKey)) continue

      const graphics = this.make.graphics({ x: 0, y: 0 }, false)
      graphics.fillStyle(0x071018, 1)
      graphics.fillRect(3, 0, 10, 6)
      graphics.fillStyle(color, 1)
      graphics.fillRect(1, 6, 14, 11)
      graphics.fillRect(4, 17, 3, 7)
      graphics.fillRect(9, 17, 3, 7)
      graphics.generateTexture(textureKey, 16, 24)
      graphics.destroy()
    }
  }
}
