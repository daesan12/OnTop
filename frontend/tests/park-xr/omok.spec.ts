import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { fixture } from '../e2e/contractFixture'
import { loadRenewalFixtureMap } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'

test('기존 오목 대국을 VR에서 이어 두고 B로 일반 화면에 돌아온다', async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const renewal = process.env.PARK_XR_MAP === 'renewal' ? loadRenewalFixtureMap() : undefined
  const anchor = renewal?.data.tables[0]
  const approach = anchor?.interactionPoints?.[0]
  const server = await fixture(page, { generatedPark: true, omok: true, ownUserId: '101', manualLobby: true, tabletServer: true,
    ...(renewal && anchor && approach ? { connectedMap: renewal.identity, mapVersion: renewal.identity.mapVersion,
      anchorId: anchor.id, position: { x: approach[0], y: approach[1] + .8, z: approach[2], yaw: 0 } } : {}),
  })
  await page.goto('/park')
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click({ timeout: 90000 })
  server.host('101')
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  server.omokColors('101')
  await page.evaluate(async p => (await import(p)).install(), helper)
  await page.getByRole('button', { name: '오목 VR 시작', exact: true }).click()
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await expect.poll(() => page.evaluate(async p => (await import(p)).xrCanvasInView('park-xr-omok'), helper)).toBe(true)
  server.turnTo('101')
  await page.evaluate(async p => (await import(p)).aimCanvas('park-xr-omok', 479 / 960, 524 / 1024), helper)
  await page.waitForTimeout(120)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), helper)
  await expect.poll(() => server.sent.find(m => m.type === 'GAME_ACTION_SEND')?.payload.input).toEqual({ x: 7, y: 7 })
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('omok-vr-board.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(false)
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
})
