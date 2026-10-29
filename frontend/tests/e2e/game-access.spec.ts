import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { benchTable } from '../../src/features/interactions/benchSpectator'
const bench = facilityCatalog.facilities.find(d => d.kind === 'BENCH' && benchTable(d.facilityId)?.pavilionId === 'P1')!
const anchor = benchTable(bench.facilityId)!
const view = (page: Page) => page.evaluate(async () => (await import('/src/features/interactions/benchSpectator.ts' as string)).useBenchSpectator.getState().view)
const yaw = (page: Page) => page.evaluate(async () => (await import('/src/features/interactions/benchSpectator.ts' as string)).benchLook.yaw)
test('bench Tab cycles views, left drag orbits, right drag stays still, and removed UI stays absent', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
 await fixture(page,{publicSpectator:true, manualMovement:true, position:bench.center, anchorId:anchor.id, omok:true})
 await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect.poll(() => page.evaluate(async () => (await import('/src/features/facilities/state.ts' as string)).useFacilityState.getState().ready)).toBe(true)
 await page.evaluate(async id => (await import('/src/features/interactions/benchController.ts' as string)).sitBench(id,0),bench.facilityId)
 await expect(page.getByRole('button',{name:'가까이 관전',exact:true})).toBeEnabled()
 await expect(page.getByRole('button',{name:'벤치에서 일어나기',exact:true})).toHaveCount(0)
 await expect(page.getByText('서버가 좌석 점유를 동기화합니다.')).toHaveCount(0)
 await page.locator('canvas').focus(); await page.keyboard.press('Tab')
 await expect.poll(() => view(page)).toBe('participants')
 const before=await yaw(page)
 await page.mouse.move(950,500); await page.mouse.down({button:'right'}); await page.mouse.move(1050,500,{steps:4}); await page.mouse.up({button:'right'})
 expect(await yaw(page)).toBe(before)
 await page.mouse.down({button:'left'}); await page.mouse.move(1150,500,{steps:4}); await page.mouse.up({button:'left'})
 await expect.poll(() => yaw(page)).not.toBe(before)
 await page.keyboard.press('Tab'); await expect.poll(() => view(page)).toBe('board')
 await expect(page.getByText('진행 경기 시작 대기')).toHaveCount(0)
 await expect(page.getByText('관전 안내',{exact:true})).toHaveCount(0)
 await page.waitForTimeout(1000); await screenshot(page,'game-access-board')
 await page.keyboard.press('Tab'); await expect.poll(() => view(page)).toBe('seated')
 await page.keyboard.press('Shift+Tab'); await expect.poll(() => view(page)).toBe('board')
 await page.keyboard.press('KeyW'); await expect(page.getByRole('group',{name:'벤치 관전',exact:true})).toHaveCount(0)
 expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
test('table approach has a seating action and no public information dialog', async ({page}) => {
 const server = await fixture(page,{manualMovement:true, anchorId:anchor.id,
   position:{x:anchor.position[0],y:anchor.position[1]+.8,z:anchor.position[2]+1,yaw:Math.PI}})
 await page.goto('/park'); await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 await expect(page.getByRole('button',{name:'E 테이블에 앉기',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'테이블 정보·관전',exact:true})).toHaveCount(0)
 await page.evaluate(async id => (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.inspectTable(id),anchor.id)
 await expect(page.getByRole('dialog',{name:'테이블 정보',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click()
 await expect.poll(() => server.sent.filter(m => m.type === 'TABLE_JOIN').length).toBe(1)
 await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId)).toBe('fixture-server-table')
})
