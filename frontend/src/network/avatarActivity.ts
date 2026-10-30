/** GAME/BUNGEOPPANG are approved public activities. SHOP remains a future-contract
 * display extension until server shop entry/exit broadcasting is implemented. */
export const AVATAR_ACTIVITY_LABELS = {
  BUNGEOPPANG: '붕어빵 뒤집는 중',
  GAME: '게임 중',
  SHOP: '상점 이용중',
} as const

export type AvatarActivity = keyof typeof AVATAR_ACTIVITY_LABELS
export const isAvatarActivity = (value: unknown): value is AvatarActivity =>
  typeof value === 'string' && Object.hasOwn(AVATAR_ACTIVITY_LABELS, value)
