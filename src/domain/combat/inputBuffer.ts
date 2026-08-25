import type { LimbInput } from './types'

/** A one-time player action; held movement deliberately does not belong here. */
export type ActionEdge =
  | { type: 'attack'; limb: LimbInput }
  | { type: 'jump' }
  | { type: 'cycle-item' }
  | { type: 'interact-use' }

export type BufferedActionEdge = Extract<ActionEdge, { type: 'attack' | 'jump' }>

export const isBufferedActionEdge = (edge: Readonly<ActionEdge>): edge is BufferedActionEdge =>
  edge.type === 'attack' || edge.type === 'jump'

/** The input sampled by a fixed domain step. */
export interface InputFrame {
  moveX: -1 | 0 | 1
  moveY: -1 | 0 | 1
  /** True only while the second D tap remains held. */
  running?: boolean
  edges: ActionEdge[]
}

export interface BufferedAction {
  sequence: number
  edge: BufferedActionEdge
  enqueuedAtMs: number
  expiresAtMs: number
  attackCandidate?: LimbInput
}

export type BufferedActionMatcher = (entry: Readonly<BufferedAction>) => boolean

export const DEFAULT_ACTION_BUFFER_MS = 180

/**
 * A deterministic, caller-clocked FIFO action buffer.
 *
 * The fixed-step caller supplies domain time for every operation.  This class
 * intentionally has no browser, Phaser, timer, or wall-clock dependency.
 */
export class InputBuffer {
  private readonly entries: BufferedAction[] = []
  private nextSequence = 1

  get size(): number {
    return this.entries.length
  }

  enqueue(
    edge: BufferedActionEdge,
    domainTimeMs: number,
    lifetimeMs = DEFAULT_ACTION_BUFFER_MS,
  ): BufferedAction {
    if (!isBufferedActionEdge(edge)) {
      throw new Error('Only attack and jump edges can enter the combat action buffer.')
    }
    const entry: BufferedAction = {
      sequence: this.nextSequence,
      edge,
      enqueuedAtMs: domainTimeMs,
      expiresAtMs: domainTimeMs + lifetimeMs,
      ...(edge.type === 'attack' ? { attackCandidate: edge.limb } : {}),
    }

    this.nextSequence += 1
    this.entries.push(entry)
    return entry
  }

  /** Removes entries only once domain time is strictly later than their expiry. */
  expire(domainTimeMs: number): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (domainTimeMs > this.entries[index].expiresAtMs) {
        this.entries.splice(index, 1)
      }
    }
  }

  /**
   * Consumes the first non-expired action accepted by `matcher`.
   * Rejected earlier actions stay queued for a future combat state.
   */
  consume(
    domainTimeMs: number,
    matcher: BufferedActionMatcher = () => true,
  ): BufferedAction | undefined {
    this.expire(domainTimeMs)
    const index = this.entries.findIndex((entry) => matcher(entry))
    return index === -1 ? undefined : this.entries.splice(index, 1)[0]
  }

  clear(): void {
    this.entries.length = 0
  }
}
