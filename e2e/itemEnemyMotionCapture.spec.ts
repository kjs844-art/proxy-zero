import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

const outputDirectory = resolve('artifacts', 'visual-qa')

test('captures every grounded pickup pose and an industrial enemy impact pose', async ({ page }) => {
  test.setTimeout(120_000)
  await mkdir(outputDirectory, { recursive: true })
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const canvas = page.locator('canvas')
  const cdp = await page.context().newCDPSession(page)
  const captureCanvas = async (name: string): Promise<void> => {
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    await writeFile(resolve(outputDirectory, name), Buffer.from(capture.data, 'base64'))
  }
  const enterCombat = async (selectionMoves: number): Promise<void> => {
    await page.goto('/?qa=balance', { waitUntil: 'networkidle' })
    await expect(canvas).toBeVisible({ timeout: 10_000 })
    const waitForScene = (sceneKey: string): Promise<unknown> => page.waitForFunction((expectedSceneKey) => {
      const game = (window as unknown as {
        __PZ_BALANCE_GAME__?: {
          scene?: { scenes?: Array<{ sys?: { settings?: { key?: string }; isActive?: () => boolean } }> }
        }
      }).__PZ_BALANCE_GAME__
      return game?.scene?.scenes?.some(
        (scene) => scene.sys?.settings?.key === expectedSceneKey && scene.sys?.isActive?.(),
      )
    }, sceneKey, { timeout: 20_000 })
    await waitForScene('Title')
    await page.keyboard.press('Enter')
    await waitForScene('CharacterSelect')
    for (let index = 0; index < selectionMoves; index += 1) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('Enter')
    await waitForScene('Combat')
    await canvas.evaluate((element) => (element as HTMLCanvasElement).focus())
  }

  const preparePickupPose = async (): Promise<boolean> => page.evaluate(() => {
    type DebugActor = {
      id: string
      team: string
      mode: string
      activeAttack: unknown
    }
    type DebugCombat = {
      state?: { elapsedMs?: number; playerId?: string; actors?: Record<string, DebugActor> }
      playerItemAction?: { kind: 'pickup' | 'use'; startedAtMs: number } | null
      presentationPaused?: boolean
      syncPresentation?: () => void
    }
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find(
      (scene) => scene.sys?.settings?.key === 'Combat',
    ) as DebugCombat | undefined
    if (!combat?.state || typeof combat.state.elapsedMs !== 'number') return false
    combat.presentationPaused = true
    combat.playerItemAction = {
      kind: 'pickup',
      startedAtMs: combat.state.elapsedMs - 200,
    }
    combat.syncPresentation?.()
    return true
  })

  const characters = [
    { id: 'han', selectionMoves: 0 },
    { id: 'mina', selectionMoves: 1 },
    { id: 'jin', selectionMoves: 2 },
  ] as const
  for (const character of characters) {
    await enterCombat(character.selectionMoves)
    expect(await preparePickupPose()).toBe(true)
    await captureCanvas(`06-${character.id}-pickup-kneel.png`)
  }

  const enemyPrepared = await page.evaluate(() => {
    type DebugActor = {
      id: string
      team: string
      mode: string
      activeAttack: unknown
    }
    type DebugCombat = {
      state?: { elapsedMs?: number; playerId?: string; actors?: Record<string, DebugActor> }
      enemyVariantIds?: Map<string, string>
      playerItemAction?: { kind: 'pickup' | 'use'; startedAtMs: number } | null
      presentationPaused?: boolean
      syncPresentation?: () => void
    }
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: {
        scene?: { scenes?: Array<Record<string, unknown> & { sys?: { settings?: { key?: string } } }> }
      }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find(
      (scene) => scene.sys?.settings?.key === 'Combat',
    ) as DebugCombat | undefined
    const playerId = combat?.state?.playerId
    const enemy = Object.values(combat?.state?.actors ?? {}).find(
      (actor) => actor.id !== playerId && actor.team === 'enemies',
    )
    if (!combat || !enemy) return false
    const profileId = combat.enemyVariantIds?.get(enemy.id)
    const attackId = profileId === 'scout-patrol'
      ? 'han-right-foot'
      : profileId === 'bulwark-sentinel'
        ? 'jin-anchor-blow'
        : 'han-right-hand'
    combat.playerItemAction = null
    enemy.mode = 'attacking'
    enemy.activeAttack = {
      attackId,
      elapsedMs: 100,
      phase: 'active',
      hitRecords: {},
    }
    combat.syncPresentation?.()
    return true
  })
  expect(enemyPrepared).toBe(true)
  await captureCanvas('07-industrial-enemy-impact.png')

  expect(runtimeErrors).toEqual([])
})
