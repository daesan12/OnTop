import type { JumpPad } from '../../layout-preview/jumpCourse'
import type { JumpHit } from '../../layout-preview/jumpSimulation'

/** User-approved, unpitched landing clips. Gate feedback keeps its existing synthesis. */
export const JUMP_LANDING_FILES = {
  stone: 'stone.wav',
  'gomoku-black': 'gomoku-black.wav',
  'gomoku-white': 'gomoku-white.wav',
  fish: 'bread.wav',
  cloud: 'cloud.wav',
  lantern: 'lantern.wav',
  kite: 'kite.wav',
  lily: 'lotus.wav',
} as const
export type JumpLandingSound = keyof typeof JUMP_LANDING_FILES
type Output = { context: AudioContext; bus: AudioNode }
type SoundOptions = { output: Output; remote?: boolean; level?: number; pan?: number; signal?: AbortSignal }

const MAX_VOICES = 6, MAX_START_DELAY_MS = 150, LANDING_LEVEL = .45
const buffers = new WeakMap<AudioContext, Map<JumpLandingSound, Promise<AudioBuffer | null>>>()
let voices = 0, lastGateVariant = -1

export function landingSoundForPad(pad: Pick<JumpPad, 'theme' | 'ordinal'>): JumpLandingSound | null {
  if (pad.theme === 'gate') return null
  // ServiceJumpCourse uses this same parity for its black/white material colours.
  if (pad.theme === 'gomoku') return pad.ordinal % 2 ? 'gomoku-black' : 'gomoku-white'
  return pad.theme
}

function loadLanding(context: AudioContext, name: JumpLandingSound) {
  let cache = buffers.get(context)
  if (!cache) { cache = new Map(); buffers.set(context, cache) }
  let buffer = cache.get(name)
  if (!buffer) {
    buffer = fetch(`${import.meta.env.BASE_URL}audio/jumpmap/${JUMP_LANDING_FILES[name]}`)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(data => context.decodeAudioData(data))
      // Missing/blocked audio must not affect movement or retry on every landing.
      .catch(() => null)
    cache.set(name, buffer)
  }
  return buffer
}

/** Warm the eight small clips after the existing audio gesture unlocks its context. */
export async function preloadJumpSounds(context: AudioContext) {
  await Promise.all((Object.keys(JUMP_LANDING_FILES) as JumpLandingSound[]).map(name => loadLanding(context, name)))
}

function playGateSound({ context: ctx, bus }: Output, level: number, position: number, remote?: boolean) {
  const variant = (lastGateVariant + 1 + Math.floor(Math.random() * 4)) % 5
  lastGateVariant = variant
  voices++; setTimeout(() => voices--, 650)
  for (let layer = 0; layer < 3; layer++) {
    if (remote && layer !== 1) continue
    const at = ctx.currentTime + [0, .015, .09][layer]!, duration = layer === 2 ? .3 : .13
    const gain = ctx.createGain(), pan = ctx.createStereoPanner(), osc = ctx.createOscillator()
    const base = 990 * (.95 + variant * .025)
    pan.pan.value = position; gain.connect(pan); pan.connect(bus)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime([.045, .085, .027][layer]! * level, at + .004)
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(base * (layer === 2 ? 1.5 : 1), at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, base * .5), at + duration)
    osc.connect(gain); osc.start(at); osc.stop(at + duration + .02)
    osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect() }
  }
}

export function playJumpSound(hit: JumpHit, options: SoundOptions) {
  const { context: ctx, bus } = options.output, level = options.level ?? 1
  if (hit.kind !== 'land' || document.hidden || ctx.state !== 'running' || options.signal?.aborted
    || voices >= MAX_VOICES || !Number.isFinite(level) || level <= 0) return
  const position = Number.isFinite(options.pan) ? Math.max(-1, Math.min(1, options.pan!)) : 0
  if (hit.pad.theme === 'gate') { playGateSound(options.output, level, position, options.remote); return }
  const name = landingSoundForPad(hit.pad)
  if (!name) return
  const requestedAt = performance.now()
  voices++
  void loadLanding(ctx, name).then(buffer => {
    if (!buffer || document.hidden || ctx.state !== 'running' || options.signal?.aborted
      || performance.now() - requestedAt > MAX_START_DELAY_MS) { voices--; return }
    let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, pan: StereoPannerNode | undefined
    const clean = () => { voices--; source?.disconnect(); gain?.disconnect(); pan?.disconnect() }
    try {
      source = ctx.createBufferSource(); gain = ctx.createGain(); pan = ctx.createStereoPanner()
      source.buffer = buffer
      // Keep the approved pitch, duration and attack; only apply level and spatial pan.
      gain.gain.value = LANDING_LEVEL * level; pan.pan.value = position
      source.connect(gain); gain.connect(pan); pan.connect(bus)
      source.onended = clean
      source.start(ctx.currentTime)
    } catch { clean() }
  })
}
