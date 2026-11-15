export const STONE_ACTION_DURATION = { cloud: .95, eliminated: .78, 'ring-warning': .42, collapse: .24, slide: .24 } as const
export type StoneActionSound = keyof typeof STONE_ACTION_DURATION

/** 짧은 상황별 소리. 같은 파형을 AudioContext별로 캐시해 요청/디코딩 없이 재사용한다. */
export function stoneActionSamples(kind: StoneActionSound, rate: number) {
  const duration = STONE_ACTION_DURATION[kind], data = new Float32Array(Math.ceil(duration * rate))
  let seed = 71, low = 0, phase = 0
  const notes = kind === 'eliminated' ? [587.33, 440, 349.23, 293.66] : [880, 783.99, 659.25, 587.33]
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, progress = t / duration
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 0xffffffff * 2 - 1
    low += (noise - low) * (kind === 'slide' ? .08 : .2)
    let sample = 0
    if (kind === 'cloud' || kind === 'eliminated') {
      const step = duration / 4, index = Math.min(3, Math.floor(t / step)), age = t - index * step, freq = notes[index]!
      const pluck = Math.min(1, age / .004) * Math.exp(-age * 20)
      sample = pluck * (.36 * Math.sin(2 * Math.PI * freq * age) + .1 * Math.sin(2 * Math.PI * freq * 2 * age))
      sample += low * (kind === 'cloud' ? .12 : .04) * Math.sin(Math.PI * progress)
    } else if (kind === 'ring-warning') {
      const age = t % .21, envelope = Math.min(1, age / .003) * Math.exp(-age * 26)
      sample = envelope * (.45 * Math.sin(2 * Math.PI * 880 * age) + .1 * Math.sin(2 * Math.PI * 1320 * age))
    } else if (kind === 'collapse') {
      phase += 2 * Math.PI * (65 + 100 * Math.exp(-t * 35)) / rate
      sample = (.4 * low + .18 * noise + .28 * Math.sin(phase)) * Math.exp(-t * 23)
    } else {
      phase += 2 * Math.PI * (75 + 180 * (1 - progress)) / rate
      sample = (.5 * low + .05 * Math.sin(phase)) * Math.sin(Math.PI * progress) ** 1.4
    }
    data[i] = sample * Math.min(1, t / .002) * Math.min(1, (duration - t) / .025)
  }
  return data
}
const cache = new WeakMap<AudioContext, Map<StoneActionSound, AudioBuffer>>()
export function stoneActionBuffer(context: AudioContext, kind: StoneActionSound) {
  let buffers = cache.get(context)
  if (!buffers) { buffers = new Map(); cache.set(context, buffers) }
  let buffer = buffers.get(kind)
  if (!buffer) {
    const samples = stoneActionSamples(kind, context.sampleRate)
    buffer = context.createBuffer(1, samples.length, context.sampleRate); buffer.getChannelData(0).set(samples)
    buffers.set(kind, buffer)
  }
  return buffer
}
