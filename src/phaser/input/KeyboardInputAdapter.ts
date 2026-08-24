import {
  type ActionEdge,
  type InputFrame,
  InputBuffer,
  isBufferedActionEdge,
} from '../../domain/combat/inputBuffer'

const movementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

const actionEdgesByCode: Readonly<Record<string, ActionEdge>> = {
  KeyJ: { type: 'attack', limb: 'right-hand' },
  KeyK: { type: 'attack', limb: 'left-hand' },
  KeyL: { type: 'attack', limb: 'right-foot' },
  Semicolon: { type: 'attack', limb: 'left-foot' },
  Space: { type: 'jump' },
  KeyQ: { type: 'cycle-item' },
  KeyE: { type: 'interact-use' },
}

/**
 * Browser-only input collection. It maps physical key codes to raw domain
 * edges and never attempts to recognize attacks, combos, or gameplay state.
 */
export class KeyboardInputAdapter {
  private readonly heldMovementCodes = new Set<string>()
  private readonly pendingEdges: ActionEdge[] = []
  private readonly listenerTarget: EventTarget
  private readonly windowBlurTarget: EventTarget

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly inputBuffer: InputBuffer,
    private readonly getDomainTimeMs: () => number,
    eventTarget?: EventTarget,
  ) {
    this.listenerTarget = eventTarget ?? canvas.ownerDocument
    this.windowBlurTarget = canvas.ownerDocument.defaultView ?? canvas
    this.listenerTarget.addEventListener('keydown', this.onKeyDown)
    this.listenerTarget.addEventListener('keyup', this.onKeyUp)
    this.windowBlurTarget.addEventListener('blur', this.onFocusReset)
    this.canvas.addEventListener('blur', this.onFocusReset)
  }

  /** Returns and clears edges captured since the previous domain input sample. */
  readFrame(): InputFrame {
    const moveX = this.axis('KeyA', 'KeyD')
    const moveY = this.axis('KeyW', 'KeyS')

    return {
      moveX,
      moveY,
      edges: this.pendingEdges.splice(0),
    }
  }

  /** Focus/visibility owner hook; clears held movement and queued raw edges. */
  clear(): void {
    this.resetInput()
  }

  /** Clears input state and removes every listener owned by this adapter. */
  dispose(): void {
    this.listenerTarget.removeEventListener('keydown', this.onKeyDown)
    this.listenerTarget.removeEventListener('keyup', this.onKeyUp)
    this.windowBlurTarget.removeEventListener('blur', this.onFocusReset)
    this.canvas.removeEventListener('blur', this.onFocusReset)
    this.resetInput()
  }

  private readonly onKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent
    if (!this.canvasOwnsFocus()) {
      return
    }

    const edge = actionEdgesByCode[keyboardEvent.code]
    const isRecognized = movementCodes.has(keyboardEvent.code) || edge !== undefined
    if (!isRecognized) {
      return
    }

    keyboardEvent.preventDefault()
    if (keyboardEvent.repeat) {
      return
    }

    if (movementCodes.has(keyboardEvent.code)) {
      this.heldMovementCodes.add(keyboardEvent.code)
      return
    }

    this.pendingEdges.push(edge)
    if (isBufferedActionEdge(edge)) {
      this.inputBuffer.enqueue(edge, this.getDomainTimeMs())
    }
  }

  private readonly onKeyUp = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent
    if (!movementCodes.has(keyboardEvent.code)) {
      return
    }

    this.heldMovementCodes.delete(keyboardEvent.code)
    if (this.canvasOwnsFocus()) {
      keyboardEvent.preventDefault()
    }
  }

  private readonly onFocusReset = (): void => {
    this.resetInput()
  }

  private axis(negativeCode: string, positiveCode: string): -1 | 0 | 1 {
    const negative = this.heldMovementCodes.has(negativeCode)
    const positive = this.heldMovementCodes.has(positiveCode)
    return negative === positive ? 0 : negative ? -1 : 1
  }

  private canvasOwnsFocus(): boolean {
    return this.canvas.ownerDocument.activeElement === this.canvas
  }

  private resetInput(): void {
    this.heldMovementCodes.clear()
    this.pendingEdges.length = 0
  }
}
