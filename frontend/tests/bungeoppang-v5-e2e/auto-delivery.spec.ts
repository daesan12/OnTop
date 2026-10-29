import { expect, test } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';

test('R automatically delivers a ready unselected order and leaves surplus bread', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park');
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  // Inject only the preview issuer's random source; global UUID generation must stay random.
  await page.evaluate(async () => {
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string);
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    Object.assign(bungeoppangService, createV5PreviewService(() => .5));
  });
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 15000 });
  await expect(page.locator('.bung25-order').nth(2)).toHaveAttribute('data-stage', 'summary', { timeout: 30000 });
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).gameNow()), { timeout: 20000 })
    .toBeGreaterThanOrEqual(15500);
  // Prepare stock with valid cooking history. The actual R key and preview issuer replay the delivery.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { replay } = await import('/src/features/bungeoppang/rulesV5.ts' as string);
    const s = useBungeoppang.getState(), entries: object[] = [];
    for (let slot = 0; slot < 4; slot++) {
      entries.push({ slot, action: 'POUR', t: slot * 600 },
        { slot, action: 'FILL', filling: slot === 3 ? 'chocolate' : 'custard', t: slot * 600 + 300 },
        { slot, action: 'TURN', t: slot * 600 + 6700 },
        { slot, action: 'TURN', t: slot * 600 + 13100 });
    }
    entries.sort((a: any, b: any) => a.t - b.t);
    useBungeoppang.setState({ grill: replay(entries, s.grill.heats, s.grill.activeOrders, s.rules), selectedCustomer: '1' });
  });
  await expect(page.getByRole('button', { name: '1번 손님 주문 선택' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.bung25-stock')).toHaveAttribute('data-count', '4');
  await expect(page.locator('.bung25-order').nth(1)).toContainText('전달하기');
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(async () => {
    const s = (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState();
    return { pending: s.orderPending, error: s.orderError, served: s.grill.customersServed,
      tray: s.grill.tray.map((bread: any) => bread.filling),
      deliveries: s.grill.log.filter((entry: any) => entry.action === 'DELIVER').map((entry: any) => entry.orderId) };
  })).toEqual({ pending: false, error: null, served: 1, tray: ['chocolate'], deliveries: ['2'] });
  await expect(page.locator('.bung25-stock')).toHaveAttribute('data-count', '1');
  await page.keyboard.press('r');
  expect(await page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().grill.customersServed)).toBe(1);
  await screenshot(page, 'v5-r-auto-delivery');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect(errors).toEqual([]);
});
