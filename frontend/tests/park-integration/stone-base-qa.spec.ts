import { expect, test } from '@playwright/test'
import { parkFixture } from './fixture'
import { screenshot } from '../e2e/contractFixture'
import { SITES, SETTINGS } from '../../src/layout-preview/layout'

test('돌탑 난간의 평지·계단 기단을 이동 시점에서 표시한다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if(e.type()==='error')errors.push(e.text()) })
  const server = await parkFixture(page)
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  for(const [label,x,z,y,yaw] of [
    ['corner', SITES.pagoda.x+SETTINGS.pagoda.terraceHalf-1, SITES.pagoda.z+SETTINGS.pagoda.terraceHalf-1,SITES.pagoda.floor+.8,-Math.PI*.75],
    ['stairs',SITES.pagoda.x+4.3,SITES.pagoda.z+15.8,.8,Math.PI*.75],
  ] as const){
    server.place({x,y,z,yaw})
    for(const delta of [-.05,0,.05]){
      await page.evaluate(async yaw => {
        const {viewControls} = await import('/src/world/cameraPerspective.ts' as string)
        viewControls.yaw=yaw;viewControls.pitch=.22
      },yaw+delta)
      await page.waitForTimeout(250)
    }
    await screenshot(page,`stone-base-qa-${label}`)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
