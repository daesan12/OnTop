import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { bungeoppangFixture } from './bungeoppangFixture'
import { facilityCatalog } from '../fixtures/facilityCatalog'
import { feedbackFixture } from './feedbackFixture'
import { notesFixture } from './notesFixture'
import { MAILBOX, NOTES_BOX } from '../../src/config'

// Camera buttons are gone from the HUD; V and a Ctrl tap drive the same state, read here.
const cameraState = (page: Page) => page.evaluate(async () => ({
  first: (await import('/src/world/cameraPerspective.ts' as string)).useCameraPerspective.getState().perspective === 'first-person',
  mouse: (await import('/src/world/mouseLook.ts' as string)).useMouseLook.getState().active as boolean,
}))
const probe = (page: Page) => page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe())
const own = (page: Page) => page.evaluate(async () => {
  const { useFacilityState } = await import('/src/features/facilities/state.ts' as string)
  const { useSession } = await import('/src/network/worldClient.ts' as string)
  const s = useFacilityState.getState()
  return { lease: s.occupancies[useSession.getState().sessionId], pending: s.pending, awaitingWorld: s.awaitingWorld }
})
async function loaded(page: Page, first = true) {
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await page.locator('canvas').focus()
  await expect.poll(() => page.evaluate(async () => (await import('/src/world/roamingCamera.ts' as string)).canControlRoamingCamera())).toBe(true)
  await page.evaluate(async () => { (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(.8, .37, 8.4) })
  if (first) await page.keyboard.press('KeyV')
  await expect.poll(async () => String((await cameraState(page)).first)).toBe(String(first))
}
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list)
  page.on('pageerror', e => list.push(e.message))
  page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

// Fitness keeps mouse look while exercising (S15P31B105-217), so it is left with the keyboard path.
const leaveFitness = (page: Page) => page.evaluate(async () => { await (await import('/src/features/fitness/controller.ts' as string)).leaveFitness() })
for (const first of [true, false]) test(`exercise keeps mouse look and returns to original ${first ? 'first' : 'third'} person and orbit only after approved exit position`, async ({ page }) => {
  const d = facilityCatalog.facilities.find(d => d.kind === 'FITNESS')!
  const server = await fixture(page, { manualMovement: true, position: d.exit })
  await loaded(page, first)
  const before = (await probe(page)).controls
  await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await page.evaluate(async id => { await (await import('/src/features/fitness/controller.ts' as string)).enterFitness(id) }, d.facilityId)
  await expect.poll(async () => (await own(page)).lease?.facilityId).toBe(d.facilityId)
  await expect.poll(async () => (await own(page)).pending).toBe(false)
  expect((await cameraState(page)).mouse).toBe(true)
  await page.mouse.move(650, 250); await page.mouse.move(710, 275, { steps: 5 }); await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await probe(page)).controls).not.toEqual(before)
  server.facilities.blockedExit(true); await leaveFitness(page)
  await expect(page.getByLabel('시설 연결 상태')).toContainText('FACILITY_EXIT_BLOCKED')
  expect((await own(page)).lease?.facilityId).toBe(d.facilityId)
  expect((await cameraState(page)).mouse).toBe(true)
  server.facilities.blockedExit(false); server.facilities.holdWorld(); await leaveFitness(page)
  await expect.poll(async () => (await own(page)).awaitingWorld).toBe(true)
  expect((await cameraState(page)).mouse).toBe(true)
  expect((await probe(page)).controls).not.toEqual(before)
  server.facilities.flushWorld()
  await expect.poll(async () => (await own(page)).pending).toBe(false)
  await expect.poll(async () => String((await cameraState(page)).first)).toBe(String(first))
  await expect.poll(async () => (await probe(page)).controls).toEqual(before)
  await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await expect.poll(async () => (await probe(page)).ownVisible).toBe(!first)
  await screenshot(page, first ? 'camera-return-exercise-first' : 'camera-return-exercise-third')
  expect(server.sent.some(m => /CAMERA|PERSPECTIVE/.test(m.type))).toBe(false)
})

test('bench and table-specific cameras preserve the earlier orbit instead of overwriting the roaming preference', async ({ page }) => {
  const d = facilityCatalog.facilities.find(d => d.kind === 'BENCH')!
  await fixture(page, { manualMovement: true, position: d.exit }); await loaded(page)
  const before = (await probe(page)).controls
  await page.evaluate(async id => { await (await import('/src/park/runtime/runtime.ts' as string)).parkRuntime.useFacility(id, 0, new AbortController().signal) }, d.facilityId)
  await expect.poll(async () => (await own(page)).pending).toBe(false)
  await expect(page.getByText('벤치 이용 중', { exact: true })).toBeVisible()
  await page.mouse.move(650, 250); await page.mouse.down(); await page.mouse.move(720, 270); await page.mouse.up()
  await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
  await expect.poll(async () => String((await cameraState(page)).first)).toBe('true')
  await expect.poll(async () => (await probe(page)).controls).toEqual(before)
})

test('window loss cancels mouse re-lock while retaining first-person and orbit restoration', async ({ page }) => {
  const d = facilityCatalog.facilities.find(d => d.kind === 'FITNESS')!
  await fixture(page, { manualMovement: true, position: d.exit }); await loaded(page)
  const before = (await probe(page)).controls
  await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await page.evaluate(async id => { await (await import('/src/features/fitness/controller.ts' as string)).enterFitness(id) }, d.facilityId)
  await expect.poll(async () => (await own(page)).pending).toBe(false)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.locator('canvas').focus(); await page.keyboard.press('KeyW')
  await expect.poll(async () => String((await cameraState(page)).first)).toBe('true')
  await expect.poll(async () => (await probe(page)).controls).toEqual(before)
  await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('false')
})

// Bungeoppang still releases the lock (fixed view), so it exercises the automatic return path.
test('bungeoppang return fades the third-person avatar and nickname without delaying park controls', async ({ page }) => {
  await bungeoppangFixture(page); await loaded(page, false)
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).openBungeoppang())
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
  await page.evaluate(async () => {
    const { bungeoppangAppearanceProbe } = await import('/tests/e2e/sceneProbe.ts' as string)
    const samples: { opacity: number; materials: number[]; visible: boolean | undefined; peers: { opacity: number }[] }[] = []
    Reflect.set(window, '__bungAppearanceSamples', samples)
    const sample = () => {
      samples.push(bungeoppangAppearanceProbe())
      if (samples.length < 180 && (!samples.some(s => s.opacity > 0 && s.opacity < 1 && s.visible)
        || samples.at(-1)!.opacity < 1)) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'ESC 나가기', exact: true }).click()
  await expect(page.locator('.bung-root')).toHaveCount(0)
  const state = await page.evaluate(async () => ({
    input: (await import('/src/world/inputOwnership.ts' as string)).inputState.minigameOpen,
    phase: (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().phase,
  }))
  expect(state).toEqual({ input: false, phase: 'idle' })
  await expect.poll(() => page.evaluate(() => {
    const samples = Reflect.get(window, '__bungAppearanceSamples') as { opacity: number; materials: number[]; visible?: boolean; peers: { opacity: number }[] }[]
    return samples.some(s => s.visible && s.opacity > 0 && s.opacity < 1 && s.materials.some(opacity => opacity > 0 && opacity < 1))
      && samples.at(-1)?.opacity === 1 && samples.every(s => s.peers.every(peer => peer.opacity === 1))
  })).toBe(true)
  await expect(page.locator('.avatar-overhead-own')).toHaveCSS('opacity', '1')
  await screenshot(page, 'bungeoppang-return-faded-in')
  await page.keyboard.press('KeyW')
  await expect.poll(async () => (await probe(page)).ownVisible).toBe(true)
})

test('browser rejection of automatic mouse return is a one-shot failure with a working explicit retry', async ({ page }) => {
  await bungeoppangFixture(page); await loaded(page)
  await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).openBungeoppang())
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
  await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('false')
  await page.locator('canvas').evaluate(canvas => {
    canvas.dataset.returnRequests = '0'
    canvas.requestPointerLock = () => { canvas.dataset.returnRequests = String(Number(canvas.dataset.returnRequests) + 1); return Promise.reject(new Error('test return rejection')) }
  })
  await page.getByRole('button', { name: 'ESC 나가기', exact: true }).click()
  await expect.poll(async () => String((await cameraState(page)).first)).toBe('true')
  await expect(page.getByText(/마우스 시점을 고정하지 못했어요/)).toBeVisible()
  await page.waitForTimeout(250)
  await expect(page.locator('canvas')).toHaveAttribute('data-return-requests', '1')
  await page.locator('canvas').evaluate(canvas => Reflect.deleteProperty(canvas, 'requestPointerLock'))
  await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
})

test('bungeoppang temporary camera returns to the original first-person view and mouse lock', async ({ page }) => {
  await bungeoppangFixture(page); await loaded(page)
  const before = (await probe(page)).controls
  await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).openBungeoppang())
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible()
  await expect.poll(async () => (await probe(page)).active).toBe(false)
  await page.getByRole('button', { name: 'ESC 나가기', exact: true }).click()
  await expect.poll(async () => String((await cameraState(page)).first)).toBe('true')
  await expect.poll(async () => (await probe(page)).controls).toEqual(before)
  await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
  await expect.poll(async () => (await probe(page)).ownVisible).toBe(false)
})

for (const kind of ['feedback', 'notes'] as const) for (const first of [true, false]) {
  test(`E ${kind} restores ${first ? 'first' : 'third'} person and mouse look after the whole visit, including nested F1`, async ({ page }) => {
    const position = kind === 'feedback'
      ? { x: MAILBOX.x, y: .8, z: MAILBOX.z + 1, yaw: Math.PI }
      : { x: NOTES_BOX.x, y: NOTES_BOX.y + .8, z: NOTES_BOX.z + 1, yaw: Math.PI }
    const server = await fixture(page, { manualMovement: true, position })
    if (kind === 'feedback') await feedbackFixture(page)
    else await notesFixture(page)
    await loaded(page, first)
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).orbit(0, .35, 8.4))
    const before = (await probe(page)).controls
    const panel = page.getByRole('dialog', { name: kind === 'feedback' ? '온탑 소리함' : '전망대 익명 메모', exact: true })
    const selected = () => page.evaluate(async () => (await import('/src/features/interactions/parkInteraction.ts' as string)).getParkInteraction()?.kind)
    await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')
    await expect.poll(selected).toBe(kind)
    await page.keyboard.press('KeyE')
    await expect(panel).toBeVisible()
    await expect.poll(async () => (await probe(page)).active).toBe(false)
    if (kind === 'notes') await panel.getByRole('button', { name: /메모 작성하기/ }).click()
    await panel.getByRole('textbox').fill('이용을 마칠 때까지 보관할 내용')
    await page.keyboard.press('F1')
    const manual = page.getByRole('dialog', { name: '게임 설명서', exact: true })
    await expect(manual).toHaveAttribute('data-phase', 'open')
    expect((await probe(page)).active).toBe(false)
    await page.keyboard.press('Escape'); await expect(manual).toHaveCount(0)
    await expect(panel.getByRole('textbox')).toHaveValue('이용을 마칠 때까지 보관할 내용')
    await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('false')
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0)
    await expect.poll(async () => String((await cameraState(page)).first)).toBe(String(first))
    await expect.poll(async () => (await probe(page)).controls).toEqual(before)
    await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('true')

    // A second visit started without mouse look must leave it off on close.
    await page.keyboard.press('Control'); await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('false')
    await expect.poll(selected).toBe(kind)
    await page.keyboard.press('KeyE'); await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: kind === 'feedback' ? '소리함 닫기' : '익명 메모 닫기', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect.poll(async () => String((await cameraState(page)).first)).toBe(String(first))
    await expect.poll(async () => (await probe(page)).controls).toEqual(before)
    await expect.poll(async () => String((await cameraState(page)).mouse)).toBe('false')
    expect(server.sent.some(m => /CAMERA|PERSPECTIVE/.test(m.type))).toBe(false)
  })
}
