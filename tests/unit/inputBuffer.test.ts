import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTION_BUFFER_MS,
  InputBuffer,
  type ActionEdge,
} from '../../src/domain/combat/inputBuffer'

const jump: ActionEdge = { type: 'jump' }
const rightHand: ActionEdge = { type: 'attack', limb: 'right-hand' }
const leftHand: ActionEdge = { type: 'attack', limb: 'left-hand' }

describe('InputBuffer', () => {
  it('keeps accepted actions in FIFO order and records attack candidates', () => {
    const buffer = new InputBuffer()
    buffer.enqueue(jump, 10)
    buffer.enqueue(rightHand, 20)

    expect(buffer.consume(20)).toMatchObject({ sequence: 1, edge: jump })
    expect(buffer.consume(20)).toMatchObject({
      sequence: 2,
      edge: rightHand,
      attackCandidate: 'right-hand',
    })
  })

  it('uses the default 180 ms action lifetime', () => {
    const entry = new InputBuffer().enqueue(jump, 1_000)

    expect(DEFAULT_ACTION_BUFFER_MS).toBe(180)
    expect(entry.expiresAtMs).toBe(1_180)
  })

  it('honours explicit 140 ms and 220 ms attack lifetimes at their boundaries', () => {
    const buffer = new InputBuffer()
    buffer.enqueue(rightHand, 0, 140)
    buffer.enqueue(leftHand, 0, 220)

    expect(buffer.consume(140)).toMatchObject({ edge: rightHand })
    expect(buffer.consume(220)).toMatchObject({ edge: leftHand })
  })

  it('allows consumption at expiry and removes an action only after expiry', () => {
    const buffer = new InputBuffer()
    buffer.enqueue(jump, 100)

    expect(buffer.consume(280)).toMatchObject({ edge: jump })
    buffer.enqueue(jump, 100)
    expect(buffer.consume(281)).toBeUndefined()
  })

  it('does not age actions while the fixed-step caller supplies paused domain time', () => {
    const buffer = new InputBuffer()
    buffer.enqueue(jump, 500)

    expect(buffer.consume(500)).toMatchObject({ edge: jump })
  })

  it('leaves unaccepted earlier actions available while consuming the first accepted action', () => {
    const buffer = new InputBuffer()
    buffer.enqueue(jump, 0)
    buffer.enqueue(rightHand, 1)

    expect(buffer.consume(1, (entry) => entry.edge.type === 'attack')).toMatchObject({
      edge: rightHand,
    })
    expect(buffer.consume(1)).toMatchObject({ edge: jump })
  })
})
