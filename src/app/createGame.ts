import type Phaser from 'phaser'

import { GameServices } from './GameServices'

export const GAME_WIDTH = 640
export const GAME_HEIGHT = 360

export type CanvasSamplingMode = 'auto' | 'pixelated'

/**
 * Preserve exact pixel edges at integer desktop zooms, but avoid uneven pixel
 * columns when FIT has to use a fractional scale (common inside the Codex app).
 */
export const resolveCanvasSamplingMode = (
  renderedWidth: number,
  logicalWidth = GAME_WIDTH,
): CanvasSamplingMode => {
  if (!Number.isFinite(renderedWidth) || !Number.isFinite(logicalWidth) || logicalWidth <= 0) {
    return 'auto'
  }
  const scale = renderedWidth / logicalWidth
  return scale >= 1 && Math.abs(scale - Math.round(scale)) < 0.01 ? 'pixelated' : 'auto'
}

const installResponsiveCanvasSampling = (game: Phaser.Game): void => {
  const applySampling = (): void => {
    // Nearest-neighbour keeps the authored sprite clusters readable even when
    // the desktop shell fits 640x360 to a fractional CSS size.
    const mode: CanvasSamplingMode = 'pixelated'
    game.canvas.style.setProperty('image-rendering', mode, 'important')
    game.canvas.dataset.sampling = mode
  }
  applySampling()
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(applySampling)
  observer.observe(game.canvas)
  game.events.once('destroy', () => observer.disconnect())
}

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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    // Preserve the authored pixel clusters at the logical 640 x 360 resolution;
    // roundPixels prevents movement shimmer while the browser scales the canvas.
    pixelArt: true,
    render: {
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
      pixelArt: true,
      powerPreference: 'high-performance',
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      autoRound: true,
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
  installResponsiveCanvasSampling(game)
  return game
}
