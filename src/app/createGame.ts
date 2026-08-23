import type Phaser from 'phaser'

export const GAME_WIDTH = 640
export const GAME_HEIGHT = 360

export async function createGame(parent: string | HTMLElement): Promise<Phaser.Game> {
  const { default: Phaser } = await import('phaser')

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
  })
}
