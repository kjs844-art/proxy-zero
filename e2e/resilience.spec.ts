import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

const BASE_URL = 'http://127.0.0.1:4178'
const CHECKPOINT_KEY = 'proxy-zero:checkpoint:v2'

const changedPixelRatio = (before: Buffer, after: Buffer): number => {
  const left = PNG.sync.read(before)
  const right = PNG.sync.read(after)
  expect({ height: right.height, width: right.width }).toEqual({
    height: left.height,
    width: left.width,
  })

  let changed = 0
  for (let offset = 0; offset < left.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(left.data[offset] - right.data[offset]),
      Math.abs(left.data[offset + 1] - right.data[offset + 1]),
      Math.abs(left.data[offset + 2] - right.data[offset + 2]),
    )
    if (delta > 12) changed += 1
  }
  return changed / (left.width * left.height)
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

const loadTitle = async (page: Page, url = '/'): Promise<Locator> => {
  await page.goto(url)
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.waitForLoadState('networkidle')
  await expect
    .poll(async () => variedPixelCount(await canvas.screenshot()), { timeout: 10_000 })
    .toBeGreaterThan(5_000)
  return canvas
}

const enterCombatFromTitle = async (page: Page, canvas: Locator): Promise<void> => {
  const title = await canvas.screenshot()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => changedPixelRatio(title, await canvas.screenshot()))
    .toBeGreaterThan(0.03)

  const select = await canvas.screenshot()
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => changedPixelRatio(select, await canvas.screenshot()))
    .toBeGreaterThan(0.08)

  await canvas.click({ position: { x: 640, y: 360 } })
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe('CANVAS')
}

const enterCombat = async (page: Page): Promise<Locator> => {
  const canvas = await loadTitle(page)
  await enterCombatFromTitle(page, canvas)
  return canvas
}

const readLoadedJavaScript = (page: Page): Promise<string> =>
  page.evaluate(async () => {
    const resourceUrls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname.endsWith('.js'))
    const scriptUrls = Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean)
    const urls = [...new Set([...resourceUrls, ...scriptUrls])]
    return (await Promise.all(urls.map((url) => fetch(url).then((response) => response.text())))).join('\n')
  })

for (const invalidCheckpoint of [
  { name: 'corrupt JSON', value: '{not-json' },
  {
    name: 'unsupported schema',
    value: JSON.stringify({
      schemaVersion: 999,
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
      inventory: { counts: { emp: 0, 'repair-kit': 0 }, selectedItemId: null },
    }),
  },
] as const) {
  test(`${invalidCheckpoint.name} checkpoint survives reload and is replaced by a playable run`, async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    await page.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: CHECKPOINT_KEY, value: invalidCheckpoint.value },
    )

    await loadTitle(page)
    await page.reload()
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10_000 })
    await page.waitForLoadState('networkidle')
    await enterCombatFromTitle(page, canvas)

    const recovered = await page.evaluate((key) => {
      const value = window.localStorage.getItem(key)
      return value === null ? null : JSON.parse(value)
    }, CHECKPOINT_KEY)
    expect(recovered).toMatchObject({
      schemaVersion: 2,
      characterId: 'han',
      zoneId: 'n9-depot',
      zoneStartWaveId: 'n9-depot-wave-1',
    })
    expect(runtimeErrors).toEqual([])
  })
}

test('audio permission rejection cannot block combat, focus recovery, or keyboard input', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const rejectPlayback = () =>
      Promise.reject(new DOMException('E2E intentionally blocked playback.', 'NotAllowedError'))
    const host = window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }
    for (const constructor of [window.AudioContext, host.webkitAudioContext]) {
      if (constructor?.prototype) {
        Object.defineProperty(constructor.prototype, 'resume', {
          configurable: true,
          value: rejectPlayback,
        })
      }
    }
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: rejectPlayback,
    })
  })

  const canvas = await enterCombat(page)
  await page.evaluate(() => {
    const target = document.querySelector('canvas') as HTMLCanvasElement | null
    target?.blur()
    window.dispatchEvent(new Event('blur'))
    target?.focus()
    window.dispatchEvent(new Event('focus'))
  })
  await page.waitForTimeout(100)

  const prevented = await page.evaluate(() => {
    const target = document.activeElement ?? document.body
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyJ',
      key: 'j',
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(true)
  await expect(canvas).toBeVisible()
  const expectedPlaybackDenials = runtimeErrors.filter((message) =>
    message.includes('E2E intentionally blocked playback.'),
  )
  expect(expectedPlaybackDenials.length).toBeGreaterThan(0)
  expect(
    runtimeErrors.filter((message) =>
      !message.includes('E2E intentionally blocked playback.'),
    ),
  ).toEqual([])
})

test('reloading mid-combat returns to a clean, playable start flow', async ({ page }) => {
  const canvas = await loadTitle(page)
  const originalTitle = await canvas.screenshot()
  await enterCombatFromTitle(page, canvas)
  const combat = await canvas.screenshot()
  expect(changedPixelRatio(originalTitle, combat)).toBeGreaterThan(0.08)

  await page.reload()
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.waitForLoadState('networkidle')
  const reloadedTitle = await canvas.screenshot()
  expect(changedPixelRatio(originalTitle, reloadedTitle)).toBeLessThan(0.01)

  await enterCombatFromTitle(page, canvas)
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key)
        return raw === null ? null : (JSON.parse(raw) as { zoneId?: string }).zoneId
      }, CHECKPOINT_KEY),
    )
    .toBe('n9-depot')
})

test('touch and coarse-pointer clients receive an explicit keyboard-required title notice', async ({
  browser,
  page,
}) => {
  const desktopCanvas = await loadTitle(page)
  const desktopTitle = await desktopCanvas.screenshot()

  const mobileContext = await (browser as Browser).newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    hasTouch: true,
    userAgent: 'PROXY-ZERO-E2E Mobile Touch Client',
  })
  try {
    const mobilePage = await mobileContext.newPage()
    const mobileCanvas = await loadTitle(mobilePage, BASE_URL)
    const mobileTitle = await mobileCanvas.screenshot()
    const marker = await mobileCanvas.evaluate((element) => ({
      aria: element.getAttribute('aria-label'),
      required: element.getAttribute('data-keyboard-required'),
    }))

    expect(
      marker.required === 'true' ||
        /keyboard/i.test(`${marker.required ?? ''} ${marker.aria ?? ''}`),
    ).toBe(true)
    expect(changedPixelRatio(desktopTitle, mobileTitle)).toBeGreaterThan(0.0005)
    expect(await readLoadedJavaScript(mobilePage)).toMatch(/keyboard/i)
  } finally {
    await mobileContext.close()
  }
})

test('release JavaScript has no Backquote route and the key cannot clear N-9 Depot', async ({ page }) => {
  await enterCombat(page)
  const releaseJavaScript = await readLoadedJavaScript(page)
  expect(releaseJavaScript).not.toContain('Backquote')

  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key)
        return raw === null ? null : (JSON.parse(raw) as { zoneId?: string }).zoneId
      }, CHECKPOINT_KEY),
    )
    .toBe('n9-depot')

  await page.keyboard.press('Backquote')
  await page.waitForTimeout(2_100)
  const zoneAfterBackquote = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as { zoneId?: string }).zoneId
  }, CHECKPOINT_KEY)
  expect(zoneAfterBackquote).toBe('n9-depot')
})
