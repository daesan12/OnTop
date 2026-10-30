/** Shared, immutable art metadata. Source models remain alongside the optimized runtime files. */
export const CUSTOMER_ASSETS_V5 = [
  // Smaller child bodies retain a clear face above the counter's order clouds.
  { id: 'boy-red-scarf', name: '활발한 아이', height: 1.4, lift: .30 },
  { id: 'student-brown-coat', name: '대학생', height: 1.65, lift: 0 },
  { id: 'worker-earmuffs', name: '귀마개 직장인', height: 1.65, lift: 0 },
  { id: 'older-flat-cap', name: '중년 손님', height: 1.62, lift: .02 },
  { id: 'girl-pink-hat', name: '분홍 모자 아이', height: 1.4, lift: .26 },
  { id: 'woman-glasses-bun', name: '안경 쓴 여성', height: 1.64, lift: .03 },
] as const;
export type CustomerAssetV5 = typeof CUSTOMER_ASSETS_V5[number];

/** Server IDs can exceed Number.MAX_SAFE_INTEGER; appearance follows the order, never its reusable slot. */
export function customerAssetV5(orderId: string): CustomerAssetV5 {
  let remainder = 0;
  for (const digit of orderId) remainder = (remainder * 10 + digit.charCodeAt(0) - 48) % CUSTOMER_ASSETS_V5.length;
  return CUSTOMER_ASSETS_V5[(remainder + CUSTOMER_ASSETS_V5.length - 1) % CUSTOMER_ASSETS_V5.length]!;
}
export const customerModelUrlV5 = (id: CustomerAssetV5['id']) => `/art/bungeoppang/customers/runtime/${id}.glb`;
