import { expect, test, type Page } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';

async function jump(page: Page, t: number) {
  return page.evaluate(async value => {
    const { bungeoppangClock } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    const { advanceBungeoppangTime } = await import('/src/features/bungeoppang/store.ts' as string);
    const { useCustomerArrivalsV5 } = await import('/src/features/bungeoppang/customerArrivalV5.ts' as string);
    bungeoppangClock.playAt = performance.now() - value;
    advanceBungeoppangTime();
    return { ...useCustomerArrivalsV5.getState().admitted };
  }, t);
}

test('one guest starts, replacements wait, and the last thirty seconds keep filling vacancies', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown');
  await expect(page.locator('.bung25-order-cloud')).toHaveCount(0);
  await expect(page.locator('.bung25-orders')).not.toContainText('손님이 오고');
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play');
  const orders = page.locator('.bung25-order');
  await expect(orders.nth(0)).toHaveAttribute('data-stage', 'summary', { timeout: 10000 });
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'waiting');
  await expect(orders.nth(2)).toHaveAttribute('data-stage', 'waiting');
  await expect(page.locator('.bung25-order-cloud')).toHaveCount(1);
  await expect(orders.nth(1)).toBeHidden();
  expect(await page.evaluate(async () => (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string))
    .customerAnimationProbe().filter((actor: { visible: boolean }) => actor.visible).length)).toBe(1);
  await screenshot(page, 'v5-arrival-first-only');
  // A hidden, already-approved order cannot be selected or handed over using R.
  await page.evaluate(async () => {
    const { useBungeoppang, selectBungeoppangCustomer, deliverBungeoppangOrder } = await import('/src/features/bungeoppang/store.ts' as string);
    if (selectBungeoppangCustomer('2')) throw new Error('queued guest was selected');
    useBungeoppang.setState({ selectedCustomer: '2' }); deliverBungeoppangOrder();
    if (useBungeoppang.getState().grill.log.length) throw new Error('queued guest was served');
  });
  await jump(page, 7000);
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'greeting');
  await expect(orders.nth(2)).toHaveAttribute('data-stage', 'waiting');
  await jump(page, 14000);
  await expect(orders.nth(2)).toHaveAttribute('data-stage', 'greeting');
  // This visual fixture represents an approved replacement; real delivery replay is tested separately.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, activeOrders: s.grill.activeOrders.map((order: object, i: number) => i ? order : { ...order, orderId: '4' }) } });
  });
  await page.waitForTimeout(300);
  await expect(orders.nth(0)).toHaveAttribute('data-stage', 'waiting');
  await expect(orders.nth(0)).toBeHidden();
  await jump(page, 16500);
  await expect(orders.nth(0)).toHaveAttribute('data-stage', 'waiting');
  await jump(page, 26000);
  await expect(orders.nth(0)).toHaveAttribute('data-stage', 'greeting');
  await jump(page, 145000);
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, activeOrders: s.grill.activeOrders.map((order: object, i: number) => i ? { ...order, orderId: String(i + 4) } : order) } });
  });
  await page.waitForTimeout(300);
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'waiting');
  const rushFirst = await jump(page, 150000);
  expect(rushFirst['5']).toBeDefined(); expect(rushFirst['6']).toBeUndefined();
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'greeting');
  const rushNext = await jump(page, 150900);
  expect(rushNext['6']).toBeDefined();
  await expect(orders.nth(2)).toHaveAttribute('data-stage', 'greeting');
  await expect(page.getByRole('timer')).toHaveAttribute('data-rush', 'true');
  await screenshot(page, 'v5-arrival-rush');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/src/features/bungeoppang/customerArrivalV5.ts' as string))
    .useCustomerArrivalsV5.getState().admitted)).toEqual({});
  expect(errors).toEqual([]);
});
