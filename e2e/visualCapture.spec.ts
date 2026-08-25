import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const outputDirectory = resolve('artifacts', 'visual-qa')

const activeSceneKey = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<{ sys?: { settings?: { key?: string }, isActive?: () => boolean } }> }
      }
    }).__PZ_BALANCE_GAME__
    const active = game?.scene?.scenes?.find((scene) => scene.sys?.isActive?.())
    return active?.sys?.settings?.key ?? null
  })

const waitForScene = async (page: Page, sceneKey: string): Promise<void> => {
  await expect.poll(() => activeSceneKey(page), { timeout: 10_000 }).toBe(sceneKey)
}

const debugAdvanceZone = async (page: Page, expectedZoneId: string): Promise<void> => {
  await page.evaluate(() => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find((scene) => scene.sys?.settings?.key === 'Combat') as
      | { debugClearCurrentZone?: () => void }
      | undefined
    combat?.debugClearCurrentZone?.()
  })
  await page.waitForFunction((zoneId) => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find((scene) => scene.sys?.settings?.key === 'Combat') as
      | { currentZone?: { id?: string }; zonePhase?: string }
      | undefined
    return combat?.currentZone?.id === zoneId && combat.zonePhase === 'active'
  }, expectedZoneId, { timeout: 10_000 })
}

/**
 * Stage 1 deliberately makes every cleared wave a short forward traversal,
 * rather than silently cutting to the next encounter.  This QA-only helper
 * reaches that checkpoint deterministically, then lets the live Phaser scene
 * perform its regular camera update before capturing the result.
 */
const debugCrossFirstWaveGate = async (page: Page): Promise<void> => {
  const crossed = await page.evaluate(() => {
    type DebugCombatScene = {
      beginWaveClear?: (waveId: string) => void
      clearEnemyResources?: () => void
      currentWave?: () => { id?: string }
      currentZone?: { arena?: { minX?: number } }
      interWaveRemainingMs?: number
      state?: {
        playerId?: string
        actors?: Record<string, { position?: { x: number } }>
      }
      stepDomain?: () => void
    }
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find((scene) => scene.sys?.settings?.key === 'Combat') as
      | DebugCombatScene
      | undefined
    const waveId = combat?.currentWave?.().id
    const playerId = combat?.state?.playerId
    const player = playerId ? combat?.state?.actors?.[playerId] : undefined
    const localArenaMinX = combat?.currentZone?.arena?.minX
    if (
      !combat?.beginWaveClear ||
      !combat.stepDomain ||
      !waveId ||
      !player?.position ||
      typeof localArenaMinX !== 'number'
    ) return false

    // This mirrors the normal post-defeat state: only the player remains,
    // the gate delay has elapsed, and they have crossed into section two.
    combat.clearEnemyResources?.()
    combat.beginWaveClear(waveId)
    combat.interWaveRemainingMs = 0
    player.position.x = localArenaMinX + 640
    combat.stepDomain()
    return true
  })
  expect(crossed).toBe(true)

  await page.waitForFunction(() => {
    type DebugCombatScene = {
      cameraScrollX?: number
      waveIndex?: number
      zonePhase?: string
    }
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find((scene) => scene.sys?.settings?.key === 'Combat') as
      | DebugCombatScene
      | undefined
    return (
      combat?.zonePhase === 'active' &&
      combat.waveIndex === 1 &&
      typeof combat.cameraScrollX === 'number' &&
      combat.cameraScrollX > 8
    )
  })
}

test('captures every authored Stage 1 presentation surface for visual review', async ({ page }) => {
  await mkdir(outputDirectory, { recursive: true })
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.goto('/?qa=balance', { waitUntil: 'networkidle' })
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  await page.waitForFunction(() => Boolean(
    (window as unknown as { __PZ_BALANCE_GAME__?: unknown }).__PZ_BALANCE_GAME__,
  ))
  await waitForScene(page, 'Title')
  await canvas.screenshot({ path: resolve(outputDirectory, '01-title.png') })

  await page.keyboard.press('Enter')
  await waitForScene(page, 'CharacterSelect')
  await canvas.screenshot({ path: resolve(outputDirectory, '02-fighter-select.png') })

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await waitForScene(page, 'Combat')
  await canvas.click({ position: { x: 640, y: 360 } })
  await canvas.screenshot({ path: resolve(outputDirectory, '03-n9-depot.png') })

  await debugCrossFirstWaveGate(page)
  await canvas.screenshot({ path: resolve(outputDirectory, '03b-n9-gate-crossed.png') })

  await debugAdvanceZone(page, 'service-train')
  await canvas.screenshot({ path: resolve(outputDirectory, '04-service-train.png') })

  await debugAdvanceZone(page, 'flooded-tunnel')
  await canvas.screenshot({ path: resolve(outputDirectory, '05-flooded-tunnel.png') })

  expect(runtimeErrors).toEqual([])
})
