import { expect, test } from '@playwright/test'

test.beforeAll(async ({ request }) => {
  for (const author of ['산책자 A', '산책자 B']) {
    const response = await request.post('/dev/ai/command', { headers: { 'X-Ai-Lab': 'local' }, data: { action: 'walk', author, scope: 'world:one', x: author.endsWith('A') ? 4 : 6, z: 4 } })
    expect(response.ok()).toBeTruthy()
  }
  await expect.poll(async () => {
    const response = await request.get('/dev/ai/state?scope=world:one')
    return (await response.json()).visitors.every((v: { moving: boolean }) => !v.moving)
  }, { timeout: 16000 }).toBeTruthy()
})

test('two actual clients see post-moderation replacement and another room does not receive it', async ({ page, context, request }) => {
  await page.goto('/ai-lab.html?role=A')
  const other = await context.newPage()
  await other.goto('/ai-lab.html?role=B')
  await expect(page.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  await expect(other.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  const text = `씨발 검수-${Date.now()}`
  await page.getByLabel('채팅 입력', { exact: true }).fill(text)
  await page.getByRole('button', { name: '보내기', exact: true }).click()
  const message = other.getByRole('log').locator('article').filter({ hasText: text })
  await expect(message).toBeVisible()
  const id = await message.getAttribute('data-message-id')
  await page.getByRole('button', { name: '기다리지 않고 지금 검사', exact: true }).click()
  for (const client of [page, other]) {
    const updated = client.locator(`[data-message-id="${id}"]`)
    await expect(updated).toContainText('부적절한 언행으로 가려졌습니다.')
    await expect(updated).not.toContainText(text)
  }
  await other.getByLabel('채팅 공간', { exact: true }).selectOption('world:two')
  await expect(other.locator(`[data-message-id="${id}"]`)).toHaveCount(0)
  const response = await request.get('http://127.0.0.1:19190/dev/ai/state?scope=world:one')
  expect(await response.text()).not.toContain(text)
  await other.close()
})

test('feedback is saved, classified, summarized and appears in local outbox', async ({ page }) => {
  await page.goto('/ai-lab.html')
  await expect(page.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  const text = `의상을 더 추가해주세요 검수-${Date.now()}`
  await page.getByLabel('의견 내용', { exact: true }).fill(text)
  await page.getByRole('button', { name: '의견 접수', exact: true }).click()
  await expect(page.locator('.review-list article').filter({ hasText: text })).toBeVisible()
  await page.getByRole('button', { name: '정기 요약 지금 실행', exact: true }).click()
  await expect(page.locator('.review-list article').filter({ hasText: text })).toContainText('보고 완료', { timeout: 10000 })
  await page.getByRole('button', { name: /^알림함/ }).click()
  await expect(page.locator('.review-list article').filter({ hasText: 'FEEDBACK_DIGEST' }).last()).toContainText('SENT')
})

test('real Renju board and NPC dialogue are interactive without API keys', async ({ page }) => {
  await page.goto('/ai-lab.html')
  await expect(page.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '흑 우세 예제', exact: true }).click()
  await expect(page.getByLabel('좌표 7,7 착수됨', { exact: true })).toBeDisabled()
  await expect(page.locator('.analysis')).toContainText(/RAPFI|UNAVAILABLE/)
  await page.getByLabel('NPC에게 물어보기', { exact: true }).fill('오목은 어떻게 해요?')
  await page.getByRole('button', { name: '대화하기', exact: true }).click()
  await expect(page.locator('.speech')).toContainText('흑은 금수를 조심하게')
  await page.getByRole('button', { name: '두 수 무르기', exact: true }).click()
  await expect(page.locator('.middle-grid .section-title').first()).toContainText('5수')
})

test('NPC delivers queued board facts, concludes a finished match and returns to patrol', async ({ page }) => {
  test.setTimeout(75000)
  await page.goto('/ai-lab.html')
  await expect(page.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '대화 취소', exact: true }).click()
  await page.getByRole('button', { name: '흑 우세 예제', exact: true }).click()
  await expect(page.locator('.speech')).toContainText('흑을 든 친구가 조금 편해', { timeout: 45000 })
  await page.getByLabel('좌표 11,7', { exact: true }).click()
  await page.getByLabel('좌표 6,7', { exact: true }).click()
  await expect(page.locator('.speech')).toContainText('흑을 든 친구가 이겼', { timeout: 10000 })
  await expect(page.locator('.npc-chip').filter({ hasText: '박영감' })).toContainText('공원 순찰', { timeout: 15000 })
})

test('3D primitive NPCs render, select a persona and safely switch to the 2D map', async ({ page }) => {
  await page.goto('/ai-lab.html')
  await expect(page.getByTestId('ai-park-3d')).toHaveAttribute('data-renderer', 'ready', { timeout: 15000 })
  await expect(page.locator('.scene-npc-label')).toHaveCount(2)
  await page.locator('.scene-npc-label button').filter({ hasText: '순경 김' }).click()
  await expect(page.locator('.dialogue h2')).toHaveText('순경 김')
  await page.getByRole('button', { name: 'NPC 따라보기', exact: true }).click()
  await page.getByRole('button', { name: '2D 지도', exact: true }).click()
  await expect(page.getByLabel('NPC 경유지 이동 검수 지도')).toBeVisible()
  await expect(page.getByTestId('ai-park-3d')).toHaveCount(0)
  await page.getByRole('button', { name: '3D 공원', exact: true }).click()
  await expect(page.getByTestId('ai-park-3d')).toHaveAttribute('data-renderer', 'ready', { timeout: 15000 })
})

test('failed 3D module download leaves the 2D map and other controls available', async ({ page }) => {
  await page.route('**/src/ai-lab/ParkScene.tsx*', route => route.abort())
  await page.goto('/ai-lab.html')
  await expect(page.getByText('3D 파일을 불러오지 못했습니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '2D 지도', exact: true }).click()
  await expect(page.getByLabel('NPC 경유지 이동 검수 지도')).toBeVisible()
  await expect(page.getByLabel('채팅 입력', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '의견 접수', exact: true })).toBeVisible()
})

test('walking preserves earlier recipients and isolates distant new chat after moderation', async ({ page, context, request }) => {
  test.setTimeout(65000)
  await page.goto('/ai-lab.html?role=A')
  const other = await context.newPage()
  await other.goto('/ai-lab.html?role=B')
  await expect(other.getByText('로컬 서버 연결됨', { exact: true })).toBeVisible()
  const earlier = `함께 들은 인사-${Date.now()}`
  await page.getByLabel('채팅 입력', { exact: true }).fill(earlier)
  await page.getByRole('button', { name: '보내기', exact: true }).click()
  await expect(other.getByRole('log')).toContainText(earlier)
  try {
    const moved = await request.post('/dev/ai/command', { headers: { 'X-Ai-Lab': 'local' }, data: { action: 'walk', author: '산책자 A', scope: 'world:one', x: 28, z: 18 } })
    expect(moved.ok()).toBeTruthy()
    await expect(page.getByTestId('visitor-position')).toHaveAttribute('data-x', '28', { timeout: 16000 })
    await expect(page.getByTestId('visitor-position')).toHaveAttribute('data-z', '18', { timeout: 16000 })
    await expect(other.getByRole('log')).toContainText(earlier)
    const distant = `씨발 먼거리검수-${Date.now()}`
    await page.getByLabel('채팅 입력', { exact: true }).fill(distant)
    await page.getByRole('button', { name: '보내기', exact: true }).click()
    const article = page.getByRole('log').locator('article').filter({ hasText: distant })
    await expect(article).toBeVisible()
    const id = await article.getAttribute('data-message-id')
    await expect(other.locator(`[data-message-id="${id}"]`)).toHaveCount(0)
    await page.getByRole('button', { name: '기다리지 않고 지금 검사', exact: true }).click()
    await expect(page.locator(`[data-message-id="${id}"]`)).toContainText('부적절한 언행으로 가려졌습니다.')
    await expect(page.locator('.npc-chip').filter({ hasText: '순경 김' })).toContainText('현장 방문')
    await expect(other.locator(`[data-message-id="${id}"]`)).toHaveCount(0)
    const invalid = await request.post('/dev/ai/command', { headers: { 'X-Ai-Lab': 'local' }, data: { action: 'walk', author: '산책자 A', scope: 'world:one', x: 16, z: 11 } })
    expect(invalid.status()).toBe(400)
  } finally {
    await request.post('/dev/ai/command', { headers: { 'X-Ai-Lab': 'local' }, data: { action: 'walk', author: '산책자 A', scope: 'world:one', x: 4, z: 4 } })
    await other.close()
  }
})
