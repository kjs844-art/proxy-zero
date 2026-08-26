import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4178'
const configuredExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim()

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Phaser/WebGL startup is intentionally serialized so release checks do not
  // compete for the same GPU process and mistake an allocated blank canvas for
  // the first meaningful frame.
  workers: 1,
  // Pixel-diff screenshots are intentionally heavyweight on the submission
  // laptop. Give them enough room without changing any in-game timing.
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: configuredExecutable
      ? { executablePath: configuredExecutable }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command:
      'npm run build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
