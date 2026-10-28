import { expect, it } from 'vitest';
import { CUSTOMER_ASSETS_V5, customerAssetV5 } from '../../src/features/bungeoppang/customerAssetsV5';

it('retains a customer appearance when its reusable slot changes and cycles all six looks', () => {
  expect(['1', '2', '3', '4', '5', '6'].map(id => customerAssetV5(id))).toEqual(CUSTOMER_ASSETS_V5);
  expect(customerAssetV5('7')).toBe(customerAssetV5('1'));
  expect(customerAssetV5('9007199254740993')).toBe(CUSTOMER_ASSETS_V5[2]);
  expect(customerAssetV5('9007199254740992')).toBe(CUSTOMER_ASSETS_V5[1]);
});
