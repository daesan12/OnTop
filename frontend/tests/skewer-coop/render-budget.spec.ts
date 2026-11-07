import { expect, test, type Page } from '@playwright/test'

async function probeChef(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true')
  await page.evaluate(async () => {
    const url = '/src/features/skewer/chef/ChefScene.ts'
    const { ChefScene } = await import(/* @vite-ignore */ url)
    const paint = ChefScene.prototype.paintActions
    ChefScene.prototype.paintActions = function (...args: unknown[]) {
      Reflect.set(window, 'skewerRenderProbe', this)
      return paint.apply(this, args)
    }
  })
  await page.waitForFunction(() => !!Reflect.get(window, 'skewerRenderProbe')?.hall.sculpted)
  await page.evaluate(async () => { await Reflect.get(window, 'skewerRenderProbe').hall.people.guestsReady })
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-order-image-count', '2')
}

test('요리사 고정 배경은 렌더 예산을 지키고 PC의 숨은 시계는 갱신하지 않는다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await probeChef(page, '/tests/skewer-coop/fixtures/play-feedback.html?role=chef')
  await page.evaluate(() => Reflect.get(window, 'skewerFeedback').clock(30))
  const before = await page.evaluate(() => Reflect.get(window, 'skewerRenderProbe').timerTexture.version as number)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => Reflect.get(window, 'skewerRenderProbe').timerTexture.version)).toBe(before)
  const calls = await page.evaluate(() => {
    const scene = Reflect.get(window, 'skewerRenderProbe'), renderer = scene.renderer, render = renderer.render
    let total = 0
    renderer.render = function (...args: unknown[]) { const value = render.apply(this, args); total += this.info.render.calls; return value }
    try { scene.post.render() } finally { renderer.render = render }
    return total as number
  })
  expect(calls).toBeGreaterThan(0)
  expect(calls).toBeLessThan(900) // 기본 1440×900 검수 장면의 기존 1669회 제출 회귀를 막는다.
  const vr = await page.evaluate(() => {
    const scene = Reflect.get(window, 'skewerRenderProbe'), before = scene.timerTexture.version
    scene.setMode('vr')
    return { before, after: scene.timerTexture.version }
  })
  expect(vr.after).toBeGreaterThan(vr.before)
  expect(errors).toEqual([])
})

test('서빙 장면도 종료할 때 광원 그림자 타깃과 캔버스를 해제한다', async ({ page }) => {
  await page.goto('/tests/skewer-coop/fixtures/play-feedback.html?role=server')
  await expect(page.locator('.service-stage')).toHaveAttribute('data-server-model', 'sculpted')
  await page.evaluate(async () => {
    const url = '/src/features/skewer/serviceHall/rendering/ServiceScene.ts'
    const { ServiceScene } = await import(/* @vite-ignore */ url), update = ServiceScene.prototype.update
    ServiceScene.prototype.update = function (...args: unknown[]) {
      Reflect.set(window, 'skewerRenderProbe', this); return update.apply(this, args)
    }
  })
  await page.waitForFunction(() => !!Reflect.get(window, 'skewerRenderProbe'))
  const disposed = await page.evaluate(() => {
    const scene = Reflect.get(window, 'skewerRenderProbe')
    let targets = 0, released = 0
    scene.scene.traverse((object: any) => {
      if (!object.shadow?.map) return
      targets++; object.shadow.map.addEventListener('dispose', () => { released++ })
    })
    scene.dispose()
    return { targets, released, canvases: document.querySelectorAll('.service-stage canvas').length }
  })
  expect(disposed.targets).toBeGreaterThan(0)
  expect(disposed.released).toBe(disposed.targets)
  expect(disposed.canvases).toBe(0)
})

test('반복 조립·빼기는 GPU 자원을 늘리지 않고 종료 시 장면 자원을 해제한다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await probeChef(page, '/skewer-chef.html?mode=pc')
  await page.keyboard.press('Digit1'); await page.keyboard.press('Space'); await page.waitForTimeout(40)
  await page.keyboard.press('Backspace'); await page.waitForTimeout(80)
  const before = await page.evaluate(() => ({ ...Reflect.get(window, 'skewerRenderProbe').renderer.info.memory }))
  for (let n = 0; n < 20; n++) {
    await page.keyboard.press('Space'); await page.waitForTimeout(20)
    await page.keyboard.press('Backspace'); await page.waitForTimeout(20)
  }
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-stack', '')
  expect(await page.evaluate(() => ({ ...Reflect.get(window, 'skewerRenderProbe').renderer.info.memory }))).toEqual(before)
  const disposed = await page.evaluate(() => {
    const scene = Reflect.get(window, 'skewerRenderProbe')
    let shadowTargets = 0, releasedShadows = 0
    scene.scene.traverse((object: any) => {
      if (!object.shadow?.map) return
      shadowTargets++; object.shadow.map.addEventListener('dispose', () => { releasedShadows++ })
    })
    scene.dispose()
    return { ...scene.renderer.info.memory, shadowTargets, releasedShadows, canvases: document.querySelectorAll('.chef-stage canvas').length }
  })
  expect(disposed.geometries).toBe(0)
  expect(disposed.shadowTargets).toBeGreaterThan(0)
  expect(disposed.releasedShadows).toBe(disposed.shadowTargets)
  expect(disposed.textures).toBeLessThanOrEqual(3)
  expect(disposed.canvases).toBe(0)
  expect(errors).toEqual([])
})
