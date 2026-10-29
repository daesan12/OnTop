import { expect, test } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';

test('approved delivery keeps the same customer for a character-specific thanks before leaving', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.evaluate(async () => {
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string);
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    const issuer = createV5PreviewService(() => .5);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    (window as unknown as { releaseTestDelivery: () => void }).releaseTestDelivery = release;
    Object.assign(bungeoppangService, issuer, { deliverV5: async (request: unknown) => {
      const reply = await issuer.deliverV5!(request as never); await gate; return reply;
    } });
  });
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 15000 });
  await expect(page.locator('.bung25-order').nth(2)).toHaveAttribute('data-stage', 'summary', { timeout: 30000 });
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/bungeoppangView.ts' as string)).gameNow()), { timeout: 20000 }).toBeGreaterThanOrEqual(15500);
  const identity = await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { replay } = await import('/src/features/bungeoppang/rulesV5.ts' as string);
    const { useCustomerSpeechV5 } = await import('/src/features/bungeoppang/customerSpeechV5.ts' as string);
    const { customerAnimationProbe } = await import('/tests/bungeoppang-v5-e2e/probe.ts' as string);
    const s = useBungeoppang.getState(), entries: { slot: number; action: string; t: number; filling?: string }[] = [];
    for (let slot = 0; slot < 4; slot++) entries.push({ slot, action: 'POUR', t: slot * 600 },
      { slot, action: 'FILL', filling: slot === 3 ? 'chocolate' : 'custard', t: slot * 600 + 300 },
      { slot, action: 'TURN', t: slot * 600 + 6700 }, { slot, action: 'TURN', t: slot * 600 + 13100 });
    entries.sort((a, b) => a.t - b.t);
    useBungeoppang.setState({ grill: replay(entries, s.grill.heats, s.grill.activeOrders, s.rules), selectedCustomer: '1' });
    return { actor: customerAnimationProbe().find((actor: { orderId: string }) => actor.orderId === '2'),
      thanks: useCustomerSpeechV5.getState().dialogues['2'].thanks };
  });
  await page.keyboard.press('r');
  const cloud = page.locator('.bung25-thanks[data-order-id="2"]');
  await expect(cloud).toHaveAttribute('data-stage', 'pending');
  await expect.poll(() => page.evaluate(async () => {
    const { customerAnimationProbe } = await import('/tests/bungeoppang-v5-e2e/probe.ts' as string);
    return customerAnimationProbe().find((actor: { orderId: string }) => actor.orderId === '2');
  })).toMatchObject({ uuid: identity.actor.uuid, visible: true, motion: 'idle', departurePhase: 'pending' });
  await page.evaluate(() => (window as unknown as { releaseTestDelivery: () => void }).releaseTestDelivery());
  await expect(cloud).toHaveAttribute('data-stage', 'thanks');
  await expect(cloud).toHaveText(identity.thanks);
  const proof = await page.evaluate(async () => {
    const { customerAnimationProbe } = await import('/tests/bungeoppang-v5-e2e/probe.ts' as string);
    const { useCustomerArrivalsV5 } = await import('/src/features/bungeoppang/customerArrivalV5.ts' as string);
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState(), next = s.grill.activeOrders.find((o: { customerSlot: number }) => o.customerSlot === 1);
    return { actor: customerAnimationProbe().find((actor: { orderId: string }) => actor.orderId === '2'),
      served: s.grill.customersServed, stock: s.grill.tray.map((b: { filling: string }) => b.filling),
      replacementAdmitted: next && useCustomerArrivalsV5.getState().admitted[next.orderId] !== undefined };
  });
  expect(proof).toMatchObject({ actor: { uuid: identity.actor.uuid, visible: true, departurePhase: 'thanks' },
    served: 1, stock: ['chocolate'], replacementAdmitted: false });
  await screenshot(page, 'v5-customer-thanks');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/customerDepartureV5.ts' as string)).useCustomerDeparturesV5.getState().visits['2']),
    { timeout: 8000 }).toBeUndefined();
  await expect(cloud).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect(await page.evaluate(async () =>
    (await import('/src/features/bungeoppang/customerDepartureV5.ts' as string)).useCustomerDeparturesV5.getState().visits)).toEqual({});
  expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
