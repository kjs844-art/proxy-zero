import type Phaser from 'phaser'

import { GameServices } from './GameServices'

export const GAME_WIDTH = 640
export const GAME_HEIGHT = 360

export async function createGame(
  parent: string | HTMLElement,
  services = new GameServices(),
): Promise<Phaser.Game> {
  const { default: Phaser } = await import('phaser')
  const [{ BootScene }, { TitleScene }, { CharacterSelectScene }, { CombatScene }, { ResultsScene }] =
    await Promise.all([
      import('../phaser/scenes/BootScene'),
      import('../phaser/scenes/TitleScene'),
      import('../phaser/scenes/CharacterSelectScene'),
      import('../phaser/scenes/CombatScene'),
      import('../phaser/scenes/ResultsScene'),
    ])

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    render: {
      antialias: false,
      roundPixels: true,
      pixelArt: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      zoom: 2,
    },
    scene: [
      new BootScene(services),
      new TitleScene(services),
      new CharacterSelectScene(services),
      new CombatScene(services),
      new ResultsScene(services),
    ],
  })
}
