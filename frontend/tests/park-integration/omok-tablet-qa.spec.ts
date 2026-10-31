import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from '../e2e/contractFixture'
import { PARK_MAP_VERSION } from '../../src/map/park/generated/mapVersion'

async function load(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () => {
    const { probe, sceneReady } = await import('/tests/park-integration/probe.ts' as string)
    return sceneReady() ? probe().identity : null
  }), { timeout: 90000 }).toMatchObject({ mapId: 'park', schemaVersion: 2, mapVersion: PARK_MAP_VERSION })
}

const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const messages: string[] = []; errors.set(page, messages)
  page.on('pageerror', error => messages.push(error.message))
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('generated park tablet keeps the coin, agreement spacing and full portraits through resize', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, manualLobby: true, tabletServer: true,
    publicProfiles: { '102': { nickname: '다른 참가자', characterGender: 'FEMALE' } } })
  await load(page)
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click()
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await expect(tablet).toBeVisible({ timeout: 20000 })
  const chat = page.getByRole('region', { name: '주변 채팅', exact: true })
  await expect(chat).toBeVisible()
  await page.keyboard.press('Enter')
  const message = chat.getByRole('textbox', { name: '주변 채팅 메시지' })
  await expect(message).toBeFocused()
  await message.fill('판돈 25냥으로 오목 할까요?')
  await message.press('Enter')
  await expect(chat.getByRole('log')).toContainText('판돈 25냥으로 오목 할까요?')
  await expect(tablet).toBeVisible()
  await tablet.getByLabel('1인 참가비').fill('25')
  await tablet.getByLabel('1인 참가비').press('Enter')
  await expect(tablet.getByLabel('1인 참가비')).toBeFocused()
  await expect(message).toHaveCount(0)
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await expect(tablet.getByRole('heading', { name: '오목' })).toBeVisible()
  const agreement = tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' })
  const ready = tablet.getByRole('button', { name: '준비 완료', exact: true })
  const lastTabletControl = tablet.locator('button:enabled,input:enabled,select:enabled').last()
  await lastTabletControl.press('Tab')
  await expect(chat.getByRole('button', { name: '채팅 기록 보기' })).toBeFocused()
  await chat.getByRole('button', { name: '채팅 기록 보기' }).press('Shift+Tab')
  await expect(lastTabletControl).toBeFocused()
  await chat.getByRole('button', { name: '채팅 입력창 열기' }).press('Tab')
  await expect(tablet.locator('button:enabled,input:enabled,select:enabled').first()).toBeFocused()
  await expect(ready).toBeDisabled()
  await expect(tablet.locator('.tablet-bet-confirm img')).toHaveAttribute('src', /yeopjeon-icon/)
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await expect(async () => {
      const label = (await tablet.locator('.tablet-amount-agreement').boundingBox())!
      const edit = (await tablet.getByRole('button', { name: '게임·판돈 변경' }).boundingBox())!
      expect(edit.y - label.y - label.height).toBeGreaterThan(6)
      await expect(tablet.locator('.tablet-name')).toHaveCount(2)
      if (size.width <= 900) {
        await expect(tablet.locator('.tablet-portrait').first()).toBeHidden()
      } else {
        const portraits = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).tabletPortraitProbe())
        expect(portraits.filter(Boolean)).toHaveLength(2)
        for (const portrait of portraits) {
          expect(portrait!.orthographic).toBe(true)
          expect(Math.abs(portrait!.width - portrait!.containerWidth)).toBeLessThanOrEqual(2)
          for (const hand of portrait!.hands) { expect(Math.abs(hand[0]!)).toBeLessThan(.94); expect(Math.abs(hand[1]!)).toBeLessThan(.94) }
        }
      }
    }).toPass({ timeout: 15000 })
    await expect(chat).toBeVisible()
    await chat.getByRole('button', { name: '채팅 입력창 열기' }).click()
    await expect(message).toBeFocused()
    await message.press('Escape')
    await expect(message).toHaveCount(0)
    await expect(tablet).toBeVisible()
    await screenshot(page, `new-map-tablet-qa-${size.width}`)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await tablet.getByRole('button', { name: '게임·판돈 변경', exact: true }).click()
  await expect(tablet.getByRole('heading', { name: '어떤 게임을 할까요?' })).toBeVisible()
  await expect(chat).toBeVisible()
  await tablet.getByRole('button', { name: '돌아가기', exact: true }).click()
  await agreement.check(); await expect(ready).toBeEnabled()
  await ready.click(); server.readyTabletOthers(true)
  await expect(tablet.getByRole('button', { name: '게임 시작', exact: true })).toBeEnabled()
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
  server.finishGame(); server.settle()
  const result = page.getByRole('dialog', { name: '경기 결과', exact: true })
  await expect(result).toBeVisible()
  await expect(result).not.toContainText('경기 종료 사유')
  await expect(result).not.toContainText('정산 완료')
  await expect(result).toContainText('내 엽전')
  await screenshot(page, 'feedback-board-result', 'disabled')
})

test('generated park spectator fits the board around the HUD and sends H8 without placing a stone', async ({ page }) => {
  const server = await fixture(page, { generatedPark: true, omok: true, publicSpectator: true, spectatorEvents: true,
    publicProfiles: { '102': { nickname: '관전 백돌', characterGender: 'FEMALE' } } })
  await load(page)
  await page.evaluate(async () => {
    const { TABLES } = await import('/src/park/mapConfig.ts' as string)
    const { parkRuntime } = await import('/src/park/runtime/runtime.ts' as string)
    parkRuntime.inspectTable(TABLES[0].id)
  })
  await page.getByRole('dialog', { name: '테이블 정보', exact: true }).getByRole('button', { name: '경기 관전', exact: true }).click()
  const header = page.getByLabel('오목 관전 경기 정보', { exact: true })
  await expect(header).toContainText('관전 백돌')
  await expect(page.getByRole('group', { name: '관전 시점', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '판 보기', exact: true }).click()
  for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size)
    await expect(async () => {
      const camera = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).omokCameraProbe())
      expect(camera.ready).toBe(true); expect(camera.viewport).toEqual([size.width, size.height])
      const top = (await header.boundingBox())!
      const bottom = Math.min((await page.locator('.omok-spectator-toolbar').boundingBox())!.y,
        (await page.locator('.omok-spectator-chat').boundingBox())!.y)
      for (const corner of camera.corners) {
        expect(corner[0]).toBeGreaterThan(5); expect(corner[0]).toBeLessThan(size.width - 5)
        expect(corner[1]).toBeGreaterThan(top.y + top.height + 5); expect(corner[1]).toBeLessThan(bottom - 5)
      }
    }).toPass({ timeout: 15000 })
    if (size.width === 390) {
      await page.getByRole('button', { name: '경기 채팅 열기', exact: true }).click()
      await expect(page.getByRole('form', { name: '오목 관전 채팅' }).getByRole('textbox')).toBeFocused()
      await page.keyboard.press('Escape')
      await screenshot(page, 'new-map-observer-mobile')
    }
  }
  const point = await page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).omokPlayProbe(7, 7))
  await page.mouse.click(point!.point.x, point!.point.y)
  await expect(page.getByLabel('위치 추천 전송 상태')).toContainText('H8 추천을 보냈어요.')
  await expect(page.locator('.omok-ping-label')).toContainText('H8 추천')
  await screenshot(page, 'new-map-observer-h8')
  expect(server.sent.filter(message => message.type === 'GAME_ACTION_SEND')).toHaveLength(0)
  await page.getByRole('button', { name: '주변 보기', exact: true }).click()
  await expect(page.getByRole('button', { name: '주변 보기', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(server.sent.filter(message => message.type === 'GAME_WATCH')).toHaveLength(1)
  await page.getByRole('button', { name: '관전 종료', exact: true }).click()
  await expect(header).toHaveCount(0)
})
