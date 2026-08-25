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
  let domainTimeMs = 100
  const adapter = new KeyboardInputAdapter(
    canvas as unknown as HTMLCanvasElement,
    buffer,
    () => domainTimeMs,
    events as unknown as EventTarget,
  )

  return {
    adapter,
    buffer,
    canvas,
    events,
    otherElement,
    windowBlurTarget,
    setDomainTimeMs: (value: number) => { domainTimeMs = value },
  }
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
      edges: [{ type: 'attack', limb: 'left-hand' }],
    })
    expect(buffer.consume(100)).toMatchObject({ edge: { type: 'attack', limb: 'left-hand' } })
  })

  it('ignores repeated keydowns and never combines simultaneous keys into a technique', () => {
    const { adapter, buffer, events } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyJ'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyK'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyJ', true))

    expect(adapter.readFrame().edges).toEqual([
      { type: 'attack', limb: 'left-hand' },
      { type: 'attack', limb: 'right-hand' },
    ])
    expect(buffer.size).toBe(2)
  })

  it('uses KeyboardEvent.code bindings for every action edge', () => {
    const { adapter, buffer, events } = createAdapter()
    for (const code of ['KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Space', 'KeyQ', 'KeyE']) {
      events.dispatch('keydown', new FakeKeyboardEvent(code))
    }

    expect(adapter.readFrame().edges).toEqual([
      { type: 'attack', limb: 'left-hand' },
      { type: 'attack', limb: 'right-hand' },
      { type: 'attack', limb: 'left-foot' },
      { type: 'attack', limb: 'right-foot' },
      { type: 'jump' },
      { type: 'cycle-item' },
      { type: 'interact-use' },
    ])
    expect(buffer.size).toBe(5)
  })

  it('delivers Q/E once in capture order without ever entering the combo buffer', () => {
    const { adapter, buffer, events } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyQ'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyE'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyQ'))

    expect(adapter.readFrame().edges).toEqual([
      { type: 'cycle-item' },
      { type: 'interact-use' },
      { type: 'cycle-item' },
    ])
    expect(adapter.readFrame().edges).toEqual([])
    expect(buffer.size).toBe(0)
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

  it('walks on the first D tap and runs while an in-window second tap is held', () => {
    const { adapter, events, setDomainTimeMs } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame()).toEqual({ moveX: 1, moveY: 0, edges: [] })

    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(350)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))

    expect(adapter.readFrame()).toEqual({
      moveX: 1,
      moveY: 0,
      running: true,
      edges: [],
    })
    expect(adapter.readFrame().running).toBe(true)

    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame()).toEqual({ moveX: 0, moveY: 0, edges: [] })
  })

  it('does not run when the second D tap arrives after 250 domain milliseconds', () => {
    const { adapter, events, setDomainTimeMs } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(351)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))

    expect(adapter.readFrame()).toEqual({ moveX: 1, moveY: 0, edges: [] })
  })

  it('requires a release and never treats key repeat as the second D tap', () => {
    const { adapter, events, setDomainTimeMs } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(150)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame()).toEqual({ moveX: 1, moveY: 0, edges: [] })

    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(200)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD', true))
    expect(adapter.readFrame()).toEqual({ moveX: 0, moveY: 0, edges: [] })

    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame().running).toBe(true)
  })

  it('cancels running on A and does not resume it when A is released', () => {
    const { adapter, events, setDomainTimeMs } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(200)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame().running).toBe(true)

    events.dispatch('keydown', new FakeKeyboardEvent('KeyA'))
    expect(adapter.readFrame()).toEqual({ moveX: 0, moveY: 0, edges: [] })
    events.dispatch('keyup', new FakeKeyboardEvent('KeyA'))
    expect(adapter.readFrame()).toEqual({ moveX: 1, moveY: 0, edges: [] })
  })

  it('keeps vertical input during a right-running diagonal and resets the gesture on clear', () => {
    const { adapter, events, setDomainTimeMs } = createAdapter()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    events.dispatch('keyup', new FakeKeyboardEvent('KeyD'))
    setDomainTimeMs(200)
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    events.dispatch('keydown', new FakeKeyboardEvent('KeyW'))
    expect(adapter.readFrame()).toEqual({
      moveX: 1,
      moveY: -1,
      running: true,
      edges: [],
    })

    adapter.clear()
    events.dispatch('keydown', new FakeKeyboardEvent('KeyD'))
    expect(adapter.readFrame()).toEqual({ moveX: 1, moveY: 0, edges: [] })
  })
})
