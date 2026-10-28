import { expect, test, type Page } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';

const dialogue = (page: Page, orderId: string) => page.evaluate(async id => {
  const { useCustomerSpeechV5, customerRequestText } = await import('/src/features/bungeoppang/customerSpeechV5.ts' as string);
  const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
  const lines = useCustomerSpeechV5.getState().dialogues[id]!;
  const order = useBungeoppang.getState().grill!.activeOrders.find((o: { orderId: string }) => o.orderId === id)!;
  return { ...lines, spokenOrder: customerRequestText(order.items, lines.request) };
}, orderId);

test('customer greets on entry, speaks their order then keeps all filling pictures, including replacements', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'countdown');
  // Presentation fixture only. Cooking/replay validation remains in the real-input scenario.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill,
      activeOrders: s.grill!.activeOrders.map((order: object, i: number) => ({ ...order, items: [
        { bean: 2, custard: 0, pizza: 0, chocolate: 0 },
        { bean: 2, custard: 1, pizza: 0, chocolate: 0 },
        { bean: 1, custard: 1, pizza: 1, chocolate: 1 },
      ][i] })),
      tray: ['bean', 'bean', 'custard', 'pizza', 'chocolate'].map((filling, i) =>
        ({ id: 100001 + i, filling, front: 78, back: 78, points: 10 })),
    } });
    (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.42);
  });
  const orders = page.locator('.bung25-order'), first = orders.nth(0);
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 20000 });
  await expect(first).toHaveAttribute('data-stage', 'greeting');
  const initialDialogue = await dialogue(page, '1');
  await expect(first.locator('.bung25-speech')).toHaveText(initialDialogue.greeting);
  await expect(first.locator('ul')).toHaveCount(0);
  await page.waitForTimeout(250);
  await screenshot(page, 'v5-customer-greeting');
  await expect(first).toHaveAttribute('data-stage', 'request');
  await expect(first.locator('.bung25-speech')).toHaveText(initialDialogue.spokenOrder);
  await expect(first.locator('.bung25-speech')).toContainText('팥 붕어빵 2개');
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'request', { timeout: 12000 });
  await expect(orders.nth(1).locator('.bung25-speech')).toHaveText((await dialogue(page, '2')).spokenOrder);
  await expect(orders.nth(1).locator('.bung25-speech')).toContainText('팥 2개, 슈크림 1개');
  expect(await page.evaluate(async () => (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string))
    .customerAnimationProbe().find((c: { orderId: string; arrived: boolean }) => c.orderId === '1')!.arrived)).toBe(true);
  await screenshot(page, 'v5-customer-spoken-order');
  await expect(orders.nth(2)).toHaveAttribute('data-stage', 'request', { timeout: 12000 });
  await expect(orders.nth(2).locator('.bung25-speech')).toHaveText((await dialogue(page, '3')).spokenOrder);
  await page.setViewportSize({ width: 960, height: 540 });
  await expect(orders.nth(2).locator('.bung25-speech')).toBeVisible();
  const bounds = await orders.nth(2).evaluate(element => {
    const text = element.querySelector('.bung25-speech')!.getBoundingClientRect(), cloud = element.getBoundingClientRect();
    return { contained: text.top >= cloud.top && text.bottom <= cloud.bottom && text.left >= cloud.left && text.right <= cloud.right };
  });
  expect(bounds.contained).toBe(true);
  await screenshot(page, 'v5-customer-mixed-dialogue-small');
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const order of await orders.all()) await expect(order).toHaveAttribute('data-stage', 'summary', { timeout: 20000 });
  await expect(page.locator('.bung25-order .bung25-bread-portrait')).toHaveCount(7);
  for (const picture of await orders.nth(2).locator('.bung25-bread-portrait').all()) await expect(picture).toBeVisible();
  await expect(orders.nth(2).locator('.bung25-recipe-name')).toHaveText(['팥 ×1', '슈크림 ×1', '피자 ×1', '초코 ×1']);
  await expect(page.locator('.bung25-stock-bread small')).toHaveText(['팥', '팥', '슈크림', '피자', '초코']);
  const positions = await page.locator('.bung25-stock-bread .bung25-bread-portrait').evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).backgroundPositionX));
  expect(new Set(positions).size).toBe(4);
  await screenshot(page, 'v5-customer-picture-orders');
  // A replacement must start its own dialogue without replaying the other customers.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, activeOrders: s.grill!.activeOrders.map((o: object, i: number) => i ? o :
      { ...o, orderId: '7', items: { bean: 0, custard: 1, pizza: 0, chocolate: 0 } }) } });
  });
  await expect(first).toHaveAttribute('data-order-id', '7');
  await expect(first).toHaveAttribute('data-stage', 'greeting', { timeout: 12000 });
  const replacementDialogue = await dialogue(page, '7');
  expect(replacementDialogue.greeting).not.toBe(initialDialogue.greeting);
  expect(replacementDialogue.request).not.toBe(initialDialogue.request);
  await expect(first.locator('.bung25-speech')).toHaveText(replacementDialogue.greeting);
  await expect(orders.nth(1)).toHaveAttribute('data-stage', 'summary');
  await expect(first).toHaveAttribute('data-stage', 'request');
  await expect(first.locator('.bung25-speech')).toHaveText(replacementDialogue.spokenOrder);
  await expect(first.locator('.bung25-speech')).toContainText('슈크림 붕어빵 1개');
  await first.getByRole('button', { name: '1번 손님 주문 선택', exact: true }).click();
  await expect(first).toHaveAttribute('data-stage', 'summary');
  await page.waitForTimeout(300);
  await expect(first).toHaveAttribute('data-stage', 'summary');
  await expect(first.locator('.bung25-deliver')).toBeEnabled();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect(await page.evaluate(async () => Object.keys((await import('/src/features/bungeoppang/customerSpeechV5.ts' as string))
    .useCustomerSpeechV5.getState().stages))).toEqual([]);
  expect(await page.evaluate(async () => Object.keys((await import('/src/features/bungeoppang/customerSpeechV5.ts' as string))
    .useCustomerSpeechV5.getState().dialogues))).toEqual([]);
  expect(errors).toEqual([]);
});
