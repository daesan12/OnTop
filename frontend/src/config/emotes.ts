/** Authored clip duration; cooldown/blend timings are configurable presentation tuning. */
export const CLAP_EMOTE = {
  durationMs: (146 / 30) * 1000,
  cooldownMs: 5000,
  blendMs: 150,
  cancelBlendMs: 180,
} as const

/** Server-approved, avatar-only gestures. They never animate table objects. */
export const SOCIAL_GESTURES = {
  EMOTE_WAVE: { durationMs: 2600, cooldownMs: 5000 },
  EMOTE_TABLE_FLIP: { durationMs: 2800, cooldownMs: 5000 },
} as const
export type SocialGesture = keyof typeof SOCIAL_GESTURES
export function characterGestureDuration(id: string): number {
  if (id === 'EMOTE_CLAP') return CLAP_EMOTE.durationMs
  return SOCIAL_GESTURES[id as SocialGesture]?.durationMs ?? 0
}
