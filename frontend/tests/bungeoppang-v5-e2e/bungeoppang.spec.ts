import { expect, test, type Page } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixture, screenshot } from '../e2e/contractFixture';
const state = (page: Page) => page.evaluate(async () =>
  (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).v5Probe());
async function level(page: Page, slot: number) {
  return page.evaluate(async i => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { cookLevel } = await import('/src/features/bungeoppang/rulesV4.ts' as string);
    const { gameNow } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    const s = useBungeoppang.getState(), p = s.grill!.slots[i];
    return cookLevel(p.since, gameNow(), p.heat, s.rules);
  }, slot);
}
test('v5 reference 2.5D screen, ten stock, selective delivery and trash', async ({ page }, info) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.url().includes('/minigames/')) requests.push(r.url()); });
  await page.addInitScript(() => {
    const tasks: { startTime: number; duration: number }[] = [];
    Reflect.set(window, '__bungLongTasks', tasks);
    new PerformanceObserver(list => {
      for (const task of list.getEntries()) tasks.push({ startTime: task.startTime, duration: task.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
  const park = await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect.poll(() => park.connections).toBeGreaterThan(0);
  park.pose({ x: -33.5, z: 17.5, yaw: .507 });
  const savedView = await page.evaluate(async () => {
    const { setCameraPerspective, viewControls } = await import('/src/world/cameraPerspective.ts' as string);
    const previous = { ...viewControls }; setCameraPerspective('first-person');
    Object.assign(viewControls, { yaw: .507, pitch: .02 });
    (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.42);
    return previous;
  });
  await page.waitForTimeout(1000); await screenshot(page, 'v5-cart-in-park');
  park.pose({ x: -36, z: 16.3, yaw: Math.PI });
  await page.evaluate(async previous => {
    const { setCameraPerspective, viewControls } = await import('/src/world/cameraPerspective.ts' as string);
    setCameraPerspective('third-person'); Object.assign(viewControls, previous);
  }, savedView);
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toContainText('3분');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  await expect(page.locator('.bung25-order')).toHaveCount(3);
  const playStarted = await page.evaluate(() => performance.now());
  expect((await state(page)).people).toHaveLength(3);
  for (const [i, tool] of ['batter', 'bean', 'custard', 'pizza', 'chocolate'].entries()) {
    const p = (await state(page)).ui!.tools[i]!; await page.mouse.click(p.x, p.y);
    expect((await state(page)).tool).toBe(tool);
  }
  await screenshot(page, 'v5-start-1280');
  const keys = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD'];
  const inputTrace: unknown[] = [];
  // Real input and clock: capacity/interaction coverage uses valid GOOD bread with headroom
  // for browser-driver latency. Golden thresholds are covered by the pure rule tests.
  for (const batch of [[1, 1, 2, 2, 3, 4], [1, 2, 3, 4]]) {
    await page.waitForTimeout(350);
    for (let i = 0; i < batch.length; i++) {
      await page.keyboard.press('Space'); await page.keyboard.press(keys[i]!);
      expect((await state(page)).grill!.slots[i]!.phase).toBe('batter');
      await page.waitForTimeout(310); await page.keyboard.press(`Digit${batch[i]}`); await page.keyboard.press(keys[i]!);
      expect((await state(page)).grill!.slots[i]!.phase).toBe('front');
      await page.waitForTimeout(60);
    }
    if (batch.length === 6) await screenshot(page, 'v5-six-cooking-burners');
    for (let side = 0; side < 2; side++) {
      const snapshot = await state(page), slots = snapshot.grill!.slots;
      const sequence = batch.map((_, i) => i).sort((a, b) =>
        (slots[a]!.since + 480000 / slots[a]!.heat) - (slots[b]!.since + 480000 / slots[b]!.heat));
      for (const slot of sequence) {
        await expect.poll(() => level(page, slot), { intervals: [40], timeout: 10000 }).toBeGreaterThanOrEqual(60);
        const beforeInput = await level(page, slot);
        expect(beforeInput, `automation missed cooking window: side ${side}, slot ${slot}, heat ${slots[slot]!.heat}`).toBeLessThan(100);
        await page.keyboard.press(keys[slot]!); await page.waitForTimeout(70);
        const afterInput = (await state(page)).grill!;
        inputTrace.push({ side, slot, heat: slots[slot]!.heat, beforeInput, after: afterInput.slots[slot], last: afterInput.log.at(-1) });
      }
    }
  }
  const cooked = (await state(page)).grill!;
  await info.attach('real-input-timing', { body: JSON.stringify({ inputTrace,
    longTasks: await page.evaluate(start => (Reflect.get(window, '__bungLongTasks') as { startTime: number; duration: number }[])
      .filter(task => task.startTime >= start), playStarted) }, null, 2), contentType: 'application/json' });
  expect(cooked.failed, JSON.stringify(inputTrace)).toBe(0);
  await expect(page.getByRole('complementary', { name: '완성품 쟁반' })).toHaveAttribute('data-count', '10');
  expect((await state(page)).stock).toHaveLength(10);
  await expect(page.locator('.bung25-stock li button')).toHaveCount(10);
  await expect(page.locator('.bung25-stock')).toBeVisible();
  await screenshot(page, 'v5-ten-breads-1280');
  for (const viewport of [{ width: 960, height: 540 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(150);
    for (const card of (await state(page)).ui!.orders) {
      const box = card.bounds!; expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThan(viewport.width); expect(box.top).toBeGreaterThanOrEqual(0);
    }
    await screenshot(page, `v5-ten-breads-${viewport.width}`);
  }
  const measure = await page.evaluate(async () =>
    (await import('/tests/e2e/bungeoppangPresentationProbe.ts' as string)).measureBungeoppangPresentation(90));
  await info.attach('v5-full-cart-metrics', { body: JSON.stringify(measure, null, 2), contentType: 'application/json' });
  const artifactDir = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-v5');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, 'v5-full-cart-metrics.json'), JSON.stringify(measure, null, 2));
  await page.setViewportSize({ width: 1280, height: 720 });
  // First customer has the guaranteed bean2 order. Other two must retain their identities.
  const ids = await page.locator('.bung25-order').evaluateAll(els => els.map(e => e.getAttribute('data-order-id')));
  const first = (await state(page)).ui!.orders[0]!.select; await page.mouse.click(first.x, first.y);
  const deliver = (await state(page)).ui!.orders[0]!.deliver; await page.mouse.click(deliver.x, deliver.y);
  await expect.poll(async () => (await state(page)).grill!.customersServed).toBe(1);
  await expect(page.locator('.bung25-order')).toHaveCount(3);
  const afterIds = await page.locator('.bung25-order').evaluateAll(els => els.map(e => e.getAttribute('data-order-id')));
  expect(afterIds).toContain(ids[1]); expect(afterIds).toContain(ids[2]); expect(afterIds).not.toContain(ids[0]);
  const third = (await state(page)).ui!.orders[2]!.select; await page.mouse.click(third.x, third.y);
  expect((await state(page)).selectedCustomer).toBe(ids[2]);
  // The two-row tray buttons select the same bread IDs consumed by the visible bin control.
  const selectedBread = (await state(page)).grill!.tray[0]!.id;
  const point = (await state(page)).tray[0]!; await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('status').filter({ hasText: '선택한 빵을' })).toContainText('쓰레기통에 버릴까요');
  const trash = (await state(page)).trash; await page.mouse.click(trash.x, trash.y);
  await expect.poll(async () => (await state(page)).grill!.tray.some((b: { id: number }) => b.id === selectedBread)).toBe(false);
  await page.keyboard.press('Space'); await page.keyboard.press('KeyQ');
  const lever = (await state(page)).ui!.waste; await page.mouse.click(lever.x, lever.y);
  const slot = (await state(page)).ui!.slots[0]!; await page.mouse.click(slot.x, slot.y);
  await expect(page.getByRole('status').filter({ hasText: '선택한 빵을' })).toContainText('쓰레기통에 버릴까요');
  await page.waitForTimeout(310); await page.mouse.click(trash.x, trash.y);
  expect((await state(page)).grill!.slots[0]!.phase).toBe('empty');
  await page.waitForTimeout(310);
  // Batter stays cold; heat and burn timing begin only after filling.
  await page.keyboard.press('Space'); await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await state(page)).burners[0]!.visible).toBe(false);
  await page.waitForTimeout(400);
  await page.keyboard.press('Digit1'); await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await state(page)).burners[0]!.visible).toBe(true);
  await expect.poll(() => level(page, 0), { intervals: [80], timeout: 11000 }).toBeGreaterThanOrEqual(100);
  await page.keyboard.press('KeyQ');
  expect((await state(page)).grill!.log.at(-1)!.action).toBe('DISCARD');
  await screenshot(page, 'v5-trash-after-burn');
  const book = (await state(page)).ui!.help; await page.mouse.click(book.x, book.y);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('소를 넣으면');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
  expect((await state(page)).privatePresent).toBe(false);
});

test('three distinct server heat levels remain visible at night with reduced motion and resources dispose', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  // Presentation fixture only: deterministic issuer values, no completion or wallet request.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, heats: [85, 100, 115, 85, 100, 115] } });
    (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.95);
  });
  await page.keyboard.press('Space');
  for (const key of ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD']) { await page.keyboard.press(key); await page.waitForTimeout(80); }
  await expect.poll(async () => (await state(page)).burners.every((b: { visible: boolean }) => !b.visible)).toBe(true);
  await page.keyboard.press('Digit1');
  for (const key of ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD']) { await page.keyboard.press(key); await page.waitForTimeout(80); }
  const probe = await state(page);
  expect(probe.burners.map((b: { heat: number }) => b.heat)).toEqual([85, 100, 115, 85, 100, 115]);
  expect(probe.burners[0].scale[0]).toBeLessThan(probe.burners[1].scale[0]);
  expect(probe.burners[1].scale[0]).toBeLessThan(probe.burners[2].scale[0]);
  const cells = page.locator('.bung-v5-heat-cell');
  await expect(cells).toHaveCount(6);
  await expect(cells.locator('.bung-v5-heat-value')).toHaveText(['85%', '100%', '115%', '85%', '100%', '115%']);
  await expect(cells.locator('.bung-v5-heat-label')).toHaveText(['약불', '보통불', '센불', '약불', '보통불', '센불']);
  const heat = probe.ui!.heat;
  for (let i = 0; i < heat.length; i++) {
    const a = heat[i]!; expect(a.x).toBeGreaterThanOrEqual(0); expect(a.x).toBeLessThan(1280);
    expect(a.y).toBeGreaterThan(0); expect(a.y).toBeLessThan(720);
    for (const b of heat.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  }
  await expect(page.locator('.bung-v5-accessibility').first()).toHaveCSS('clip-path', 'inset(50%)');
  await screenshot(page, 'v5-night-reduced-motion');
  const tracked = await page.evaluate(async () => (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).watchV5Disposal());
  expect(tracked.tracked).toBeGreaterThan(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
  await expect.poll(async () => (await page.evaluate(async () =>
    (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).disposalProbe())).disposed).toBe(tracked.tracked);
  expect(errors).toEqual([]);
});

test('2.5D readable cooking stages match the fixed reference layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play');
  for (const order of await page.locator('.bung25-order').all()) await expect(order).toHaveAttribute('data-stage', 'summary', { timeout: 22000 });
  // Visual fixture only: no replay submission, settlement, or reward is exercised here.
  const seed = () => page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { gameNow } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    const s = useBungeoppang.getState(), t = gameNow(), levels = [20, 55, 78, 95, 104, 0];
    const phases = ['batter', 'front', 'back', 'back', 'back', 'empty'];
    const fillings = [null, 'bean', 'custard', 'pizza', 'chocolate', null];
    useBungeoppang.setState({ grill: { ...s.grill, combo: 3,
      activeOrders: s.grill!.activeOrders.map((order: object, i: number) => ({ ...order, items: [
        { bean: 2, custard: 0, pizza: 0, chocolate: 0 },
        { bean: 0, custard: 1, pizza: 1, chocolate: 0 },
        { bean: 1, custard: 1, pizza: 1, chocolate: 1 },
      ][i] })),
      tray: ['bean', 'custard', 'pizza'].map((filling, i) => ({ id: 100001 + i, filling, front: 78, back: 78, points: 10 })),
      slots: s.grill!.slots.map((slot: object, i: number) => ({ ...slot, phase: phases[i], filling: fillings[i], heat: 100,
        since: t - levels[i]! * s.rules.sideMs / 100, front: 78 })) } });
    return (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).stage25Probe();
  });
  for (const viewport of [{ width: 960, height: 540 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(300);
    expect(await seed()).toEqual({ stage: true, oldControls: false, sprites: true });
    await page.waitForTimeout(100);
    await expect(page.locator('.bung25-slot').nth(2)).toHaveAttribute('data-quality', 'PERFECT');
    await expect(page.locator('.bung25-slot').nth(4)).toHaveAttribute('data-quality', 'BURNT');
    await expect(page.locator('.bung25-slot').nth(4).locator('.bung25-slot-name')).toContainText('버리기');
    await expect(page.getByRole('progressbar')).toHaveCount(6);
    await expect(page.locator('.bung25-order').nth(0)).toHaveAttribute('data-ready', 'false');
    await expect(page.locator('.bung25-order').nth(0).locator('.bung25-deliver')).toHaveCount(0);
    await expect(page.locator('.bung25-order').nth(0).locator('.bung25-recipe-name')).toHaveText('팥 ×2');
    await expect(page.locator('.bung25-order').nth(1)).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.bung25-order').nth(1).locator('.bung25-deliver')).toBeEnabled();
    await expect(page.locator('.bung25-order').nth(2).locator('li')).toHaveCount(4);
    for (const portrait of await page.locator('.bung25-order').nth(2).locator('.bung25-bread-portrait').all()) {
      await expect(portrait).toBeVisible();
    }
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.bung25-order')].map(e => e.getBoundingClientRect());
      const keys = [...document.querySelectorAll('.bung25-slot-key')].map(e => e.getBoundingClientRect());
      return { cardsInside: cards.every(r => r.left >= 0 && r.right <= innerWidth),
        clearGrill: Math.max(...cards.map(r => r.bottom)) < Math.min(...keys.map(r => r.top)),
        recipesInside: [...document.querySelectorAll('.bung25-order li')].every(el => {
          const r = el.getBoundingClientRect(), card = el.closest('.bung25-order')!.getBoundingClientRect();
          return r.left >= card.left && r.right <= card.right && el.scrollWidth <= el.clientWidth + 1;
        }),
        controlsInside: [...document.querySelectorAll('.bung25-bottom button,.bung-help-button')]
          .every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }) };
    });
    await screenshot(page, `v5-25d-stages-${viewport.width}`);
    expect(layout).toEqual({ cardsInside: true, clearGrill: true, recipesInside: true, controlsInside: true });
  }
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.95));
  await seed(); await page.waitForTimeout(100); await screenshot(page, 'v5-25d-stages-night');
  const thirdOrder = page.locator('.bung25-order').nth(2);
  const recipe = await thirdOrder.locator('.bung25-recipe-name').first().boundingBox();
  await page.mouse.click(recipe!.x + recipe!.width / 2, recipe!.y + recipe!.height / 2);
  await expect(thirdOrder).toHaveAttribute('data-selected', 'true');
  // All cards share the real tray: losing custard removes both complete-item and handover states.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, tray: s.grill!.tray.filter((b: { filling: string }) => b.filling !== 'custard') } });
  });
  await expect(page.locator('.bung25-order').nth(1)).toHaveAttribute('data-ready', 'false');
  await expect(page.locator('.bung25-order').nth(1).locator('.bung25-deliver')).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
});

test('three-minute monotonic preview clock, final thirty-second rush and result without real reward', async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('/minigames/')) requests.push(r.url()); });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  const started = Date.now();
  await expect(page.locator('.bung25-rush')).toContainText('손님이 몰려와요', { timeout: 150000 });
  await expect(page.getByRole('timer')).toHaveAttribute('data-rush', 'true', { timeout: 5000 });
  await page.keyboard.press('Space'); await page.keyboard.press('KeyQ');
  await screenshot(page, 'v5-last-thirty-seconds');
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'result', { timeout: 40000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(179000);
  await expect(page.getByRole('region', { name: '결과', exact: true })).toContainText('실제 엽전 지급 없음');
  expect((await state(page)).result!.coinsGranted).toBe(0);
  await screenshot(page, 'v5-three-minute-result');
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '공원으로', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
  expect((await state(page)).privatePresent).toBe(false);
});
