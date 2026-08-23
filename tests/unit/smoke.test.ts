import { describe, expect, it } from 'vitest'
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/app/createGame'

describe('game shell', () => {
  it('uses the approved 16:9 logical canvas', () => {
    expect([GAME_WIDTH, GAME_HEIGHT]).toEqual([640, 360])
  })
})
