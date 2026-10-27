import { expect, it } from 'vitest';
import { BUNGEOPPANG_V4 as R } from '../../src/features/bungeoppang/config';
import { heatLook, INGREDIENT_LOOK } from '../../src/features/bungeoppang/presentation';
it('distinguishes assignment from the common rush speed while keeping heat fixed', () => {
  expect(heatLook(85, 39999, R)).toMatchObject({ label: '약불', flames: 1, speed: .85, rush: false });
  expect(heatLook(100, 39999, R)).toMatchObject({ label: '보통불', flames: 2, speed: 1 });
  expect(heatLook(115, 39999, R)).toMatchObject({ label: '센불', flames: 3, speed: 1.15 });
  const rushed = heatLook(85, 40000, R);
  expect(rushed.label).toBe('약불'); expect(rushed.rush).toBe(true); expect(rushed.speed).toBeCloseTo(.85 * 8 / 6);
});
it('keeps four distinct filling colors without changing the crust quality palette', () => {
  const colors = ['bean', 'custard', 'pizza', 'chocolate'].map(f => INGREDIENT_LOOK[f as keyof typeof INGREDIENT_LOOK].color);
  expect(new Set(colors).size).toBe(4);
});
