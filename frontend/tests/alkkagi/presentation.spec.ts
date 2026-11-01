import { expect, test } from '@playwright/test'

for (const [type, label, target] of [['GROW', '크기 확대', 'p29'], ['POWER_UP', '힘 강화', 'p13'], ['DEFEND', '방어 자세', 'p13']]) {
  test(`${type} 대상 선택과 지속 효과가 승인 상태에 연결된다`, async ({ page }) => {
    const states: any[] = []
    page.on('websocket', ws => ws.on('framereceived', f => { const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') states.push(m.state) }))
    await page.goto('/alkkagi-preview.html?role=red')
    await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '새 판', exact: true }).click()
    await page.getByLabel('연습 카드 1', { exact: true }).selectOption(type)
    await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
    await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.locator('canvas').scrollIntoViewIfNeeded()
    const r = (await page.locator('canvas').boundingBox())!
    await page.mouse.click(r.x + r.width / 2, r.y + r.height * (target === 'p29' ? .4 : .6))
    await expect(page.getByText(new RegExp(`선택: ${target}`))).toBeVisible()
    await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
    await expect.poll(() => states.at(-1)?.lastItemEffect?.type).toBe(type)
    if (type === 'POWER_UP') expect(states.at(-1).boostedPieceId).toBe(target)
    else expect(states.at(-1).pieces.find((p: any) => p.id === target).modifier).toBe(type)
    await page.locator('canvas').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `.vite-cache/alkkagi-test-results/effect-${type}.png`, fullPage: true })
  })
}

test('턴 마감 10초부터 중앙 경고를 표시하고 새 판에서는 없앤다', async ({ page }) => {
  test.setTimeout(30000)
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  const timer = page.getByRole('timer', { name: '턴 마감 경고' })
  await expect(timer).toHaveCount(0)
  await expect(timer).toBeVisible({ timeout: 22000 })
  await expect(timer).toContainText('초 남음')
  await page.locator('canvas').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/ten-second-warning.png', fullPage: true })
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect(timer).toHaveCount(0)
})
