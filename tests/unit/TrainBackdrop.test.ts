import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({ default: {} }))

import { TrainBackdrop } from '../../src/phaser/world/TrainBackdrop'

type FakeObject = {
  readonly kind: 'image' | 'graphics' | 'rectangle'
  readonly args: readonly unknown[]
  visible: boolean
  x: number
  y: number
  alpha: number
  setAlpha(value: number): FakeObject
  setDepth(_value: number): FakeObject
  setDisplaySize(_width: number, _height: number): FakeObject
  setFillStyle(_color: number, _alpha?: number): FakeObject
  setLineStyle(_width: number, _color: number, _alpha?: number): FakeObject
  setPosition(x: number, y: number): FakeObject
  setStrokeStyle(_width: number, _color: number, _alpha?: number): FakeObject
  fillCircle(_x: number, _y: number, _radius: number): FakeObject
  fillRect(_x: number, _y: number, _width: number, _height: number): FakeObject
  fillStyle(_color: number, _alpha?: number): FakeObject
  lineBetween(_x1: number, _y1: number, _x2: number, _y2: number): FakeObject
  lineStyle(_width: number, _color: number, _alpha?: number): FakeObject
  strokeRect(_x: number, _y: number, _width: number, _height: number): FakeObject
  setVisible(value: boolean): FakeObject
  destroy(): void
}

const createFakeScene = (): {
  readonly scene: unknown
  readonly images: FakeObject[]
  readonly graphics: FakeObject[]
  readonly rectangles: FakeObject[]
} => {
  const images: FakeObject[] = []
  const graphics: FakeObject[] = []
  const rectangles: FakeObject[] = []
  const make = (kind: FakeObject['kind'], args: readonly unknown[]): FakeObject => {
    const object = {
      kind,
      args,
      visible: true,
      x: typeof args[0] === 'number' ? args[0] : 0,
      y: typeof args[1] === 'number' ? args[1] : 0,
      alpha: 1,
      setAlpha(value: number) { this.alpha = value; return this },
      setDepth(_value: number) { return this },
      setDisplaySize(_width: number, _height: number) { return this },
      setFillStyle(_color: number, _alpha?: number) { return this },
      setLineStyle(_width: number, _color: number, _alpha?: number) { return this },
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this },
      setStrokeStyle(_width: number, _color: number, _alpha?: number) { return this },
      fillCircle(_x: number, _y: number, _radius: number) { return this },
      fillRect(_x: number, _y: number, _width: number, _height: number) { return this },
      fillStyle(_color: number, _alpha?: number) { return this },
      lineBetween(_x1: number, _y1: number, _x2: number, _y2: number) { return this },
      lineStyle(_width: number, _color: number, _alpha?: number) { return this },
      strokeRect(_x: number, _y: number, _width: number, _height: number) { return this },
      setVisible(value: boolean) { this.visible = value; return this },
      destroy() { this.visible = false },
    } satisfies FakeObject
    return object
  }

  const scene = {
    add: {
      image: (...args: unknown[]) => {
        const object = make('image', args)
        images.push(object)
        return object
      },
      graphics: (...args: unknown[]) => {
        const object = make('graphics', args)
        graphics.push(object)
        return object
      },
      rectangle: (...args: unknown[]) => {
        const object = make('rectangle', args)
        rectangles.push(object)
        return object
      },
    },
  }
  return { scene, images, graphics, rectangles }
}

const pickups = [
  { id: 'repair', itemId: 'repair-kit', position: { x: 176, y: 214 }, consumed: false },
  { id: 'emp', itemId: 'emp', position: { x: 470, y: 292 }, consumed: false },
] as const

describe('TrainBackdrop section projection', () => {
  it('repeats each authored background and static lane decoration at the section stride', () => {
    const fake = createFakeScene()
    new TrainBackdrop(fake.scene as never, pickups, 3, 640)

    expect(fake.images.map((image) => [image.x, image.y])).toEqual([
      [320, 180],
      [960, 180],
      [1_600, 180],
    ])
    expect(fake.rectangles).toHaveLength(3)
    expect(fake.rectangles.map((rectangle) => rectangle.x)).toEqual([320, 960, 1_600])
    expect(new TrainBackdrop(createFakeScene().scene as never, [], 3, 640).snapshot()).toMatchObject({
      sectionCount: 3,
      sectionLandmarkCount: 3,
    })
  })

  it('keeps dynamic platform and warning props in the active section', () => {
    const fake = createFakeScene()
    const backdrop = new TrainBackdrop(fake.scene as never, [], 3, 640)

    backdrop.update(0, 'warning', 334, [], 2)

    expect(backdrop.snapshot()).toMatchObject({ activeSectionIndex: 2, sectionLandmarkCount: 3 })

    const platform = fake.graphics.at(-1)
    expect(platform?.x).toBe(1_614)
    expect(fake.graphics.filter((object) => object.y === 254).map((object) => object.x)).toEqual([
      1_532, 1_556, 1_580, 1_604, 1_628, 1_652,
    ])
  })

  it('preserves the four-argument update and reset APIs for section zero pickups', () => {
    const fake = createFakeScene()
    const backdrop = new TrainBackdrop(fake.scene as never, pickups, 2)

    backdrop.update(500, 'open', 350, pickups)
    expect(fake.graphics.at(-3)?.x).toBe(350)
    expect(backdrop.snapshot()).toMatchObject({ visiblePickupCount: 2 })

    backdrop.update(0, 'safe', 350, [pickups[0], { ...pickups[1], consumed: true }])
    expect(backdrop.snapshot().visiblePickupCount).toBe(1)
    backdrop.reset(pickups)
    expect(fake.graphics.at(-3)?.x).toBe(278)
    expect(backdrop.snapshot()).toMatchObject({ offset: 0, visiblePickupCount: 2 })
  })
})
