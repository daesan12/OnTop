/** GAME/SHOP are the public display extension requested in docs/AVATAR_ACTIVITY_BE_REQUEST.md.
 * Existing servers can keep sending BUNGEOPPANG/null until the BE extension is deployed. */
export const AVATAR_ACTIVITY_LABELS = {
  BUNGEOPPANG: '붕어빵 뒤집는 중',
  GAME: '게임 중',
  SHOP: '상점 이용중',
} as const

export type AvatarActivity = keyof typeof AVATAR_ACTIVITY_LABELS
export const isAvatarActivity = (value: unknown): value is AvatarActivity =>
  typeof value === 'string' && Object.hasOwn(AVATAR_ACTIVITY_LABELS, value)
