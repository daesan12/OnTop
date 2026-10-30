import { expect, test } from '@playwright/test'

test('비밀 카드의 취소·교환·추가 발사를 실제 화면에서 확인한다', async ({ page }) => {
  const packets: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => packets.push(JSON.parse(String(f.payload)))))
  const current = () => packets.filter(m => m.type === 'STATE').at(-1)?.state
  const privateState = () => packets.filter(m => m.type === 'PRIVATE_STATE').at(-1)?.state
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => current()?.stage).toBe('WAITING')
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await expect.poll(() => privateState()?.cards.length).toBe(2)
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '내 알 위치 교환', exact: true }).click()
  await page.getByRole('button', { name: '아이템 취소', exact: true }).click()
  expect(privateState().cards.length).toBe(2)
  expect(current().itemUsedThisTurn).toBe(false)
  await page.getByRole('button', { name: '내 알 위치 교환', exact: true }).click()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  let rect = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(rect.x + rect.width * .30, rect.y + rect.height * .60)
  await page.mouse.click(rect.x + rect.width * .40, rect.y + rect.height * .60)
  await expect(page.getByText(/선택:.*\(2\/2\)/)).toBeVisible()
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/item-swap-preview.png', fullPage: true })
  const before = current()
  await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect.poll(() => current()?.lastItemEffect?.type).toBe('SWAP')
  await expect.poll(() => privateState()?.cards.length).toBe(1)
  const effect = current().lastItemEffect
  expect(current().pieces.find((p: any) => p.id === effect.targets[0]).x)
    .toBe(before.pieces.find((p: any) => p.id === effect.targets[1]).x)
  await expect(page.getByRole('button', { name: '한 번 더 튕기기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => current()?.stage).toBe('WAITING')
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await expect.poll(() => privateState()?.cards.length).toBe(2)
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '한 번 더 튕기기', exact: true }).click()
  const deadline = current().turnDeadline
  await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect.poll(() => current()?.extraShotsRemaining).toBe(1)
  await page.locator('canvas').scrollIntoViewIfNeeded()
  rect = (await page.locator('canvas').boundingBox())!
  const x = rect.x + rect.width / 2, y = rect.y + rect.height * .60
  await page.mouse.click(x, y)
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y + rect.height * .04, { steps: 8 }); await page.mouse.up()
  await expect.poll(() => current()?.simulationId).toBe(1)
  await expect.poll(() => current()?.stage).toBe('AIMING')
  expect(current().turn).toBe(0)
  expect(current().turnDeadline).toBe(deadline)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/item-extra-shot.png', fullPage: true })
})
