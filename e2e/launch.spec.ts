import { expect, test, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test'
import { PNG } from 'pngjs'

type BrowserDiagnostics = {
  readonly consoleErrors: string[]
  readonly failedRequests: string[]
  readonly pageErrors: string[]
  readonly responses: Array<{ readonly status: number; readonly url: string }>
}

const isReleaseResource = (response: Response): boolean => {
  const pathname = new URL(response.url()).pathname
  return (
    response.request().resourceType() === 'document' ||
    /\.(?:css|html|ico|js|json|png|wav)$/i.test(pathname)
  )
}

const observeBrowser = (page: Page): BrowserDiagnostics => {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    responses: [],
  }

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error: Error) => diagnostics.pageErrors.push(error.message))
  page.on('requestfailed', (request: Request) => {
    diagnostics.failedRequests.push(
      `${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`,
    )
  })
  page.on('response', (response: Response) => {
    if (isReleaseResource(response)) {
      diagnostics.responses.push({ status: response.status(), url: response.url() })
    }
  })

  return diagnostics
}

const variedPixelCount = (image: Buffer): number => {
  const png = PNG.sync.read(image)
  const [baseRed, baseGreen, baseBlue] = png.data
  let varied = 0

  for (let offset = 0; offset < png.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(png.data[offset] - baseRed),
      Math.abs(png.data[offset + 1] - baseGreen),
      Math.abs(png.data[offset + 2] - baseBlue),
    )
    if (delta > 8) varied += 1
  }

  return varied
}

test('production launch renders the approved canvas and loads every boot asset cleanly', async ({ page }) => {
  const diagnostics = observeBrowser(page)
  const launchStartedAt = Date.now()

  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(async () => variedPixelCount(await canvas.screenshot()), { timeout: 10_000 })
    .toBeGreaterThan(5_000)
  expect(Date.now() - launchStartedAt).toBeLessThan(10_000)
  await page.waitForLoadState('networkidle')

  const geometry = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement
    const rect = target.getBoundingClientRect()
    return {
      logicalHeight: target.height,
      logicalWidth: target.width,
      rect: {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      },
    }
  })

  expect(geometry.logicalWidth).toBe(640)
  expect(geometry.logicalHeight).toBe(360)
  expect(geometry.rect.width).toBeCloseTo(1280, 0)
  expect(geometry.rect.height).toBeCloseTo(720, 0)
  expect(geometry.rect.x).toBeCloseTo(0, 0)
  expect(geometry.rect.y).toBeCloseTo(0, 0)

  const resourcePaths = diagnostics.responses.map(({ url }) => new URL(url).pathname)
  expect(resourcePaths.some((path) => path.endsWith('.js'))).toBe(true)
  expect(resourcePaths.some((path) => path.endsWith('.css'))).toBe(true)
  expect(resourcePaths.some((path) => path.endsWith('.json'))).toBe(true)
  expect(resourcePaths.some((path) => path.endsWith('.png'))).toBe(true)
  expect(resourcePaths.some((path) => path.endsWith('.wav'))).toBe(true)

  const non2xx = diagnostics.responses.filter(({ status }) => status < 200 || status >= 300)
  expect(non2xx).toEqual([])
  expect(
    diagnostics.responses.filter(({ url, status }) =>
      new URL(url).pathname.endsWith('/favicon.ico') && status === 404,
    ),
  ).toEqual([])
  expect(diagnostics.failedRequests).toEqual([])
  expect(diagnostics.pageErrors).toEqual([])
  expect(diagnostics.consoleErrors).toEqual([])
})
