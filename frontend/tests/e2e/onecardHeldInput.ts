import { expect, type Page } from '@playwright/test'
async function settleCamera(page: Page) {
  await page.evaluate(async () => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).settleOneCardCamera())
}
export const heldPoint = (page: Page, userId: string, index: number) => page.evaluate(async ({ userId, index }) =>
  (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardHeldCardTarget(userId, index), { userId, index })
export async function choose3DCard(page: Page, userId: string, index: number, touch = false) {
  await settleCamera(page)
  let point = await heldPoint(page, userId, index)
  for (let attempt = 0; !point && attempt < 6; attempt++) {
    const viewport = page.viewportSize()!
    await page.mouse.move(12, viewport.height * .45); await page.mouse.down()
    await page.mouse.move(Math.min(viewport.width - 12, 312), viewport.height * .45, { steps: 16 }); await page.mouse.up()
    await settleCamera(page)
    point = await heldPoint(page, userId, index)
  }
  expect(point, `${userId}/${index} must be physically visible after orbiting the table`).not.toBeNull()
  if (!point) return
  if (touch) await page.touchscreen.tap(point.x, point.y)
  else {
    await page.mouse.move(point.x, point.y)
    point = (await heldPoint(page, userId, index))!
    await page.mouse.click(point.x, point.y)
  }
  try {
    await expect.poll(() => page.evaluate(async () => (await import('/src/game/onecard/spectatorTargets.ts' as string)).useHeldCardPicking.getState().selected))
      .toMatchObject({ userId, index })
  } catch (error) {
    const diagnostic = await page.evaluate(async userId => (await import('/tests/e2e/onecardSceneProbe.ts' as string)).oneCardPickingDiagnostic(userId), userId)
    throw new Error(`Native card picking ${userId}/${index}: ${JSON.stringify(diagnostic)}`, { cause: error })
  }
}
