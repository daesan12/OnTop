import { expect, test, type Page } from '@playwright/test'
import rules from '../../../backend/src/test/resources/jump-rope/rules-v1.json' with { type: 'json' }
import { MINI_PROPS } from '../../src/park/mapConfig'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { fixture } from './contractFixture'

function setupPark(page: Page) {
  const { cabinet, front } = rpsCabinetPlacement(MINI_PROPS[0])
  return fixture(page, { position: { ...front, y: .8, yaw: cabinet.yaw + Math.PI } })
}

async function openJumpRope(page: Page) {
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 10000 })
  await page.keyboard.press('KeyE')
  const arcade = page.getByRole('dialog', { name: '어떤 게임을 할까요?' })
  await arcade.getByRole('button', { name: /구구구 줄넘기/ }).click()
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  return page.getByRole('dialog', { name: '구구구 줄넘기' })
}

function roundResponse(id: string, now = Date.now()) {
  return { id, seed: 409, rulesVersion: 1, durationMs: 60000, serverNow: new Date(now).toISOString(),
    startedAt: new Date(now + 3000).toISOString(), expiresAt: new Date(now + 98000).toISOString() }
}

test('월드에서 줄넘기 시작, 서버 랭킹, 실패 기록 재시도, 월드 복귀', async ({ page }) => {
  await setupPark(page)
  const starts: string[] = []
  const submissions: { path: string; body: unknown }[] = []
  let resolveRetry!: () => void
  const retryResponse = new Promise<void>(resolve => { resolveRetry = resolve })
  await page.route('**/api/v1/minigames/jump-rope/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    if (request.method() === 'GET' && path.endsWith('/rankings')) {
      return route.fulfill({ json: { rulesVersion: 1, period: 'ALL_TIME', offset: 0, limit: 10,
        items: [{ rank: 1, nickname: '공동일등', score: 300 }, { rank: 1, nickname: '다른일등', score: 300 },
          { rank: 3, nickname: '삼등', score: 215 }], me: { rank: 3, nickname: '삼등', score: 215 } } })
    }
    if (request.method() === 'POST' && path.endsWith('/rounds')) {
      starts.push(request.headers()['idempotency-key']!)
      return route.fulfill({ status: 201, json: roundResponse('42') })
    }
    expect(request.method()).toBe('POST')
    submissions.push({ path, body: request.postDataJSON() })
    if (submissions.length === 1) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } })
    await retryResponse
    return route.fulfill({ json: { id: '42', rulesVersion: 1, score: 0, counts: { perfect: 0, good: 0, miss: 3 },
      endReason: 'missLimit', completedAt: new Date().toISOString(), reward: 0 } })
  })

  const game = await openJumpRope(page)
  await game.getByRole('button', { name: '랭킹 보기' }).click()
  const ranking = game.getByRole('dialog', { name: '구구구 랭킹' })
  await expect(ranking.locator('.rope-ranking__place')).toHaveText(['1', '1', '3'])
  await expect(ranking).toContainText('215점 · 3위')
  await ranking.getByRole('button', { name: '닫기' }).click()
  await expect(ranking).toBeHidden()
  expect(starts).toEqual([])

  const cues = await game.evaluateHandle(dialog => {
    const values: string[] = []
    new MutationObserver(() => {
      const cue = dialog.querySelector('.rope-countdown')?.textContent
      if (cue && cue !== values.at(-1)) values.push(cue)
    }).observe(dialog, { childList: true, characterData: true, subtree: true })
    return values
  })
  await game.getByRole('button', { name: '게임 시작' }).click()
  const countdown = game.getByLabel('시작 카운트다운')
  await expect(countdown).toHaveText('3')
  expect(starts[0]).toBeTruthy()
  await page.keyboard.press('Space')
  await expect.poll(() => submissions.length, { timeout: 18000 }).toBe(1)
  expect(await cues.jsonValue()).toEqual(['3', '2', '1', 'GO!'])
  await expect(game.getByRole('heading', { name: '게임 오버' })).toBeVisible({ timeout: 7000 })
  await expect(game.locator('.rope-result__score dd')).toHaveText('—')
  await expect(game.locator('.rope-result__reward')).toHaveCount(0)
  await game.getByRole('button', { name: '기록 저장 다시 시도' }).click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions).toEqual(Array(2).fill({ path: '/api/v1/minigames/jump-rope/rounds/42/complete', body: { jumpOffsetsUs: [] } }))
  await expect(game.getByText('서버에서 기록을 확정하는 중입니다.')).toBeVisible()
  await expect(game.locator('.rope-result__reward')).toHaveCount(0)
  resolveRetry()
  await expect(game.locator('.rope-result__reward')).toHaveText('3회 MISS로 엽전이 지급되지 않았어요.')
  await game.getByRole('button', { name: '그만하기' }).click()
  await expect(game).toBeHidden()
  const saved = async () => page.evaluate(async () => {
    const { useJumpRope } = await import('/src/features/jumpRope/store.ts' as string)
    const { inputState } = await import('/src/world/inputOwnership.ts' as string)
    const settlement = useJumpRope.getState().settlement
    return { active: inputState.minigameOpen, status: settlement?.status, score: settlement?.status === 'saved' ? settlement.receipt.score : null }
  })
  await expect.poll(saved).toEqual({ active: false, status: 'saved', score: 0 })
})

for (const reward of [3, 0]) test(`60초 완주 시 서버 확정 점수와 지급액 ${reward}냥을 표시한다`, async ({ page }) => {
  await setupPark(page)
  let submitted: unknown
  let started = 0
  let rewardWalletReads = 0
  let allowWalletRefresh = false
  const jumpOffsetsUs = rules.passagesUs.filter(passage => passage < 60_000_000).map(passage => passage - 270_000)
  await page.route('**/api/v1/wallets/me', route => {
    if (submitted && reward > 0) {
      rewardWalletReads++
      if (!allowWalletRefresh) return route.fulfill({ status: 503, json: { code: 'WALLET_UNAVAILABLE' } })
    }
    const balance = allowWalletRefresh ? 100 + reward : 100
    return route.fulfill({ json: { balance, reservedBalance: 0, availableBalance: balance } })
  })
  await page.route('**/api/v1/minigames/jump-rope/rounds', route => route.fulfill({ status: 201, json: roundResponse(String(43 + started++)) }))
  await page.route('**/api/v1/minigames/jump-rope/rounds/43/complete', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { id: '43', rulesVersion: 1, score: 1965, counts: { perfect: 66, good: 0, miss: 0 },
      endReason: 'time', completedAt: new Date().toISOString(), reward } })
  })
  const game = await openJumpRope(page)
  const start = game.getByRole('button', { name: '게임 시작' })
  await expect(start).toBeEnabled()
  const clock = await page.evaluateHandle(() => {
    const origin = performance.now()
    let elapsed = 0
    performance.now = () => origin + elapsed
    return { set: (ms: number) => { elapsed = ms } }
  })
  await start.click()
  await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
  await clock.evaluate((time, inputs) => {
    const stage = document.querySelector('.jump-rope-world .preview-stage')!
    for (const offset of inputs) {
      time.set(3000 + offset / 1000)
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }))
    }
    time.set(63001)
  }, jumpOffsetsUs)
  await expect.poll(() => submitted).toEqual({ jumpOffsetsUs })
  await clock.evaluate(time => time.set(66000))
  await expect(game.getByRole('heading', { name: '비둘기들이 인정한 인간' })).toBeVisible()
  await expect(game.locator('.rope-result__score dd')).toHaveText('1,965')
  await expect(game.locator('.rope-result__verdicts dd')).toHaveText(['66회', '0회', '0회'])
  const rewardLine = game.locator('.rope-result__reward')
  await expect(rewardLine).toHaveText(`획득 엽전 ${reward > 0 ? '+' : ''}${reward}냥`)
  if (reward > 0) {
    await expect.poll(() => rewardWalletReads).toBeGreaterThan(0)
    await expect(page.locator('.park-wallet__notice')).toContainText('잠시 후 자동으로 다시 확인해요')
    await expect(game.locator('.rope-result__score dd')).toHaveText('1,965')
    await expect(rewardLine).toHaveText('획득 엽전 +3냥')
    allowWalletRefresh = true
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.locator('.park-account__balance')).toHaveText('103냥')
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 })
      const box = await rewardLine.boundingBox()
      const buttons = await game.locator('.rope-result__actions').boundingBox()
      expect(box).not.toBeNull()
      expect(buttons).not.toBeNull()
      expect(box!.y + box!.height).toBeLessThanOrEqual(buttons!.y)
    }
    await game.getByRole('button', { name: '다시 시작' }).click()
    await expect(game.getByLabel('시작 카운트다운')).toHaveText('3')
    await expect(rewardLine).toHaveCount(0)
  } else {
    await game.getByRole('button', { name: '그만하기' }).click()
    await expect(game).toBeHidden()
    await expect(page.locator('.park-account__balance')).toHaveText('100냥')
  }
})
