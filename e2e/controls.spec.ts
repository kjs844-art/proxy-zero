import { expect, test, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

type PixelRegion = {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

const changedPixelRatio = (
  before: Buffer,
  after: Buffer,
  region?: PixelRegion,
): number => {
  const left = PNG.sync.read(before)
  const right = PNG.sync.read(after)
  expect({ height: right.height, width: right.width }).toEqual({
    height: left.height,
    width: left.width,
  })

  const bounds = region ?? { x: 0, y: 0, width: left.width, height: left.height }
  let changed = 0
  let total = 0
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const offset = (y * left.width + x) * 4
      const delta = Math.max(
        Math.abs(left.data[offset] - right.data[offset]),
        Math.abs(left.data[offset + 1] - right.data[offset + 1]),
        Math.abs(left.data[offset + 2] - right.data[offset + 2]),
      )
      if (delta > 12) changed += 1
      total += 1
    }
  }
  return total === 0 ? 0 : changed / total
}

const variedPixelCount = (image: Buffer): number => {
  const png = PNG.sync.read(image)
  const [baseRed, baseGreen, baseBlue] = png.data
  let varied = 0
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (Math.max(
      Math.abs(png.data[offset] - baseRed),
      Math.abs(png.data[offset + 1] - baseGreen),
      Math.abs(png.data[offset + 2] - baseBlue),
    ) > 8) varied += 1
  }
  return varied
}

const waitForVisualChange = async (
  canvas: Locator,
  before: Buffer,
  minimumRatio: number,
): Promise<void> => {
  await expect
    .poll(async () => changedPixelRatio(before, await canvas.screenshot()), {
      timeout: 5_000,
    })
    .toBeGreaterThan(minimumRatio)
}

const loadTitle = async (page: Page): Promise<Locator> => {
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.waitForLoadState('networkidle')
  await expect
    .poll(async () => variedPixelCount(await canvas.screenshot()), { timeout: 10_000 })
    .toBeGreaterThan(5_000)
  return canvas
}

const enterCombat = async (page: Page): Promise<{
  readonly canvas: Locator
  readonly combat: Buffer
  readonly select: Buffer
  readonly title: Buffer
}> => {
  const canvas = await loadTitle(page)
  const title = await canvas.screenshot()

  await page.keyboard.press('Enter')
  await waitForVisualChange(canvas, title, 0.03)
  const select = await canvas.screenshot()

  await page.keyboard.press('ArrowRight')
  await waitForVisualChange(canvas, select, 0.002)
  const movedSelection = await canvas.screenshot()

  await page.keyboard.press('Enter')
  await waitForVisualChange(canvas, movedSelection, 0.08)
  const combat = await canvas.screenshot()

  await canvas.click({ position: { x: 640, y: 360 } })
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe('CANVAS')

  return { canvas, combat, select, title }
}

const dispatchCancelableKey = (
  page: Page,
  probe: { readonly code: string; readonly key: string },
): Promise<boolean> =>
  page.evaluate(({ code, key }) => {
    const target = document.activeElement ?? document.body
    const down = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code,
      key,
    })
    target.dispatchEvent(down)
    target.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code, key }),
    )
    return down.defaultPrevented
  }, probe)

test('title, fighter select, combat, and every Stage 1 control respond through the canvas', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const { canvas, combat, select, title } = await enterCombat(page)
  expect(changedPixelRatio(title, select)).toBeGreaterThan(0.03)
  expect(changedPixelRatio(select, combat)).toBeGreaterThan(0.08)

  const recognizedKeys = [
    { code: 'KeyW', key: 'w' },
    { code: 'KeyA', key: 'a' },
    { code: 'KeyS', key: 's' },
    { code: 'KeyD', key: 'd' },
    { code: 'Space', key: ' ' },
    { code: 'KeyJ', key: 'j' },
    { code: 'KeyK', key: 'k' },
    { code: 'KeyL', key: 'l' },
    { code: 'Semicolon', key: ';' },
    { code: 'KeyQ', key: 'q' },
    { code: 'KeyE', key: 'e' },
  ] as const

  for (const probe of recognizedKeys) {
    expect(await dispatchCancelableKey(page, probe), probe.code).toBe(true)
  }

  for (const key of ['w', 'a', 's', 'd', 'Space', 'j', 'k', 'l', ';', 'q', 'e']) {
    await page.keyboard.press(key)
  }
  await page.waitForTimeout(150)
  await expect(canvas).toBeVisible()

  await page.evaluate(() => {
    document.body.tabIndex = -1
    document.body.focus()
  })
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe('CANVAS')
  for (const probe of [recognizedKeys[0], recognizedKeys[4], recognizedKeys[5]]) {
    expect(await dispatchCancelableKey(page, probe), `${probe.code} outside canvas focus`).toBe(false)
  }

  expect(runtimeErrors).toEqual([])
})

test('blur and visibility loss pause the rendered arena until the canvas really regains focus', async ({ page }) => {
  const { canvas } = await enterCombat(page)
  const background = { x: 0, y: 70, width: 1280, height: 210 }

  await page.keyboard.down('d')
  await page.waitForTimeout(120)
  await page.evaluate(() => {
    const target = document.querySelector('canvas')
    target?.blur()
    window.dispatchEvent(new Event('blur'))
  })
  const pausedBefore = await canvas.screenshot()
  await page.waitForTimeout(500)
  const pausedAfter = await canvas.screenshot()
  expect(changedPixelRatio(pausedBefore, pausedAfter, background)).toBeLessThan(0.02)

  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(250)
  const windowOnlyFocus = await canvas.screenshot()
  expect(changedPixelRatio(pausedAfter, windowOnlyFocus, background)).toBeLessThan(0.02)
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .not.toBe('CANVAS')

  await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement | null)?.focus())
  const resumeFrame = await canvas.screenshot()
  await page.waitForTimeout(40)
  const firstResumedFrame = await canvas.screenshot()
  expect(changedPixelRatio(resumeFrame, firstResumedFrame, background)).toBeLessThan(0.04)
  await page.keyboard.up('d')

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hiddenBefore = await canvas.screenshot()
  await page.waitForTimeout(500)
  const hiddenAfter = await canvas.screenshot()
  expect(changedPixelRatio(hiddenBefore, hiddenAfter, background)).toBeLessThan(0.02)

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(canvas).toBeVisible()
})
