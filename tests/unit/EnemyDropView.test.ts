import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({ default: {} }))

import type { ItemPickupSnapshot } from '../../src/domain/items/itemReducer'
import { EnemyDropView } from '../../src/phaser/world/EnemyDropView'

interface DrawCall {
  readonly method: string
  readonly args: readonly number[]
}

class FakeGraphics {
  readonly calls: DrawCall[] = []
  alpha = 1
  depth = 0
  destroyed = false
  visible = true
  x = 0
  y = 0

  private record(method: string, ...args: number[]): this {
    this.calls.push({ method, args })
    return this
  }

  fillCircle(...args: number[]): this { return this.record('fillCircle', ...args) }
  fillRect(...args: number[]): this { return this.record('fillRect', ...args) }
  fillStyle(...args: number[]): this { return this.record('fillStyle', ...args) }
  lineBetween(...args: number[]): this { return this.record('lineBetween', ...args) }
  lineStyle(...args: number[]): this { return this.record('lineStyle', ...args) }
  strokeRect(...args: number[]): this { return this.record('strokeRect', ...args) }
  setAlpha(value: number): this { this.alpha = value; return this }
  setDepth(value: number): this { this.depth = value; return this }
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this }
  setVisible(value: boolean): this { this.visible = value; return this }
  destroy(): void { this.destroyed = true; this.visible = false }
}

const fakeScene = (): { readonly scene: unknown; readonly graphics: FakeGraphics[] } => {
  const graphics: FakeGraphics[] = []
  return {
    graphics,
    scene: {
      add: {
        graphics: () => {
          const object = new FakeGraphics()
          graphics.push(object)
          return object
        },
      },
    },
  }
}

const pickup = (
  id: string,
  itemId: ItemPickupSnapshot['itemId'],
  x: number,
  y: number,
  consumed = false,
): ItemPickupSnapshot => ({ id, itemId, position: { x, y }, consumed })

describe('EnemyDropView', () => {
  it('dynamically draws a green-cross repair crate and cyan EMP can, then bobs and hides them', () => {
    const host = fakeScene()
    const view = new EnemyDropView(host.scene as never)
    const repair = pickup('repair-drop', 'repair-kit', 100, 220)
    const emp = pickup('emp-drop', 'emp', 300, 240)

    view.update(0, [repair])
    view.update(275, [repair, emp])

    expect(view.snapshot()).toMatchObject({
      ownedObjectCount: 2,
      pickupObjectCount: 2,
      visiblePickupCount: 2,
    })
    expect(host.graphics[0].calls).toContainEqual({ method: 'fillStyle', args: [0x4ade80, 0.96] })
    expect(host.graphics[0].calls).toContainEqual({ method: 'fillRect', args: [-6, -2, 12, 4] })
    expect(host.graphics[0].calls).toContainEqual({ method: 'fillRect', args: [-2, -6, 4, 12] })
    expect(host.graphics[1].calls).toContainEqual({ method: 'fillStyle', args: [0x22d3ee, 0.14] })
    expect(host.graphics[1].calls.filter((call) => call.method === 'fillCircle')).toHaveLength(3)

    const priorY = host.graphics[0].y
    const priorAlpha = host.graphics[0].alpha
    view.update(180, [{ ...repair, consumed: true }, emp])
    expect(host.graphics[0].visible).toBe(false)
    expect(host.graphics[0].y).not.toBe(priorY)
    expect(host.graphics[0].alpha).not.toBe(priorAlpha)
    expect(view.snapshot().visiblePickupCount).toBe(1)
  })

  it('synchronizes moving/runtime pickups and destroys stale objects on reset or dispose', () => {
    const host = fakeScene()
    const view = new EnemyDropView(host.scene as never)
    const repair = pickup('repair-drop', 'repair-kit', 100, 220)
    const emp = pickup('emp-drop', 'emp', 300, 240)

    view.update(100, [repair, emp])
    const firstRepairObject = host.graphics[0]
    view.update(0, [{ ...repair, position: { x: 180, y: 260 } }])

    expect(firstRepairObject.x).toBe(180)
    expect(firstRepairObject.depth).toBe(262)
    expect(host.graphics[1].destroyed).toBe(true)
    expect(view.snapshot()).toMatchObject({ ownedObjectCount: 1, pickupObjectCount: 1 })

    view.reset([emp])
    expect(firstRepairObject.destroyed).toBe(true)
    expect(view.snapshot()).toMatchObject({
      elapsedMs: 0,
      ownedObjectCount: 1,
      visiblePickupCount: 1,
    })

    view.dispose()
    expect(host.graphics.at(-1)?.destroyed).toBe(true)
    expect(view.snapshot()).toEqual({
      elapsedMs: 0,
      ownedObjectCount: 0,
      pickupObjectCount: 0,
      visiblePickupCount: 0,
    })
  })
})
