import {
  type ActionEdge,
  type InputFrame,
  InputBuffer,
  isBufferedActionEdge,
} from '../../domain/combat/inputBuffer'
import { runDoubleTapWindowMs } from '../../domain/combat/tuning'

const movementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

const actionEdgesByCode: Readonly<Record<string, ActionEdge>> = {
  KeyJ: { type: 'attack', limb: 'left-hand' },
  KeyK: { type: 'attack', limb: 'right-hand' },
  KeyL: { type: 'attack', limb: 'left-foot' },
  Semicolon: { type: 'attack', limb: 'right-foot' },
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
  private rightTapStartedAtMs: number | null = null
  private rightTapWasReleased = false
  private runningRight = false

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
    this.expireRightTapWindow()
    const moveX = this.axis('KeyA', 'KeyD')
    const moveY = this.axis('KeyW', 'KeyS')
    const running =
      this.runningRight &&
      moveX === 1 &&
      this.heldMovementCodes.has('KeyD') &&
      !this.heldMovementCodes.has('KeyA')

    return {
      moveX,
      moveY,
      ...(running ? { running: true } : {}),
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

    if (keyboardEvent.code === 'KeyA') {
      this.resetRightRunGesture()
      this.heldMovementCodes.add(keyboardEvent.code)
      return
    }

    if (keyboardEvent.code === 'KeyD') {
      if (!this.heldMovementCodes.has('KeyD')) {
        this.handleRightMovementDown()
      }
      this.heldMovementCodes.add(keyboardEvent.code)
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

    const wasHeld = this.heldMovementCodes.delete(keyboardEvent.code)
    if (keyboardEvent.code === 'KeyD' && wasHeld) {
      if (this.runningRight) {
        this.resetRightRunGesture()
      } else if (this.rightTapStartedAtMs !== null) {
        this.rightTapWasReleased = true
      }
    }
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

  private handleRightMovementDown(): void {
    if (this.heldMovementCodes.has('KeyA')) {
      this.resetRightRunGesture()
      return
    }

    const nowMs = this.domainTimeMs()
    const elapsedMs =
      this.rightTapStartedAtMs === null
        ? Number.POSITIVE_INFINITY
        : nowMs - this.rightTapStartedAtMs
    const isSecondTap =
      this.rightTapWasReleased &&
      elapsedMs >= 0 &&
      elapsedMs <= runDoubleTapWindowMs

    if (isSecondTap) {
      this.runningRight = true
      this.rightTapStartedAtMs = null
      this.rightTapWasReleased = false
      return
    }

    this.runningRight = false
    this.rightTapStartedAtMs = nowMs
    this.rightTapWasReleased = false
  }

  private expireRightTapWindow(): void {
    if (
      !this.runningRight &&
      this.rightTapStartedAtMs !== null &&
      this.domainTimeMs() - this.rightTapStartedAtMs > runDoubleTapWindowMs
    ) {
      this.rightTapStartedAtMs = null
      this.rightTapWasReleased = false
    }
  }

  private domainTimeMs(): number {
    const value = this.getDomainTimeMs()
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }

  private resetRightRunGesture(): void {
    this.rightTapStartedAtMs = null
    this.rightTapWasReleased = false
    this.runningRight = false
  }

  private resetInput(): void {
    this.heldMovementCodes.clear()
    this.pendingEdges.length = 0
    this.resetRightRunGesture()
  }
}
