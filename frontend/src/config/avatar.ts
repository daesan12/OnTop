/** Provisional art tuning. Joint dimensions remain in the original model space. */
export const AVATAR = {
  scale: 0.85,
  hipHeight: 0.6,
  legOffset: 0.21,
} as const

export type CharacterId = 'man' | 'girl'
/** Only the two supplied, free base appearances are accepted at entry. */
export function parseCharacterId(value: unknown): CharacterId {
  return value === 'girl' ? 'girl' : 'man'
}
export const CHARACTER = {
  height: 1.7,
  hipHeight: (0.28 * 1.7) / 0.98,
  seatedHipHeight: 0.56,
  nearDistance: 10,
  farDistance: 14,
} as const
