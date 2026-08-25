import { beforeEach, describe, expect, it, vi } from 'vitest'

const phaserMocks = vi.hoisted(() => ({
  text: vi.fn(),
}))

vi.mock('phaser', () => {
  class Canvas {
    private readonly attributes = new Map<string, string>()

    getAttribute(name: string): string | null {
      return this.attributes.get(name) ?? null
    }

    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value)
    }

    removeAttribute(name: string): void {
      this.attributes.delete(name)
    }
  }

  const textObject = () => ({
    setOrigin: vi.fn().mockReturnThis(),
  })

  class Scene {
    readonly add = { text: phaserMocks.text }
    readonly cameras = { main: { setBackgroundColor: vi.fn() } }
    readonly events = { once: vi.fn() }
    readonly game = { canvas: new Canvas() }
    readonly input = {
      keyboard: { on: vi.fn(), off: vi.fn() },
      on: vi.fn(),
      off: vi.fn(),
    }
    readonly scene = { start: vi.fn() }

    constructor(_config: unknown) {}
  }

  phaserMocks.text.mockImplementation(textObject)

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  }
})

import {
  GameServices,
  probeGameCapabilities,
} from '../../src/app/GameServices'
import { TITLE_CONTROLS_TEXT, TitleScene } from '../../src/phaser/scenes/TitleScene'

type TitleHarness = {
  readonly game: {
    readonly canvas: {
      getAttribute(name: string): string | null
    }
  }
  dispose(): void
}

const createTitle = (mobile: boolean): TitleHarness => {
  const services = new GameServices()
  services.enterBootScene()
  services.recordCapabilities({
    mobile,
    localSaveAvailable: true,
    webAudioAvailable: true,
  })
  const scene = new TitleScene(services)
  scene.create()
  return scene as unknown as TitleHarness
}

describe('TitleScene keyboard requirement', () => {
  beforeEach(() => {
    phaserMocks.text.mockClear()
  })

  it('shows an explicit keyboard-required notice to mobile clients', () => {
    const scene = createTitle(true)

    expect(phaserMocks.text).toHaveBeenCalledWith(
      320,
      282,
      'PC KEYBOARD REQUIRED\nTOUCH CONTROLS NOT SUPPORTED',
      expect.objectContaining({ align: 'center' }),
    )
    expect(scene.game.canvas.getAttribute('data-keyboard-required')).toBe('true')
    expect(scene.game.canvas.getAttribute('aria-label')).toMatch(/PC keyboard required/i)

    scene.dispose()

    expect(scene.game.canvas.getAttribute('data-keyboard-required')).toBeNull()
    expect(scene.game.canvas.getAttribute('aria-label')).toBeNull()
  })

  it('keeps the desktop title free of the mobile-only notice', () => {
    createTitle(false)

    expect(
      phaserMocks.text.mock.calls.some((call) =>
        String(call[2]).includes('PC KEYBOARD REQUIRED'),
      ),
    ).toBe(false)
  })

  it('shows every supported keyboard start key', () => {
    createTitle(false)
    expect(phaserMocks.text.mock.calls.some((call) => call[2] === TITLE_CONTROLS_TEXT)).toBe(true)
  })

  it('classifies a coarse pointer as mobile for the title notice contract', () => {
    const capabilities = probeGameCapabilities({
      navigator: { maxTouchPoints: 0, userAgent: 'Desktop Browser' },
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    })

    expect(capabilities.mobile).toBe(true)
  })
})
