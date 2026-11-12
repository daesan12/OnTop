import { expect, test, type Locator, type Page } from '@playwright/test'
import rules from '../../../backend/src/test/resources/jump-rope/rules-v1.json' with { type: 'json' }
import { MINI_PROPS } from '../../src/park/mapConfig'
import { rpsCabinetPlacement } from '../../src/features/rpsRoulette/placement'
import { fixture } from './contractFixture'

function setupPark(page: Page) {
  const { cabinet, front } = rpsCabinetPlacement(MINI_PROPS[0])
  return fixture(page, { position: { ...front, y: .8, yaw: cabinet.yaw + Math.PI } })
}

async function openArcade(page: Page) {
  await page.goto('/park')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.park-scene-message')).toBeHidden({ timeout: 90000 })
  await expect(page.getByRole('button', { name: /오락기 하기/ })).toBeVisible({ timeout: 10000 })
  await page.keyboard.press('KeyE')
  return page.getByRole('dialog', { name: '어떤 게임을 할까요?' })
}

async function openJumpRope(page: Page) {
  const arcade = await openArcade(page)
  await arcade.getByRole('button', { name: /구구구 줄넘기/ }).click()
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  return page.getByRole('dialog', { name: '구구구 줄넘기' })
}

test('오락기에서 공통 일일 엽전 집계를 표시하고 공원 설명서에서 줄넘기를 연다', async ({ page }) => {
  await setupPark(page)
  await page.route('**/api/v1/minigames/whack-a-mole/status', route => route.fulfill({ json: {
    serverNow: new Date().toISOString(), todayEarned: 123, dailyCap: 1000, bestScore: 0, last: null,
    rules: { durationMs: 90000, phaseMs: 30000, keys: ['S', 'D', 'F', 'J', 'K', 'L'], pointsPerCoin: 40,
      normalPoints: 10, goldPoints: 30, decoyPenalty: 10, rapidPoints: [10], comboSteps: [1], comboTenths: [10] },
  } }))
  const arcade = await openArcade(page)
  const detail = arcade.locator('.arcade-detail')
  await arcade.getByRole('button', { name: /구구구 줄넘기/ }).click()
  await expect(detail.locator('dt')).toHaveText(['참가비', '오늘 미니게임 엽전', '받는 엽전'])
  await expect(detail.locator('dd')).toHaveText(['무료', '123 / 1000냥', '50점당 1냥 · 하루 상한 안에서'])
  const thumbnail = await detail.locator('img.manual-art').getAttribute('src')
  expect(thumbnail).toBeTruthy()

  await arcade.getByRole('button', { name: /스피드 두더지 잡기/ }).click()
  await expect(detail.locator('dd')).toHaveText(['무료', '123 / 1000냥', '5점당 1냥 · 하루 상한 안에서'])
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  const speedMole = page.getByRole('dialog', { name: '스피드 두더지 잡기' })
  await expect(speedMole).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(speedMole).toBeHidden()
  await expect(arcade).toBeVisible()
  await arcade.getByRole('button', { name: '닫기', exact: true }).click()

  await page.getByRole('button', { name: '게임 설명서 F1', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await manual.getByRole('button', { name: '게임 찾아보기', exact: true }).click()
  await manual.getByRole('button', { name: '미니게임', exact: true }).click()
  const card = manual.getByRole('button', { name: '구구구 줄넘기 설명 읽기' })
  await expect(card.locator('img')).toHaveAttribute('src', thumbnail!)
  await expect.poll(() => card.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await card.click()
  await expect(manual.getByRole('heading', { name: '구구구 줄넘기', exact: true })).toBeVisible()
  await expect(manual).toContainText('GOOD 판정은 10점')
  await expect(manual).toContainText('첫 PERFECT는 15점, 2연속 이상 PERFECT는 매번 30점')
  await expect(manual).toContainText('50점당 1냥')
  await expect(manual).toContainText('랭킹 보기')
  await manual.getByRole('button', { name: '게임 목록' }).click()
  await expect(manual.getByRole('button', { name: '스피드 두더지 잡기 설명 읽기' })).toBeVisible()
})

test('뷰포트를 채우고 ESC에서 신규 라운드만 시작하거나 제출 없이 월드로 돌아간다', async ({ page }) => {
  await setupPark(page)
  const starts: string[] = []
  const completions: string[] = []
  await page.route('**/api/v1/minigames/jump-rope/**', route => {
    const request = route.request()
    if (new URL(request.url()).pathname.endsWith('/rounds')) {
      starts.push(request.headers()['idempotency-key']!)
      return route.fulfill({ status: 201, json: roundResponse(String(40 + starts.length)) })
    }
    completions.push(request.url())
    return route.fulfill({ status: 500, json: {} })
  })
  const game = await openJumpRope(page)
  const start = game.getByRole('button', { name: '게임 시작' })
  for (const viewport of [page.viewportSize()!, { width: 390, height: 800 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(() => game.boundingBox()).toEqual({ x: 0, y: 0, ...viewport })
    await expect(start).toBeInViewport({ ratio: 1 })
    await expect(game.getByRole('button', { name: '랭킹 보기' })).toBeInViewport({ ratio: 1 })
  }
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()

  const clock = await page.evaluateHandle(() => {
    const origin = performance.now()
    let elapsed = 0
    performance.now = () => origin + elapsed
    return { set: (ms: number) => { elapsed = ms } }
  })
  await start.click()
  const countdown = game.getByLabel('시작 카운트다운')
  await expect(countdown).toHaveText('3')
  await page.keyboard.press('Escape')
  const confirmation = page.getByRole('alertdialog', { name: '게임을 그만둘까요?' })
  await expect(confirmation.getByRole('heading')).toBeFocused()
  await expect(confirmation.getByRole('button', { name: '다시하기' })).toBeInViewport({ ratio: 1 })
  await clock.evaluate(time => time.set(12000))
  await page.keyboard.down('Escape')
  await page.keyboard.down('Escape')
  await page.keyboard.up('Escape')
  await page.keyboard.press('Space')
  await expect(confirmation).toHaveCount(1)
  await expect(page.locator('.rope-countdown')).toHaveText('3')
  expect(starts).toHaveLength(1)
  expect(completions).toEqual([])

  await confirmation.getByRole('button', { name: '다시하기' }).click()
  await expect(confirmation).toBeHidden()
  await expect(countdown).toHaveText('3')
  expect(starts).toHaveLength(2)
  expect(starts.every(Boolean)).toBe(true)
  expect(new Set(starts).size).toBe(2)
  await clock.evaluate(time => time.set(15750))
  await expect(countdown).toBeHidden()
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 800 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport)
    const cards = game.locator('.rope-hud__stats .rope-hud__card')
    await expect(cards).toHaveCount(3)
    for (const card of await cards.all()) await expect(card).toBeVisible()
    const boxes = await Promise.all((await cards.all()).map(card => card.boundingBox()))
    for (const box of boxes) {
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    }
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x)
    expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x)
  }
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: '다시하기' }).click()
  await expect(countdown).toHaveText('3')
  expect(new Set(starts).size).toBe(3)

  await clock.evaluate(time => time.set(19850))
  await expect(game.getByLabel('3회 중 2회 남음')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: '그만하기' }).click()
  await expect(game).toBeHidden()
  expect(completions).toEqual([])
  await expect.poll(() => page.evaluate(async () => {
    const { inputState } = await import('/src/world/inputOwnership.ts' as string)
    return inputState.minigameOpen
  })).toBe(false)
  await expect(page.locator('canvas').first()).toBeFocused()
})

function roundResponse(id: string, now = Date.now()) {
  return { id, seed: 409, rulesVersion: 1, durationMs: 60000, serverNow: new Date(now).toISOString(),
    startedAt: new Date(now + 3000).toISOString(), expiresAt: new Date(now + 98000).toISOString() }
}

async function readArcadeDetailArt(image: Locator) {
  return image.evaluate(async (element: HTMLImageElement) => {
    await element.decode()
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const detail = element.parentElement!.getBoundingClientRect()
    return {
      width: box.width, height: box.height, inset: box.left - detail.left,
      before: box.top - element.previousElementSibling!.getBoundingClientRect().bottom,
      after: element.nextElementSibling!.getBoundingClientRect().top - box.bottom,
      aspectRatio: style.aspectRatio, fit: style.objectFit, position: style.objectPosition,
      radius: style.borderRadius, border: style.borderWidth, background: style.backgroundColor,
    }
  })
}

async function readArcadeManualButton(button: Locator) {
  return button.evaluate(element => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const detail = element.parentElement!.getBoundingClientRect()
    const start = element.nextElementSibling!.getBoundingClientRect()
    return {
      width: box.width, height: box.height, inset: box.left - detail.left, startGap: start.top - box.bottom,
      color: style.color, background: style.backgroundColor, border: style.border, radius: style.borderRadius,
      fontSize: style.fontSize, margin: style.margin,
    }
  })
}

test('줄넘기 상세 이미지와 설명서 버튼이 다른 오락기 게임과 같고 설명서에서 돌아와 시작할 수 있다', async ({ page }) => {
  await setupPark(page)
  await page.route('**/api/v1/minigames/jump-rope/rounds', route =>
    route.fulfill({ status: 201, json: roundResponse('51') }))
  const arcade = await openArcade(page)
  const image = arcade.locator('.arcade-detail > img.manual-art')
  const manualButton = arcade.getByRole('button', { name: '설명서', exact: true })
  const jumpRopeCard = arcade.getByRole('button', { name: /구구구 줄넘기/ })
  const cardImage = jumpRopeCard.locator('img')
  const source = await cardImage.getAttribute('src')
  expect(source).toBeTruthy()

  for (const width of [1920, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await arcade.getByRole('button', { name: /스피드 두더지 잡기/ }).click()
    const reference = await readArcadeDetailArt(image)
    const referenceButton = await readArcadeManualButton(manualButton)
    expect(reference).toMatchObject({ aspectRatio: '2 / 1', fit: 'cover', position: '50% 50%', radius: '10px' })
    expect(reference.height).toBeGreaterThan(0)
    expect(reference.height).toBeLessThanOrEqual(120)

    await arcade.getByRole('button', { name: /더하기 빼기 아케이드/ }).click()
    expect(await readArcadeDetailArt(image)).toEqual(reference)

    await jumpRopeCard.click()
    await expect(image).toHaveAttribute('src', source!)
    expect(await readArcadeDetailArt(image)).toEqual(reference)
    await expect(manualButton).toBeVisible()
    expect(await readArcadeManualButton(manualButton)).toEqual(referenceButton)
    await expect(cardImage).toHaveCSS('object-fit', 'contain')
    await expect(cardImage).toHaveCSS('aspect-ratio', '16 / 9')
  }

  await manualButton.click()
  const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await expect(manual.getByRole('heading', { name: '구구구 줄넘기', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(manual).toBeHidden()
  await expect(manualButton).toBeFocused()

  await page.setViewportSize({ width: 1920, height: 1080 })
  await manualButton.click()
  await expect(manual).toHaveAttribute('data-phase', 'open')
  await expect(manual.getByRole('heading', { name: '구구구 줄넘기', exact: true })).toBeVisible()
  await manual.getByRole('button', { name: '게임 목록' }).click({ timeout: 5000 })
  await expect(manual.getByRole('button', { name: '구구구 줄넘기 설명 읽기' })).toBeVisible()
  await manual.getByRole('button', { name: '설명서 닫기', exact: true }).click()
  await expect(manual).toBeHidden()
  await expect(jumpRopeCard).toHaveAttribute('aria-pressed', 'true')
  await expect(manualButton).toBeFocused()

  await page.setViewportSize({ width: 320, height: 800 })
  await arcade.getByRole('button', { name: /이 게임 하기/ }).click()
  const game = page.getByRole('dialog', { name: '구구구 줄넘기' })
  await game.getByRole('button', { name: '게임 시작' }).click()
  await expect(game.getByLabel('시작 카운트다운')).toBeVisible()
})

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
  const viewport = page.viewportSize()!
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 640 })
    await expect(ranking.getByRole('button', { name: '닫기' })).toBeInViewport({ ratio: 1 })
  }
  await page.setViewportSize(viewport)
  await page.keyboard.press('Escape')
  await expect(ranking).toBeHidden()
  await expect(game.getByRole('button', { name: '랭킹 보기' })).toBeFocused()
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
  await page.keyboard.press('Escape')
  await expect(game).toBeVisible()
  await expect(page.getByRole('alertdialog', { name: '게임을 그만둘까요?' })).toHaveCount(0)
  expect(await cues.jsonValue()).toEqual(['3', '2', '1', 'GO!'])
  await expect(game.getByRole('heading', { name: '게임 오버' })).toBeVisible({ timeout: 7000 })
  await expect(game.locator('.rope-result__score dd')).toHaveText('—')
  await expect(game.locator('.rope-result__reward')).toHaveCount(0)
  await game.getByRole('button', { name: '기록 저장 다시 시도' }).click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions).toEqual(Array(2).fill({ path: '/api/v1/minigames/jump-rope/rounds/42/complete', body: { jumpOffsetsUs: [] } }))
  await expect(game.getByText('서버에서 기록을 확정하는 중입니다.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(game).toBeVisible()
  await expect(page.getByRole('alertdialog', { name: '게임을 그만둘까요?' })).toHaveCount(0)
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
