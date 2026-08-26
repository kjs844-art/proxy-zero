import { expect, test, type Page } from '@playwright/test'

type RuntimeActor = {
  activeAttack: { attackId?: string } | null
  mode: string
  position: { x: number; y: number; z: number }
  team: string
}

type RuntimeCombatScene = {
  state?: { playerId?: string; actors?: Record<string, RuntimeActor> }
  sys?: { settings?: { key?: string }; isActive?: () => boolean }
}

const waitForScene = (page: Page, sceneKey: string): Promise<unknown> =>
  page.waitForFunction((expectedSceneKey) => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: { scene?: { scenes?: RuntimeCombatScene[] } }
    }).__PZ_BALANCE_GAME__
    return game?.scene?.scenes?.some(
      (scene) => scene.sys?.settings?.key === expectedSceneKey && scene.sys?.isActive?.(),
    )
  }, sceneKey, { timeout: 20_000 })

const enterCombat = async (page: Page, selectionMoves: number): Promise<void> => {
  await page.goto('/?qa=balance', { waitUntil: 'networkidle' })
  await expect(page.locator('canvas')).toBeVisible({ timeout: 10_000 })
  await waitForScene(page, 'Title')
  await page.keyboard.press('Enter')
  await waitForScene(page, 'CharacterSelect')
  for (let index = 0; index < selectionMoves; index += 1) {
    await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.press('Enter')
  await waitForScene(page, 'Combat')
  await page.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).focus())
  await page.evaluate(() => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: { scene?: { scenes?: RuntimeCombatScene[] } }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find(
      (scene) => scene.sys?.settings?.key === 'Combat' && scene.sys?.isActive?.(),
    )
    const playerId = combat?.state?.playerId
    for (const actor of Object.values(combat?.state?.actors ?? {})) {
      if (actor.team === 'enemies' && actor !== combat?.state?.actors?.[playerId ?? '']) {
        actor.position.x += 10_000
      }
    }
  })
}

const waitForPlayerAttack = (page: Page, attackId: string): Promise<unknown> =>
  page.waitForFunction((expectedAttackId) => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: { scene?: { scenes?: RuntimeCombatScene[] } }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find(
      (scene) => scene.sys?.settings?.key === 'Combat' && scene.sys?.isActive?.(),
    )
    const playerId = combat?.state?.playerId
    return playerId !== undefined &&
      combat?.state?.actors?.[playerId]?.activeAttack?.attackId === expectedAttackId
  }, attackId, { timeout: 10_000 })

const waitForGroundedIdle = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => {
    const game = (window as unknown as {
      __PZ_BALANCE_GAME__?: { scene?: { scenes?: RuntimeCombatScene[] } }
    }).__PZ_BALANCE_GAME__
    const combat = game?.scene?.scenes?.find(
      (scene) => scene.sys?.settings?.key === 'Combat' && scene.sys?.isActive?.(),
    )
    const playerId = combat?.state?.playerId
    const player = playerId === undefined ? undefined : combat?.state?.actors?.[playerId]
    return player !== undefined && player.position.z === 0 && player.activeAttack === null &&
      (player.mode === 'idle' || player.mode === 'moving')
  }, undefined, { timeout: 10_000 })

test('all fighters perform a real airborne attack and their ordered three-input technique', async ({ page }) => {
  test.setTimeout(120_000)
  const characters = [
    {
      selectionMoves: 0,
      jumpAttackId: 'han-jump-kick',
      techniqueAttackId: 'han-rising-kick',
      techniqueKeys: ['l', ';', 'k'],
    },
    {
      selectionMoves: 1,
      jumpAttackId: 'mina-jump-heel',
      techniqueAttackId: 'mina-sky-needle',
      techniqueKeys: ['l', 'k', 'l'],
    },
    {
      selectionMoves: 2,
      jumpAttackId: 'jin-jump-crush',
      techniqueAttackId: 'jin-fault-line',
      techniqueKeys: [';', 'l', 'k'],
    },
  ] as const

  for (const character of characters) {
    await enterCombat(page, character.selectionMoves)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => {
      const game = (window as unknown as {
        __PZ_BALANCE_GAME__?: { scene?: { scenes?: RuntimeCombatScene[] } }
      }).__PZ_BALANCE_GAME__
      const combat = game?.scene?.scenes?.find(
        (scene) => scene.sys?.settings?.key === 'Combat' && scene.sys?.isActive?.(),
      )
      const playerId = combat?.state?.playerId
      return playerId !== undefined && (combat?.state?.actors?.[playerId]?.position.z ?? 0) > 0
    })
    await page.keyboard.press('j')
    await waitForPlayerAttack(page, character.jumpAttackId)
    await waitForGroundedIdle(page)

    for (const key of character.techniqueKeys) await page.keyboard.press(key)
    await waitForPlayerAttack(page, character.techniqueAttackId)
  }
})
