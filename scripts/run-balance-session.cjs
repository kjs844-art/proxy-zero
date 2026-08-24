const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require('playwright')

const repo = path.resolve(__dirname, '..')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const baseUrl = process.env.PROXY_ZERO_BALANCE_URL || 'http://127.0.0.1:4178/'
const outputDirectory = path.resolve(
  process.env.PROXY_ZERO_BALANCE_OUTPUT || path.join(repo, 'artifacts', 'balance'),
)
const runKind = process.env.PROXY_ZERO_BALANCE_RUN_KIND || 'clear'
const videoSmokeOnly = process.argv.includes('--video-smoke')
const smokeOnly = process.argv.includes('--smoke') || videoSmokeOnly
const expectedCharacter = process.env.PROXY_ZERO_BALANCE_CHARACTER?.toLowerCase() || null
const captureVideo = videoSmokeOnly || (
  process.env.PROXY_ZERO_CAPTURE_VIDEO === '1' && !smokeOnly
)

if (!['clear', 'failure'].includes(runKind)) {
  throw new Error('PROXY_ZERO_BALANCE_RUN_KIND must be "clear" or "failure".')
}
if (!smokeOnly && runKind === 'clear' && !['han', 'mina', 'jin'].includes(expectedCharacter)) {
  throw new Error('Clear runs require PROXY_ZERO_BALANCE_CHARACTER=han, mina, or jin.')
}

const observedUrl = new URL(baseUrl)
observedUrl.searchParams.set('qa', 'balance')
const staysInsideOutput = (candidatePath) => {
  const relativePath = path.relative(outputDirectory, candidatePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
  const workingTreeStatus = execFileSync('git', ['status', '--porcelain'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
  if (!smokeOnly && workingTreeStatus !== '') {
    throw new Error('Official balance runs require a clean, frozen Git commit.')
  }
  const videoTempDirectory = path.join(outputDirectory, '.video-temp')
  if (captureVideo) fs.mkdirSync(videoTempDirectory, { recursive: true })
  const browser = await chromium.launch({ executablePath, headless: false })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    ...(captureVideo ? {
      recordVideo: {
        dir: videoTempDirectory,
        size: { width: 1280, height: 720 },
      },
    } : {}),
  })
  const page = await context.newPage()
  const gameplayVideo = captureVideo ? page.video() : null
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(observedUrl.href, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForFunction(() => Boolean(
    window.__PZ_BALANCE_GAME__ && window.__PZ_BALANCE_BUILD__,
  ), undefined, {
    timeout: 10_000,
  })
  const observedBuild = await page.evaluate(() => ({ ...window.__PZ_BALANCE_BUILD__ }))
  if (!smokeOnly && observedBuild.commit !== commit) {
    throw new Error(`Preview build ${observedBuild.commit} does not match Git HEAD ${commit}.`)
  }
  if (!smokeOnly && observedBuild.dirty !== false) {
    throw new Error('Official balance runs require a preview built from a clean commit.')
  }
  await page.evaluate(() => {
    window.__PZ_BALANCE__ = {
      completedWindowCount: 0,
      debugClearUsed: false,
      events: [],
      frameCount: 0,
      lastActiveScene: null,
      lastContinueUsed: null,
      lastLives: null,
      lastStatus: null,
      lowEffectActivated: false,
      lowestWindowFps: null,
      partialWindowsDiscarded: 0,
      sampledDeltaMs: 0,
      windowDeltaMs: 0,
      windowFrameEquivalent: 0,
      wrapped: false,
      wrappedAtActiveTimeMs: null,
    }
    const game = window.__PZ_BALANCE_GAME__
    const scenes = game?.scene?.scenes ?? []
    const combat = scenes.find((scene) => scene.sys?.settings?.key === 'Combat')
    const governor = combat?.performanceGovernor
    if (!combat || !governor) {
      throw new Error('Combat performance governor is unavailable before observer readiness.')
    }
    const metrics = window.__PZ_BALANCE__
    const originalSample = governor.sample
    const originalResetSampling = governor.resetSampling
    governor.sample = function observedSample(deltaMs) {
      const mode = originalSample.call(this, deltaMs)
      if (Number.isFinite(deltaMs) && deltaMs > 0) {
        metrics.frameCount += 1
        metrics.sampledDeltaMs += deltaMs
        metrics.windowFrameEquivalent += 1
        metrics.windowDeltaMs += deltaMs
        while (metrics.windowDeltaMs >= 1_000) {
          const fraction = 1_000 / metrics.windowDeltaMs
          const framesInWindow = metrics.windowFrameEquivalent * fraction
          const fps = framesInWindow
          metrics.completedWindowCount += 1
          metrics.lowestWindowFps = metrics.lowestWindowFps === null
            ? fps
            : Math.min(metrics.lowestWindowFps, fps)
          metrics.windowFrameEquivalent -= framesInWindow
          metrics.windowDeltaMs -= 1_000
        }
      }
      if (mode === 'low-effect') metrics.lowEffectActivated = true
      return mode
    }
    governor.resetSampling = function observedResetSampling() {
      if (metrics.windowDeltaMs > 0) metrics.partialWindowsDiscarded += 1
      metrics.windowDeltaMs = 0
      metrics.windowFrameEquivalent = 0
      return originalResetSampling.call(this)
    }
    metrics.wrapped = true
    metrics.wrappedAtActiveTimeMs = combat.runState?.activeTimeMs ?? 0
  })

  console.log('PROXY ZERO balance observer is ready.')
  console.log('Use only the visible game window. This observer generates no input.')
  console.log(`Run kind: ${runKind}; commit: ${commit}`)

  let finalSnapshot = null
  while (!page.isClosed()) {
    finalSnapshot = await page.evaluate(() => {
      const game = window.__PZ_BALANCE_GAME__
      const metrics = window.__PZ_BALANCE__
      const scenes = game?.scene?.scenes ?? []
      const combat = scenes.find((scene) => scene.sys?.settings?.key === 'Combat')
      const results = scenes.find((scene) => scene.sys?.settings?.key === 'Results')
      const activeScene = scenes.find((scene) => scene.sys?.isActive?.())
      const activeSceneKey = activeScene?.sys?.settings?.key ?? null

      const runState = combat?.runState ?? null
      if (runState) {
        const lives = runState.lives
        if (Number.isInteger(lives)) {
          if (metrics.lastLives !== null && lives < metrics.lastLives) {
            const lostLives = metrics.lastLives - lives
            for (let index = 0; index < lostLives; index += 1) {
              metrics.events.push({
                activeTimeMs: runState.activeTimeMs,
                from: metrics.lastLives - index,
                to: metrics.lastLives - index - 1,
                type: 'death',
              })
            }
          }
          metrics.lastLives = lives
        }
        if (metrics.lastContinueUsed !== null && runState.continueUsed !== metrics.lastContinueUsed) {
          metrics.events.push({
            activeTimeMs: runState.activeTimeMs,
            type: runState.continueUsed ? 'continue-used' : 'continue-reset',
          })
        }
        if (metrics.lastStatus !== null && runState.status !== metrics.lastStatus) {
          metrics.events.push({
            activeTimeMs: runState.activeTimeMs,
            status: runState.status,
            type: 'status-changed',
          })
        }
        metrics.lastContinueUsed = runState.continueUsed
        metrics.lastStatus = runState.status
        metrics.debugClearUsed ||= runState.debugClearUsed === true
      }

      if (activeSceneKey !== metrics.lastActiveScene) {
        metrics.events.push({
          activeTimeMs: runState?.activeTimeMs ?? null,
          scene: activeSceneKey,
          type: 'scene-changed',
        })
        metrics.lastActiveScene = activeSceneKey
      }

      const record = results?.services?.completedRun ?? combat?.services?.completedRun ?? null
      return {
        activeScene: activeSceneKey,
        metrics: structuredClone(metrics),
        record: record ? { ...record } : null,
        runState: runState ? {
          activeTimeMs: runState.activeTimeMs,
          continueAvailable: runState.continueAvailable,
          continueUsed: runState.continueUsed,
          debugClearUsed: runState.debugClearUsed,
          lives: runState.lives,
          status: runState.status,
        } : null,
      }
    })

    if (smokeOnly && finalSnapshot?.metrics?.wrapped) {
      const smokeReport = {
        buildCommit: observedBuild.commit,
        buildDirty: observedBuild.dirty,
        commit,
        hookAvailable: true,
        observerWrappedAtActiveTimeMs: finalSnapshot.metrics.wrappedAtActiveTimeMs,
        smoke: 'PASS',
      }
      if (videoSmokeOnly && gameplayVideo) {
        await page.waitForTimeout(2_000)
        await context.close()
        const recordedVideoPath = await gameplayVideo.path()
        const videoSmokePath = path.join(
          outputDirectory,
          `video-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
        )
        if (!staysInsideOutput(recordedVideoPath) || !staysInsideOutput(videoSmokePath)) {
          throw new Error('Refusing to move video smoke output outside the evidence directory.')
        }
        fs.renameSync(recordedVideoPath, videoSmokePath)
        smokeReport.videoFile = path.basename(videoSmokePath)
        smokeReport.videoBytes = fs.statSync(videoSmokePath).size
      } else {
        await context.close()
      }
      console.log(JSON.stringify(smokeReport, null, 2))
      await browser.close()
      return
    }
    if (finalSnapshot?.activeScene === 'Results' && finalSnapshot.record) break
    await page.waitForTimeout(100)
  }

  if (!finalSnapshot?.record) {
    throw new Error('The browser closed before a completed result was observed.')
  }

  const deaths = finalSnapshot.metrics.events.filter((event) => event.type === 'death').length
  const continueEvents = finalSnapshot.metrics.events.filter(
    (event) => event.type === 'continue-used',
  ).length
  const failureSequence = finalSnapshot.metrics.events
    .filter((event) => ['continue-used', 'death'].includes(event.type))
    .map((event) => event.type)
  const averageFps = finalSnapshot.metrics.sampledDeltaMs > 0
    ? finalSnapshot.metrics.frameCount * 1_000 / finalSnapshot.metrics.sampledDeltaMs
    : null
  const validationErrors = []
  if (!finalSnapshot.metrics.wrapped) validationErrors.push('performance governor was not wrapped')
  if ((finalSnapshot.metrics.wrappedAtActiveTimeMs ?? Infinity) > 0) {
    validationErrors.push('FPS observation began after active play started')
  }
  if (finalSnapshot.metrics.completedWindowCount < 1) {
    validationErrors.push('no complete one-second FPS window was recorded')
  }
  if (averageFps === null || finalSnapshot.metrics.lowestWindowFps === null) {
    validationErrors.push('FPS metrics are incomplete')
  }
  if (finalSnapshot.metrics.debugClearUsed || finalSnapshot.record.outcome === 'debug-clear') {
    validationErrors.push('debug clear was used')
  }
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    validationErrors.push('browser runtime errors were recorded')
  }

  if (runKind === 'clear') {
    if (finalSnapshot.record.outcome !== 'mission-clear') {
      validationErrors.push('clear run did not end in mission-clear')
    }
    if (finalSnapshot.record.continueUsed) validationErrors.push('Continue was used')
    if (finalSnapshot.record.characterId !== expectedCharacter) {
      validationErrors.push(`selected character did not match ${expectedCharacter}`)
    }
    if (finalSnapshot.record.activeTimeMs < 480_000 || finalSnapshot.record.activeTimeMs > 720_000) {
      validationErrors.push('active time is outside the 480-720 second acceptance range')
    }
  } else {
    if (finalSnapshot.record.outcome !== 'mission-failed') {
      validationErrors.push('failure run did not end in mission-failed')
    }
    if (finalSnapshot.record.rank !== 'D') validationErrors.push('failure run rank is not D')
    if (!finalSnapshot.record.continueUsed || continueEvents !== 1) {
      validationErrors.push('failure run did not record exactly one Continue')
    }
    if (deaths !== 4) validationErrors.push('failure run did not record exactly four deaths')
    if (failureSequence.join(',') !== 'death,death,continue-used,death,death') {
      validationErrors.push('failure run order was not two deaths, Continue, then two deaths')
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = path.join(
    outputDirectory,
    `${timestamp}-${runKind}-${finalSnapshot.record.characterId}-${finalSnapshot.record.outcome}.json`,
  )
  const screenshotPath = outputPath.replace(/\.json$/, '.png')
  const gameplayVideoPath = outputPath.replace(/\.json$/, '-gameplay.webm')
  const report = {
    schemaVersion: 1,
    validRun: validationErrors.length === 0,
    validOfficialRun: validationErrors.length === 0 && !captureVideo,
    officialEvidenceEligible: !captureVideo,
    validationErrors,
    runKind,
    expectedCharacter,
    commit,
    buildCommit: observedBuild.commit,
    buildDirty: observedBuild.dirty,
    browserVersion: browser.version(),
    viewport: '1280x720',
    displayScale: 1,
    recordedAt: new Date().toISOString(),
    ...finalSnapshot.record,
    deaths,
    averageFps,
    lowestCompletedWindowFps: finalSnapshot.metrics.lowestWindowFps,
    completedFpsWindows: finalSnapshot.metrics.completedWindowCount,
    partialFpsWindowsDiscarded: finalSnapshot.metrics.partialWindowsDiscarded,
    lowEffectActivated: finalSnapshot.metrics.lowEffectActivated,
    observerWrappedAtActiveTimeMs: finalSnapshot.metrics.wrappedAtActiveTimeMs,
    events: finalSnapshot.metrics.events,
    gameplayVideoFile: captureVideo ? path.basename(gameplayVideoPath) : null,
    pageErrors,
    consoleErrors,
  }
  await page.screenshot({ path: screenshotPath })
  await page.waitForTimeout(5_000)
  await context.close()
  if (gameplayVideo) {
    const recordedVideoPath = await gameplayVideo.path()
    if (!staysInsideOutput(recordedVideoPath) || !staysInsideOutput(gameplayVideoPath)) {
      throw new Error('Refusing to move gameplay video outside the evidence directory.')
    }
    fs.renameSync(recordedVideoPath, gameplayVideoPath)
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  console.log(`Saved: ${outputPath}`)
  if (captureVideo) console.log(`Saved: ${gameplayVideoPath}`)
  await browser.close()
  if (!report.validRun) process.exitCode = 2
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
