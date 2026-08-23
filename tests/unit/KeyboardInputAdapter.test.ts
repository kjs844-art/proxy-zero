import { describe, expect, it } from 'vitest'
import { InputBuffer } from '../../src/domain/combat/inputBuffer'
import { KeyboardInputAdapter } from '../../src/phaser/input/KeyboardInputAdapter'

type Listener = (event: FakeKeyboardEvent) => void

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: FakeKeyboardEvent = new FakeKeyboardEvent()): FakeKeyboardEvent {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
    return event
  }
}

class FakeKeyboardEvent {
  defaultPrevented = false

  constructor(
    readonly code = '',
    readonly repeat = false,
  ) {}

  preventDefault(): void {
    this.defaultPrevented = true
  }
}

function createAdapter() {
  const events = new FakeEventTarget()
  const windowBlurTarget = new FakeEventTarget()
  const canvas = new FakeEventTarget() as FakeEventTarget & {
    ownerDocument: { activeElement: unknown; defaultView: unknown }
  }
  const otherElement = {}
  canvas.ownerDocument = { activeElement: canvas, defaultView: windowBlurTarget }
  const buffer = new InputBuffer()
  const adapter = new KeyboardInputAdapter(
    canvas as unknown as HTMLCanvasElement,
    buffer,
    () => 100,
    events as unknown as EventTarget,
  )

  return { adapter, buffer, canvas, events, otherElement, windowBlurTarget }
}

describe('KeyboardInputAdapter', () => {
  it('maps held WASD movement separately from one-key action edges', () => {
    const { adapter, buffer, events } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyW'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyJ'))

    expect(adapter.readFrame()).toEqual({
      moveX: 1,
      moveY: -1,
      edges: [{ type: 'attack', limb: 'right-hand' }],
    })
    expect(buffer.consume(100)).toMatchObject({ edge: { type: 'attack', limb: 'right-hand' } })
  })

  it('ignores repeated keydowns and never combines simultaneous keys into a technique', () => {
    const { adapter, buffer, events } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyJ'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyK'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyJ', true))

    expect(adapter.readFrame().edges).toEqual([
      { type: 'attack', limb: 'right-hand' },
      { type: 'attack', limb: 'left-hand' },
    ])
    expect(buffer.size).toBe(2)
  })

  it('uses KeyboardEvent.code bindings for every action edge', () => {
    const { adapter, events } = createAdapter()
    for (const code of ['KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Space', 'KeyQ', 'KeyE']) {
      events.dispatch('keydown', new FakeKeyboardEvent(code))
    }

    expect(adapter.readFrame().edges).toEqual([
      { type: 'attack', limb: 'right-hand' },
      { type: 'attack', limb: 'left-hand' },
      { type: 'attack', limb: 'right-foot' },
      { type: 'attack', limb: 'left-foot' },
      { type: 'jump' },
      { type: 'cycle-item' },
      { type: 'interact-use' },
    ])
  })

  it('prevents browser defaults and accepts input only while the canvas owns focus', () => {
    const { adapter, buffer, canvas, events, otherElement } = createAdapter()
    const focusedEvent = events.dispatch('keydown', new FakeKeyboardEvent('Space'))

    canvas.ownerDocument.activeElement = otherElement
    const unfocusedEvent = events.dispatch('keydown', new FakeKeyboardEvent('KeyJ'))

    expect(focusedEvent.defaultPrevented).toBe(true)
    expect(unfocusedEvent.defaultPrevented).toBe(false)
    expect(adapter.readFrame().edges).toEqual([{ type: 'jump' }])
    expect(buffer.size).toBe(1)
  })

  it('clears held movement on release, focus reset, and disposal', () => {
    const { adapter, canvas, events } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyA'))
    events.dispatch('keyup', new FakeKeyboardEvent('KeyA'))
    expect(adapter.readFrame().moveX).toBe(0)

    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    canvas.dispatch('blur')
    expect(adapter.readFrame().moveX).toBe(0)

    adapter.dispose()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyW'))
    expect(adapter.readFrame().moveY).toBe(0)
  })

  it('clears held movement when the browser window blurs before keyup arrives', () => {
    const { adapter, events, windowBlurTarget } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame().moveX).toBe(1)

    windowBlurTarget.dispatch('blur')
    expect(adapter.readFrame()).toMatchObject({ moveX: 0, moveY: 0 })
  })
})
