/** Higgsfield 생성 원본에서 편집한 돌탑 전용 핵심 소리. 다운로드/디코딩은 context당 한 번이다. */
export const STONE_PALETTE = { step: .2, crack: .34, fire: .3, hit: .24 } as const
export type StonePaletteKind = keyof typeof STONE_PALETTE
const cache = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer | null>>>()
export function loadStonePalette(context: AudioContext, kind: StonePaletteKind) {
  let entries = cache.get(context)
  if (!entries) { entries = new Map(); cache.set(context, entries) }
  let buffer = entries.get(kind)
  if (!buffer) {
    buffer = fetch(`${import.meta.env.BASE_URL}audio/stone-rumble/${kind}.ogg`)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(data => context.decodeAudioData(data)).catch(() => null)
    entries.set(kind, buffer)
  }
  return buffer
}
