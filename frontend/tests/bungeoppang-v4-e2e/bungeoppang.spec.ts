import { expect, test, type Page } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';

const state = (page: Page) => page.evaluate(async () => {
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
  const s = useBungeoppang.getState();
  return { phase: s.phase, tool: s.tool, grill: s.grill, result: s.result };
});

test('v4 order and tray at PC viewports, input ownership, real 60-second result and replay', async ({ page }) => {
  const errors: string[] = [], warnings: string[] = [], minigameRequests: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') warnings.push(m.text()); });
  page.on('request', r => { if (r.url().includes('/minigames/')) minigameRequests.push(r.url()); });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park');
  await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 });
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE');
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toContainText('랜덤 불');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  const started = Date.now();
  const customer = page.getByRole('region', { name: '손님 주문' }), tray = page.getByRole('region', { name: '완성품 쟁반' });
  await expect(customer).toContainText('팥 2개'); await expect(tray.locator('li')).toHaveCount(4);
  await expect(page.locator('.bung-slot-key')).toHaveCount(6);
  expect((await state(page)).grill).not.toHaveProperty('orders');
  for (const [code, tool] of [['Digit2', 'custard'], ['Numpad3', 'pizza'], ['Digit4', 'chocolate'], ['Numpad1', 'bean']] as const) {
    await page.keyboard.press(code); expect((await state(page)).tool).toBe(tool);
  }
  await page.mouse.move(640, 500); await page.mouse.wheel(0, 100);
  expect((await state(page)).tool).toBe('custard');
  await page.waitForTimeout(180); await page.mouse.wheel(0, -100);
  expect((await state(page)).tool).toBe('bean');
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'qa-input'; document.body.append(input); input.focus();
    window.dispatchEvent(new CompositionEvent('compositionstart'));
  });
  await page.keyboard.press('Digit4'); await page.mouse.wheel(0, 100);
  expect((await state(page)).tool).toBe('bean');
  await page.evaluate(() => { window.dispatchEvent(new CompositionEvent('compositionend')); document.getElementById('qa-input')!.remove(); });
  await page.locator('canvas').focus();
  await page.keyboard.press('Space');
  const beforeWrong = (await state(page)).grill!.log.length;
  await page.keyboard.press('Digit4'); await page.keyboard.press('KeyQ');
  expect((await state(page)).grill!.log).toHaveLength(beforeWrong);
  await page.keyboard.press('Space'); await page.keyboard.press('KeyQ'); await page.waitForTimeout(80); await page.keyboard.press('KeyW');
  await page.waitForTimeout(320); await page.keyboard.press('Digit1'); await page.keyboard.press('KeyQ');
  await page.waitForTimeout(80); await page.keyboard.press('KeyW');
  const filled = await state(page);
  expect(filled.grill!.fills).toBe(2);
  for (const slot of filled.grill!.slots.slice(0, 2)) expect(slot.heat).toBeGreaterThanOrEqual(85);
  await page.keyboard.press('F1'); await expect(page.getByRole('dialog')).toBeVisible();
  const log = (await state(page)).grill!.log.length;
  await page.keyboard.press('KeyE'); await page.keyboard.press('Digit4');
  expect((await state(page)).grill!.log).toHaveLength(log); expect((await state(page)).tool).toBe('bean');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
  for (let side = 0; side < 2; side++) {
    const slots = (await state(page)).grill!.slots;
    const sequence = [0, 1].sort((a, b) => slots[b].heat - slots[a].heat);
    for (const slot of sequence) {
      const key = ['KeyQ', 'KeyW'][slot]!;
      await expect.poll(async () => page.evaluate(async i => {
        const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
        const { gameNow } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
        const { cookLevel } = await import('/src/features/bungeoppang/rulesV4.ts' as string);
        const s = useBungeoppang.getState(), bread = s.grill!.slots[i];
        return cookLevel(bread.since, gameNow(), bread.heat, s.rules);
      }, slot), { intervals: [50], timeout: 10000 }).toBeGreaterThanOrEqual(72);
      await page.keyboard.press(key); await page.waitForTimeout(80);
    }
  }
  await expect(tray).toHaveAttribute('data-count', '2');
  expect((await state(page)).grill!.score).toBe(0);
  await screenshot(page, 'bungeoppang-v4-1280-tray');
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyR');
  await expect(customer).toHaveAttribute('data-customer', '2');
  await expect(tray).toHaveAttribute('data-count', '0');
  expect((await state(page)).grill!.customersServed).toBe(1);
  expect((await state(page)).grill!.score).toBeGreaterThan(0);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const box = await customer.boundingBox(), trayBox = await tray.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(trayBox!.x + trayBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(trayBox!.y + trayBox!.height).toBeLessThan(viewport.height - 60);
    await screenshot(page, `bungeoppang-v4-${viewport.width}-delivery`);
  }
  await expect(page.locator('.bung-banner')).toContainText('손님이 몰려와요', { timeout: 30000 });
  await expect(page.getByRole('timer')).toHaveAttribute('data-rush', 'true', { timeout: 6000 });
  await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'result', { timeout: 70000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(59000);
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(page.getByRole('region', { name: '결과', exact: true })).toContainText('승인된 납품 점수');
  await screenshot(page, 'bungeoppang-v4-result');
  expect((await state(page)).result!.coinsGranted).toBe(0);
  expect(minigameRequests).toEqual([]); expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(warnings.filter(m => !m.includes('THREE.Clock') && !m.includes('GL Driver') && !m.includes('WebGL'))).toEqual([]);
  await page.getByRole('button', { name: '다시 하기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown');
  expect((await state(page)).grill!.log).toHaveLength(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
});

test('four fillings render on unobstructed clickable slots and other avatars remain visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 });
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  const points = await page.evaluate(async () => (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).slotScreen.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })));
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space'); await page.mouse.click(points[i].x, points[i].y);
    await page.waitForTimeout(320); await page.keyboard.press(`Digit${i + 1}`);
    await page.mouse.click(points[i].x, points[i].y); await page.waitForTimeout(80);
  }
  expect((await state(page)).grill!.fills).toBe(4);
  for (const name of ['팥', '슈크림', '피자', '초코']) await expect(page.locator('.bung-slot-filling').filter({ hasText: name })).toHaveCount(1);
  const visual = await page.evaluate(async () => (await import('/tests/e2e/m14Probe.ts' as string)).m14VisibilityProbe());
  expect(visual.slots).toEqual(Array.from({ length: 6 }, () => ({ onScreen: true, blockers: [] })));
  const actors = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).sceneProbe());
  expect(actors.ownVisible).toBe(false); expect(actors.remoteVisible).toBe(true);
  await screenshot(page, 'bungeoppang-v4-four-fillings');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
  const restored = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).sceneProbe());
  expect(restored.ownVisible).toBe(true);
});
