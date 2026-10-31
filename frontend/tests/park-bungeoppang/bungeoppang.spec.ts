import { test, expect } from '@playwright/test';
import { parkFixture } from '../park-integration/fixture';
import { screenshot } from '../e2e/contractFixture';

test('existing bungeoppang game opens at the new cart, cooks and returns to the same park', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const server = await parkFixture(page);
  await page.goto('/park');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  const stand = await page.evaluate(async () => {
    // Test-only issuer: the production game/store/input/rendering modules stay intact.
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string);
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    Object.assign(bungeoppangService, createV5PreviewService(() => .5));
    const { bungeoppangView } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    return { x: bungeoppangView.standX, y: .8, z: bungeoppangView.standZ, yaw: Math.PI };
  });
  server.place(stand);
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible();
  await page.locator('canvas').focus();
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible();
  const guide = page.getByRole('region', { name: '붕어빵 단축키 안내' });
  await expect(guide.locator('kbd')).toHaveText(['Q', 'W', 'E', 'A', 'S', 'D', '1', '2', '3', '4', 'Space', 'R']);
  await expect(guide).toContainText('주문에 맞는 완성품 전달');
  await screenshot(page, 'feedback-bungeoppang-guide');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  const phase = () => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().phase);
  await expect.poll(phase, { timeout: 20000 }).toBe('play');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-bungeoppang/probe.ts' as string)).cookingStageReady())).toBe(true);
  await page.locator('canvas').focus();
  const points = await page.evaluate(async () =>
    (await import('/tests/park-bungeoppang/probe.ts' as string)).plateClickPoints());
  // Click both edges of every plate: the lower row must never steal upper-row clicks.
  for (const pair of points) { await page.mouse.click(pair[0].x, pair[0].y); await page.waitForTimeout(65); }
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(320); // Respect the existing interval between cooking actions.
  for (const pair of points) { await page.mouse.click(pair[1].x, pair[1].y); await page.waitForTimeout(65); }
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().grill?.log.map((e: { action: string; slot: number }) => `${e.action}:${e.slot}`)))
    .toEqual(['POUR:0', 'POUR:1', 'POUR:2', 'POUR:3', 'POUR:4', 'POUR:5', 'FILL:0', 'FILL:1', 'FILL:2', 'FILL:3', 'FILL:4', 'FILL:5']);
  await screenshot(page, 'feedback-bungeoppang-six-plates');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: '그만두기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect.poll(phase).toBe('idle');
  const exitFrames = await page.evaluate(async () => {
    const { exitCartVisibility } = await import('/tests/park-bungeoppang/probe.ts' as string);
    const frames = [];
    for (let i = 0; i < 20; i++) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); frames.push(exitCartVisibility()); }
    return frames;
  });
  expect(exitFrames.some(frame => frame.cartVisible)).toBe(false);
  await screenshot(page, 'feedback-new-park-return');
  expect(await page.evaluate(async () =>
    (await import('/src/world/inputOwnership.ts' as string)).inputState.minigameOpen)).toBe(false);
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady())).toBe(true);
  expect(errors).toEqual([]);
});
