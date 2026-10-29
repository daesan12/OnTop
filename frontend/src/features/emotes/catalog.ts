import { CLAP_EMOTE, NETWORK, SOCIAL_GESTURES } from '../../park/mapConfig'

export const emotes = [
  { id: 'EMOTE_APPLAUSE_REQUEST', label: '박수 부탁', icon: 'clap', color: '#efd58d', durationMs: NETWORK.emoteDurationMs, cooldownMs: 1800 },
  { id: 'EMOTE_CLAP', label: '박수', icon: 'clap', color: '#a6dfc5', durationMs: CLAP_EMOTE.durationMs, cooldownMs: CLAP_EMOTE.cooldownMs },
  { id: 'EMOTE_TSK', label: '에잉 쯧쯧', icon: 'tsk', color: '#e9b6a4', durationMs: NETWORK.emoteDurationMs, cooldownMs: 1800 },
  { id: 'EMOTE_FART', label: '방귀 뿡', icon: 'fart', color: '#c0d9a3', durationMs: NETWORK.emoteDurationMs, cooldownMs: 1800 },
  { id: 'EMOTE_WAVE', label: '손 인사', icon: 'wave', color: '#a9d8ef', durationMs: SOCIAL_GESTURES.EMOTE_WAVE.durationMs, cooldownMs: SOCIAL_GESTURES.EMOTE_WAVE.cooldownMs },
] as const
export type Emote = (typeof emotes)[number]
export type EmoteId = Emote['id']
export const emoteSlots = [emotes[0], emotes[1], emotes[2], null, emotes[3], emotes[4], null, null] as const
export const findEmote = (id: unknown) => emotes.find(emote => emote.id === id)
export type EmoteBindings = Partial<Record<EmoteId, string>>

/** Local deployment config, never a proposed server catalog endpoint/DTO. */
export function parseEmoteBindings(value: unknown): EmoteBindings {
  if (value === undefined) return {}
  if (!Array.isArray(value) || value.length > emotes.length) throw new Error('감정표현 연결 설정을 확인해주세요.')
  const bindings: EmoteBindings = {}, codes = new Set<string>()
  for (const item of value) {
    const emote = findEmote(item?.motion)
    if (!emote || typeof item.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(item.code)
      || bindings[emote.id] || codes.has(item.code)) throw new Error('감정표현 연결 설정을 확인해주세요.')
    bindings[emote.id] = item.code
    codes.add(item.code)
  }
  return bindings
}

/** Explicit local/visual-test mapping. Production defaults to no mappings. */
export const previewEmoteBindings: EmoteBindings = { EMOTE_CLAP: 'CLAP', EMOTE_WAVE: 'WAVE' }
export function emoteSector(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy)
  if (distance < 78 || distance > 220) return -1
  return Math.floor(((Math.atan2(dx, -dy) + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2)) / (Math.PI / 4))
}
