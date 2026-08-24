import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => {
  class Scene {
    readonly scene = { start: vi.fn() }
    readonly cameras = { main: { setBackgroundColor: vi.fn() } }
    readonly add = {
      text: vi.fn(() => ({
        setOrigin: vi.fn().mockReturnThis(),
      })),
    }
    readonly input = {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    }
    readonly events = { once: vi.fn() }

    constructor(_config: unknown) {}
  }

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  }
})

import { GameServices, SCENE_KEYS } from '../../src/app/GameServices'
import { ResultsScene } from '../../src/phaser/scenes/ResultsScene'

type ResultsHarness = ResultsScene & {
  add: {
    text: ReturnType<typeof vi.fn>
  }
  input: {
    keyboard: {
      on: ReturnType<typeof vi.fn>
      off: ReturnType<typeof vi.fn>
    }
  }
  scene: {
    start: ReturnType<typeof vi.fn>
  }
}

const completedRecord = {
  outcome: 'mission-clear' as const,
  characterId: 'han' as const,
  activeTimeMs: 540_000,
  score: 15_000,
  maxCombo: 10,
  hitsTaken: 4,
  continueUsed: false,
  rank: 'S' as const,
}

const createHarness = (): {
  services: GameServices
  scene: ResultsHarness
  dispatch: (code: string, repeat?: boolean) => ReturnType<typeof vi.fn>
} => {
  const services = new GameServices()
  services.enterBootScene()
  services.enterScene(SCENE_KEYS.Title)
  services.enterScene(SCENE_KEYS.CharacterSelect)
  services.confirmCharacter('han', 0)
  services.enterScene(SCENE_KEYS.Combat)
  services.completeRun(completedRecord)

  const scene = new ResultsScene(services) as ResultsHarness
  scene.create()
  const keydownCall = scene.input.keyboard.on.mock.calls.find(
    ([eventName]) => eventName === 'keydown',
  )
  if (!keydownCall) throw new Error('Expected ResultsScene keydown handler.')
  const handler = keydownCall[1] as (event: KeyboardEvent) => void

  return {
    services,
    scene,
    dispatch: (code, repeat = false) => {
      const preventDefault = vi.fn()
      handler({ code, repeat, preventDefault } as unknown as KeyboardEvent)
      return preventDefault
    },
  }
}

describe('ResultsScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lays out all seven result values inside the protected 640x360 frame', () => {
    const { scene } = createHarness()
    const calls = scene.add.text.mock.calls as unknown as readonly (
      readonly [number, number, string, unknown]
    )[]
    const visibleCopy = calls.map(([, , copy]) => copy)

    expect(visibleCopy).toEqual(expect.arrayContaining([
      'PROXY ZERO // AFTER ACTION',
      'MISSION CLEAR',
      'S',
      'TIME',
      '09:00.000',
      'SCORE',
      '15,000',
      'MAX COMBO',
      '10',
      'HITS TAKEN',
      '4',
      'CONTINUE',
      'NO',
      'ENTER / J  RETRY    ESC / T  TITLE',
    ]))
    for (const [x, y] of calls) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(640)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(360)
    }
  })

  it.each(['Enter', 'Space', 'KeyJ'])('maps %s to immediate retry', (code) => {
    const { dispatch, scene, services } = createHarness()
    const prepareImmediateRetry = vi.spyOn(services, 'prepareImmediateRetry')

    const preventDefault = dispatch(code)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(prepareImmediateRetry).toHaveBeenCalledOnce()
    expect(services.completedRun).toBeNull()
    expect(services.selectedCharacter).toBe('han')
    expect(scene.scene.start).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Combat)
  })

  it.each(['Escape', 'KeyT'])('maps %s to Title', (code) => {
    const { dispatch, scene, services } = createHarness()
    const prepareImmediateRetry = vi.spyOn(services, 'prepareImmediateRetry')

    const preventDefault = dispatch(code)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(prepareImmediateRetry).not.toHaveBeenCalled()
    expect(services.completedRun).toEqual(completedRecord)
    expect(scene.scene.start).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Title)
  })

  it('ignores repeated keydown and blocks duplicate terminal transitions', () => {
    const { dispatch, scene, services } = createHarness()
    const prepareImmediateRetry = vi.spyOn(services, 'prepareImmediateRetry')

    expect(dispatch('Enter', true)).not.toHaveBeenCalled()
    expect(scene.scene.start).not.toHaveBeenCalled()
    expect(services.completedRun).toEqual(completedRecord)

    dispatch('Enter')
    dispatch('Escape')

    expect(prepareImmediateRetry).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledOnce()
    expect(scene.scene.start).toHaveBeenCalledWith(SCENE_KEYS.Combat)
  })

  it('removes the keyboard listener on shutdown', () => {
    const { scene } = createHarness()
    const shutdownCall = (
      scene as unknown as { events: { once: ReturnType<typeof vi.fn> } }
    ).events.once.mock.calls.find(([eventName]) => eventName === 'shutdown')
    if (!shutdownCall) throw new Error('Expected ResultsScene shutdown handler.')

    const dispose = shutdownCall[1] as () => void
    dispose.call(scene)

    expect(scene.input.keyboard.off).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
