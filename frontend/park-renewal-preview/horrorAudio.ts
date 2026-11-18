// Underground sound (S15P31B105-450): synthesised Web Audio layered with a few small recorded clips (screams, roars,
// moans, impacts; see the clips section). Each encounter gets its own
// stinger (whispers, stone scraping, rope and door creaks, a growl, a shriek, a splash, bone cracks, wet squelches),
// timed to the beats its animation already uses, and the hall itself hums: a low drone, dripping water, distant
// groans and the odd metal creak. Everything goes through the park's effects bus, so the SFX volume and mute apply.

import { STAGE } from './encounterStaging'

type Ctx = BaseAudioContext
interface Out { ctx: Ctx; dry: AudioNode; wet: AudioNode }

const kits = new WeakMap<Ctx, { noise: AudioBuffer; reverb: ConvolverNode; master: DynamicsCompressorNode; muffle: BiquadFilterNode; bus: AudioNode }>()
/** Shared noise, reverb and a gentle limiter per audio context and bus. */
function kit(ctx: Ctx, bus: AudioNode) {
  let k = kits.get(ctx)
  if (!k || k.bus !== bus) {
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    // A stone hall: 2.6 s of decaying noise, darker towards the tail.
    const length = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0
      for (let i = 0; i < length; i++) { const t = i / length; lp += (Math.random() * 2 - 1 - lp) * (.5 - t * .42); d[i] = lp * Math.pow(1 - t, 2.4) }
    }
    const reverb = ctx.createConvolver(); reverb.buffer = ir
    const master = ctx.createDynamicsCompressor()
    master.threshold.value = -16; master.knee.value = 10; master.ratio.value = 6; master.attack.value = .004; master.release.value = .25
    const wetGain = ctx.createGain(); wetGain.gain.value = .55
    // Wide open normally; closed down for a moment after a scare, as if your ears were ringing (aftermath).
    const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = .5
    reverb.connect(wetGain).connect(master); master.connect(muffle).connect(bus)
    k = { noise, reverb, master, muffle, bus }
    kits.set(ctx, k)
  }
  return k
}
function output(ctx: Ctx, bus: AudioNode): Out { const k = kit(ctx, bus); return { ctx, dry: k.master, wet: k.reverb } }

type Shape = { gain: number; attack?: number; hold?: number; release: number }
function envelope(ctx: Ctx, at: number, s: Shape) {
  const g = ctx.createGain(), a = s.attack ?? .005, h = s.hold ?? 0
  g.gain.setValueAtTime(.0001, at)
  g.gain.exponentialRampToValueAtTime(s.gain, at + a)
  g.gain.setValueAtTime(s.gain, at + a + h)
  g.gain.exponentialRampToValueAtTime(.0001, at + a + h + s.release)
  return { g, end: at + a + h + s.release + .02 }
}
function route(o: Out, node: AudioNode, pan = 0, wet = .4): AudioNode[] {
  const p = o.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan))
  const dry = o.ctx.createGain(); dry.gain.value = 1 - wet * .5
  const send = o.ctx.createGain(); send.gain.value = wet
  node.connect(p); p.connect(dry).connect(o.dry); p.connect(send).connect(o.wet)
  return [p, dry, send]
}
/** Disconnect a finished voice so long sessions do not pile up audio nodes. */
function release(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
  source.onended = () => { source.disconnect(); for (const n of nodes) n.disconnect() }
}
/** Filtered noise: breath, scrape, splash, whoosh. `to` sweeps the filter. */
function noise(o: Out, at: number, s: Shape & { type: BiquadFilterType; freq: number; to?: number; q?: number; pan?: number; wet?: number; wobble?: number }) {
  const src = o.ctx.createBufferSource(); src.buffer = kits.get(o.ctx)!.noise; src.loop = true
  const f = o.ctx.createBiquadFilter(); f.type = s.type; f.Q.value = s.q ?? 1
  const { g, end } = envelope(o.ctx, at, s)
  f.frequency.setValueAtTime(s.freq, at)
  if (s.to) f.frequency.exponentialRampToValueAtTime(s.to, end)
  if (s.wobble) for (let t = at; t < end; t += .045) g.gain.setValueAtTime(Math.max(.0001, s.gain * (1 - s.wobble * Math.random())), t)
  src.connect(f).connect(g); release(src, [f, g, ...route(o, g, s.pan, s.wet)])
  src.start(at, Math.random()); src.stop(end)
}
/** An oscillator voice: creak, growl, shriek, drone, drip. */
function tone(o: Out, at: number, s: Shape & { wave: OscillatorType; freq: number; to?: number; detune?: number; filter?: number; q?: number; pan?: number; wet?: number; vibrato?: number }) {
  const osc = o.ctx.createOscillator(); osc.type = s.wave; osc.detune.value = s.detune ?? 0
  const { g, end } = envelope(o.ctx, at, s)
  osc.frequency.setValueAtTime(s.freq, at)
  if (s.to) osc.frequency.exponentialRampToValueAtTime(s.to, end)
  if (s.vibrato) for (let t = at, k = 0; t < end; t += .03, k++) osc.frequency.setValueAtTime((s.to && t > at ? s.freq + (s.to - s.freq) * (t - at) / (end - at) : s.freq) * (1 + s.vibrato * Math.sin(k * 1.7) * Math.random()), t)
  let last: AudioNode = osc
  const used: AudioNode[] = [g]
  if (s.filter) { const f = o.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.filter; f.Q.value = s.q ?? .8; osc.connect(f); last = f; used.push(f) }
  last.connect(g); release(osc, [...used, ...route(o, g, s.pan, s.wet)])
  osc.start(at); osc.stop(end)
}

// ---------- recorded clips ----------
// Real screams, roars, moans, breath and impacts (CC0, OpenGameArt; sources in sounds/README.md), about 170 KB of
// mono Opus fetched only once you are underground. Until they arrive — or if a browser cannot decode them — the
// synthesised voices play alone, so nothing waits on the network.
const CLIP_URLS = {
  'hit-low': new URL('./sounds/hit-low.ogg', import.meta.url).href,
  'hit-deep': new URL('./sounds/hit-deep.ogg', import.meta.url).href,
  'hit-mid': new URL('./sounds/hit-mid.ogg', import.meta.url).href,
  'scream-a': new URL('./sounds/scream-a.ogg', import.meta.url).href,
  'scream-b': new URL('./sounds/scream-b.ogg', import.meta.url).href,
  'roar-low': new URL('./sounds/roar-low.ogg', import.meta.url).href,
  'growl-low': new URL('./sounds/growl-low.ogg', import.meta.url).href,
  'roar-a': new URL('./sounds/roar-a.ogg', import.meta.url).href,
  'snarl-a': new URL('./sounds/snarl-a.ogg', import.meta.url).href,
  'moan-a': new URL('./sounds/moan-a.ogg', import.meta.url).href,
  'moan-b': new URL('./sounds/moan-b.ogg', import.meta.url).href,
  'moan-c': new URL('./sounds/moan-c.ogg', import.meta.url).href,
  breath: new URL('./sounds/breath.ogg', import.meta.url).href,
  dread: new URL('./sounds/dread.ogg', import.meta.url).href,
} as const
export type HorrorClip = keyof typeof CLIP_URLS
export const HORROR_CLIPS = Object.keys(CLIP_URLS) as HorrorClip[]
const clipSets = new WeakMap<Ctx, { buffers: Map<HorrorClip, AudioBuffer>; ready: Promise<void> }>()

/** Start fetching the clips for this context (once); resolves when every clip has loaded or failed. */
export function loadHorrorClips(ctx: Ctx, fetcher: (url: string) => Promise<ArrayBuffer> = url => fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))) {
  let set = clipSets.get(ctx)
  if (!set) {
    const buffers = new Map<HorrorClip, AudioBuffer>()
    const ready = Promise.all(HORROR_CLIPS.map(name => fetcher(CLIP_URLS[name])
      .then(data => ctx.decodeAudioData(data))
      .then(buffer => { buffers.set(name, buffer) })
      .catch(() => {}))).then(() => {})
    set = { buffers, ready }
    clipSets.set(ctx, set)
  }
  return set.ready
}
type ClipShape = { gain: number; pan?: number; wet?: number; rate?: number; offset?: number; fadeIn?: number; until?: number; fadeOut?: number }
/** Play a recorded clip at `at`; false (and silent) while it has not loaded. `until` cuts it off with a fade. */
function clip(o: Out, name: HorrorClip, at: number, s: ClipShape) {
  const buffer = clipSets.get(o.ctx)?.buffers.get(name)
  if (!buffer) return false
  const src = o.ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = s.rate ?? 1
  const g = o.ctx.createGain()
  if (s.fadeIn) { g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(s.gain, at + s.fadeIn) } else g.gain.value = s.gain
  const offset = s.offset ?? 0
  let end = at + (buffer.duration - offset) / (s.rate ?? 1)
  if (s.until !== undefined && s.until < end) {
    const fade = s.fadeOut ?? .15
    g.gain.setValueAtTime(s.gain, Math.max(at, s.until - fade)); g.gain.linearRampToValueAtTime(0, s.until)
    end = s.until
  }
  src.connect(g); release(src, [g, ...route(o, g, s.pan, s.wet)])
  src.start(at, offset); src.stop(end + .02)
  return true
}
const any = <T,>(...items: T[]) => items[Math.floor(Math.random() * items.length)]
/** Each creature's own voice while it is revealed: which clip, how slow, how loud, how far off. */
const VOICES: Record<number, { clip: HorrorClip; rate: number; gain: number; pan?: number; wet?: number; at?: number }> = {
  1: { clip: 'moan-c', rate: .9, gain: .5, pan: -.4, wet: .5 },
  2: { clip: 'growl-low', rate: .75, gain: .7, at: .2 },
  3: { clip: 'moan-a', rate: .85, gain: .55, wet: .55 },
  4: { clip: 'roar-a', rate: .85, gain: .8, at: .12 },
  5: { clip: 'moan-c', rate: .7, gain: .5, pan: .4 },
  6: { clip: 'moan-b', rate: .8, gain: .5, wet: .7 },
  7: { clip: 'snarl-a', rate: .9, gain: .75, at: .3 },
  8: { clip: 'growl-low', rate: .9, gain: .6, at: .45 },
  9: { clip: 'moan-b', rate: .7, gain: .65, wet: .55 },
  10: { clip: 'moan-a', rate: 1.1, gain: .5 },
  11: { clip: 'moan-c', rate: .8, gain: .55, wet: .7, at: .25 },
  12: { clip: 'breath', rate: .7, gain: .7, wet: .3 },
}

// ---------- building blocks ----------
const whisper = (o: Out, at: number, len: number, pan = 0, gain = .09) => {
  for (const [freq, q] of [[2400, 4], [3500, 6], [1300, 3]] as const)
    noise(o, at, { type: 'bandpass', freq, to: freq * (.85 + Math.random() * .3), q, gain: gain * (freq === 2400 ? 1 : .6), attack: .12, hold: len * .6, release: len * .4, wobble: .85, pan, wet: .6 })
}
const thud = (o: Out, at: number, gain = .5, freq = 70) => { tone(o, at, { wave: 'sine', freq, to: freq * .55, gain, attack: .003, release: .35, wet: .5 }); noise(o, at, { type: 'lowpass', freq: 500, to: 120, gain: gain * .5, release: .18, wet: .4 }) }
const scrape = (o: Out, at: number, len: number, pan = 0, gain = .3) => noise(o, at, { type: 'bandpass', freq: 520, to: 260, q: 1.4, gain, attack: .03, hold: len * .5, release: len * .5, wobble: .7, pan, wet: .35 })
const creak = (o: Out, at: number, len: number, freq = 160, pan = 0, gain = .1) => tone(o, at, { wave: 'sawtooth', freq, to: freq * (.7 + Math.random() * .6), filter: 1100, q: 9, gain, attack: .04, hold: len * .6, release: len * .4, vibrato: .08, pan, wet: .45 })
const crackle = (o: Out, at: number, count: number, span: number, gain = .35) => { for (let i = 0; i < count; i++) noise(o, at + Math.random() * span, { type: 'highpass', freq: 2200 + Math.random() * 3000, gain: gain * (.4 + Math.random() * .6), attack: .001, release: .03 + Math.random() * .04, pan: Math.random() - .5, wet: .5 }) }
const whoosh = (o: Out, at: number, len: number, from = -.8, to = .8, gain = .22) => {
  const n = 6; for (let i = 0; i < n; i++) noise(o, at + len * i / n, { type: 'bandpass', freq: 300 + 900 * Math.sin(Math.PI * (i + .5) / n), q: .9, gain: gain * Math.sin(Math.PI * (i + .5) / n), attack: len / n * .5, release: len / n * .9, pan: from + (to - from) * i / (n - 1), wet: .5 })
}
const drone = (o: Out, at: number, len: number, freq = 42, gain = .16) => { for (const d of [-9, 0, 7]) tone(o, at, { wave: 'sawtooth', freq, detune: d, filter: 180, gain: gain / 2, attack: len * .55, hold: len * .15, release: len * .3, wet: .6 }) }
const shriek = (o: Out, at: number, len: number, gain = .07) => { for (const [f, d] of [[620, 0], [631, 18], [930, -12]] as const) tone(o, at, { wave: 'sawtooth', freq: f, to: f * 1.45, detune: d, filter: 2600, q: 4, gain, attack: .04, hold: len * .4, release: len * .6, vibrato: .03, wet: .55 }) }
const heartbeat = (o: Out, at: number, beats: number, gap = .7) => { for (let i = 0; i < beats; i++) { thud(o, at + i * gap, .32, 55); thud(o, at + i * gap + .2, .22, 50) } }
const splash = (o: Out, at: number, gain = .35) => { noise(o, at, { type: 'lowpass', freq: 4200, to: 500, gain, attack: .004, release: .6, wet: .5 }); for (let i = 0; i < 9; i++) tone(o, at + .1 + Math.random() * .7, { wave: 'sine', freq: 300 + Math.random() * 500, to: 700 + Math.random() * 600, gain: .05, attack: .002, release: .06, pan: Math.random() - .5, wet: .5 }) }
const clank = (o: Out, at: number, gain = .14) => { for (const f of [221, 347, 512, 789, 1130]) tone(o, at, { wave: 'sine', freq: f * (1 + Math.random() * .01), gain: gain * (221 / f) ** .4, attack: .001, release: .6 + Math.random() * .5, wet: .5 }); noise(o, at, { type: 'highpass', freq: 1800, gain: gain, release: .05 }) }
const growl = (o: Out, at: number, len: number, gain = .14) => { for (const f of [62, 66.5, 124]) tone(o, at, { wave: 'sawtooth', freq: f, to: f * .85, filter: 420, gain: gain / (f > 100 ? 2 : 1), attack: .08, hold: len * .5, release: len * .5, vibrato: .12, wet: .35 }); noise(o, at, { type: 'bandpass', freq: 900, q: 1.5, gain: gain * .7, attack: .1, hold: len * .4, release: len * .5, wobble: .9, wet: .35 }) }
const squelch = (o: Out, at: number, gain = .18) => { noise(o, at, { type: 'bandpass', freq: 900, to: 300, q: 5, gain, attack: .01, release: .18, wet: .4 }); tone(o, at, { wave: 'sine', freq: 240, to: 90, gain: gain * .6, attack: .005, release: .15, wet: .3 }) }

/** The stinger for encounter `id`, `duration` ms long, starting now. `beats` are the animation's beat fractions. */
export function playEncounterSound(ctx: Ctx, bus: AudioNode, id: number, duration: number, beats: readonly number[], delay = 0) {
  const o = output(ctx, bus), now = ctx.currentTime + .01 + delay, d = duration / 1000, at = (fraction: number) => now + fraction * d
  switch (id) {
    case 1: noise(o, now, { type: 'highpass', freq: 900, to: 3800, gain: .18, attack: .25, release: .2, wet: .5 }); whisper(o, at(.12), d * .7, -.6, .14); drone(o, now, d, 49, .14); break
    case 2: beats.forEach((b, i) => { scrape(o, at(b), .32, 0, .32 + i * .06); thud(o, at(b) + .2, .38 + i * .08, 62) }); drone(o, now, d, 38, .12); break
    case 3: creak(o, now, .5, 150, 0, .12); whoosh(o, now, .5, 0, 0, .3); thud(o, at(.42), .45, 75); creak(o, at(.45), .9, 120, .2, .1); whisper(o, at(.5), d * .5, .3, .06); break
    case 4: creak(o, now, .35, 210, -.4, .14); thud(o, at(.08), .55, 85); noise(o, at(.08), { type: 'lowpass', freq: 1200, to: 300, gain: .35, release: .3, wet: .5 }); growl(o, at(.15), d * .8); shriek(o, at(.3), .45, .04); break
    case 5: crackle(o, now, 14, .45); scrape(o, at(.15), .8, .3, .22); whisper(o, at(.35), d * .5, .5, .05); break
    case 6: noise(o, now, { type: 'lowpass', freq: 400, to: 3000, gain: .26, attack: d * .55, release: .15, wet: .7 }); whisper(o, at(.2), d * .6, -.2, .08); drone(o, now, d, 33, .14); break
    case 7: beats.forEach(b => { noise(o, at(b), { type: 'lowpass', freq: 1500, gain: .38, attack: .002, release: .09, pan: .4, wet: .35 }); tone(o, at(b), { wave: 'sine', freq: 170, to: 90, gain: .12, attack: .002, release: .08, wet: .3 }) }); whoosh(o, at(.33), .7, .9, -.9, .34); break
    case 8: clank(o, now, .16); for (let i = 0; i < 18; i++) noise(o, now + .05 + Math.random() * .6, { type: 'highpass', freq: 3000, gain: .06, attack: .001, release: .03, pan: Math.random() - .5, wet: .5 }); tone(o, now, { wave: 'sawtooth', freq: 48, to: 66, filter: 220, gain: .1, attack: d * .7, release: d * .3, wet: .5 }); clank(o, at(.5), .1); break
    case 9: drone(o, now, d * 1.2, 36, .2); heartbeat(o, now + .1, 2, .55); shriek(o, at(.5), .7, .07); whisper(o, at(.3), d * .6, 0, .06); break
    case 10: crackle(o, at(.05), 3, .12, .45); thud(o, at(.08), .2, 140); whisper(o, at(.18), d * .7, -.4, .09); tone(o, at(.3), { wave: 'triangle', freq: 180, to: 120, filter: 900, gain: .05, attack: .3, hold: .3, release: .5, vibrato: .05, wet: .6 }); break
    case 11: splash(o, now, .55); noise(o, at(.25), { type: 'lowpass', freq: 600, to: 200, gain: .14, attack: .2, hold: .3, release: .5, wobble: .8, wet: .5 }); whisper(o, at(.4), d * .5, .2, .1); break
    case 12: beats.forEach((b, i) => squelch(o, at(b), .22 + i * .02)); drone(o, now, d, 45, .12); whisper(o, at(.3), d * .6, .5, .05); break
  }
}

/** Lamps stutter with an electric buzz, the heart starts to pound and a drone rises: something is coming. */
function buildUp(o: Out, at: number, len: number) {
  for (let t = 0; t < len; t += .07 + Math.random() * .06)
    tone(o, at + t, { wave: 'square', freq: 118 + Math.random() * 6, filter: 1400, q: 2, gain: .035 * Math.random(), attack: .003, release: .05, wet: .2 })
  crackle(o, at, 6, len, .18)
  heartbeat(o, at + .05, Math.max(1, Math.round(len / .5)), .5)
  drone(o, at, len + .5, 34, .16)
  tone(o, at, { wave: 'sine', freq: 3100, gain: .012, attack: len * .8, release: .3, wet: .1 }) // ringing in the ears
}
/** The rush: a scream right in your face over a roar, a heavy hit as the lights die, then the dark swallows it. */
function lungeHit(o: Out, at: number, len: number) {
  // The scream and roar are cut by the blackout; the boom swells through the rush (its peak lands on the blackout)
  // and its tail dies away in the dark.
  const dark = at + len
  const real = clip(o, any('scream-a', 'scream-b'), at, { gain: .85, rate: .82 + Math.random() * .12, wet: .25, until: dark + .08, fadeOut: .08 })
  clip(o, 'roar-low', at, { gain: .6, rate: .8, wet: .3, until: dark + .08, fadeOut: .08 })
  clip(o, any('hit-low', 'hit-deep', 'hit-mid'), Math.max(o.ctx.currentTime, at - .1), { gain: 1, wet: .2, until: dark + 1.6, fadeOut: 1.4 })
  shriek(o, at, len + .25, real ? .05 : .13)
  noise(o, at, { type: 'bandpass', freq: 1800, to: 700, q: .8, gain: real ? .25 : .5, attack: .02, hold: len * .6, release: .3, wobble: .5, wet: .3 })
  thud(o, at + len, .7, 58)
  noise(o, at + len, { type: 'lowpass', freq: 3000, to: 200, gain: .45, attack: .002, release: .5, wet: .6 })
}

/**
 * The scare in sound, on the fractions encounterStaging uses: build-up, then the creature's own sound timed to its
 * animation beats during the reveal. The rush has its own call (playEncounterLunge).
 */
export function playEncounterStaging(ctx: Ctx, bus: AudioNode, id: number, duration: number, beats: readonly number[]) {
  const o = output(ctx, bus), now = ctx.currentTime + .01, d = duration / 1000
  const reveal = STAGE.reveal * d, lunge = STAGE.lunge * d
  buildUp(o, now, reveal)
  // A dissonant swell under the build-up and the reveal, cut as the creature rushes.
  clip(o, 'dread', now, { gain: .3, fadeIn: reveal * .8, until: now + lunge + .1, fadeOut: .25, wet: .35 })
  const voice = VOICES[id]
  if (voice) clip(o, voice.clip, now + reveal + (voice.at ?? 0) * (lunge - reveal), { gain: voice.gain, rate: voice.rate, pan: voice.pan, wet: voice.wet ?? .4, until: now + lunge + .15 })
  playEncounterSound(ctx, bus, id, (lunge - reveal) * 1000, beats, reveal)
}
/** The rush, played when it actually starts (on time, or early when you walk up to it). */
export function playEncounterLunge(ctx: Ctx, bus: AudioNode, duration: number) {
  lungeHit(output(ctx, bus), ctx.currentTime + .01, (STAGE.blackout - STAGE.lunge) * duration / 1000)
}

// ---------- strikes ----------
// The moment it gets you. A roar every time wore off fast, so the strike sound changes each time:
//   scream  — a recorded scream right in your ear over a roar and a boom
//   screech — a cluster of screeching strings, the horror-film stab, over a sub drop
//   static  — the sound tears: a wall of stuttering radio static and a distorted drone
//   boom    — no voice at all: one enormous impact, metal ringing in the dark
// and every strike is followed by the aftermath: everything muffled as if your ears had gone, a thin ringing tone and
// your own heartbeat, fading back over a few seconds.
export type StrikeFlavor = 'scream' | 'screech' | 'static' | 'boom'
export const STRIKE_FLAVORS: readonly StrikeFlavor[] = ['scream', 'screech', 'static', 'boom']
let lastFlavor: StrikeFlavor | undefined
/** A strike flavor that is not the one just used. */
export function nextFlavor(random: () => number = Math.random): StrikeFlavor {
  const options = STRIKE_FLAVORS.filter(f => f !== lastFlavor)
  lastFlavor = options[Math.floor(random() * options.length)]!
  return lastFlavor
}
const screech = (o: Out, at: number, len: number, gain = .09) => {
  for (const [f, d] of [[1480, 0], [1568, 12], [1661, -9], [1760, 7], [2093, -15], [988, 5]] as const)
    tone(o, at, { wave: 'sawtooth', freq: f, to: f * 1.06, detune: d, filter: 5200, q: 1.2, gain, attack: .008, hold: len * .35, release: len * .65, vibrato: .045, wet: .45 })
  noise(o, at, { type: 'bandpass', freq: 3200, q: 2, gain: gain * 2.5, attack: .005, hold: len * .3, release: len * .6, wobble: .6, wet: .4 })
}
const staticBurst = (o: Out, at: number, len: number) => {
  for (let t = 0; t < len; t += .035 + Math.random() * .03)
    noise(o, at + t, { type: 'bandpass', freq: 900 + Math.random() * 3200, q: .4, gain: .35 + Math.random() * .35, attack: .002, release: .03 + Math.random() * .03, pan: Math.random() * 1.2 - .6, wet: .15 })
  tone(o, at, { wave: 'square', freq: 55, to: 41, filter: 700, gain: .22, attack: .005, hold: len * .7, release: .3, vibrato: .2, wet: .2 })
  tone(o, at, { wave: 'sawtooth', freq: 3950, gain: .03, attack: .002, hold: len * .8, release: .1, wet: .1 })
}
/** The strike sound. */
export function playStrike(ctx: Ctx, bus: AudioNode, flavor: StrikeFlavor) {
  const o = output(ctx, bus), now = ctx.currentTime + .005
  switch (flavor) {
    case 'scream': playJumpScare(ctx, bus); return
    case 'screech':
      screech(o, now, 1.1)
      thud(o, now, .9, 46)
      clip(o, 'hit-deep', now, { gain: .7, offset: .35, until: now + 2, fadeOut: 1.5, wet: .3 })
      return
    case 'static':
      staticBurst(o, now, .75)
      if (!clip(o, 'scream-b', now + .05, { gain: .55, rate: .62, wet: .1, until: now + .8, fadeOut: .1 })) shriek(o, now, .6, .08)
      return
    case 'boom':
      noise(o, now, { type: 'lowpass', freq: 5000, to: 120, gain: .9, attack: .002, release: .9, wet: .5 })
      thud(o, now, 1, 40); thud(o, now + .015, .7, 70)
      clank(o, now + .01, .2)
      clip(o, 'hit-low', now, { gain: 1, offset: .3, until: now + 2.6, fadeOut: 2, wet: .45 })
      return
  }
}
/** After the strike: muffled hearing, a ringing tone and a pounding heart, over `len` seconds. */
export function playAftermath(ctx: Ctx, bus: AudioNode, len = 3) {
  const k = kit(ctx, bus), o = output(ctx, bus), now = ctx.currentTime + .01
  k.muffle.frequency.cancelScheduledValues(now)
  k.muffle.frequency.setValueAtTime(240, now)
  k.muffle.frequency.setValueAtTime(240, now + len * .35)
  k.muffle.frequency.exponentialRampToValueAtTime(20000, now + len)
  // The ring and the heartbeat are inside your head: they bypass the muffle.
  const ring = ctx.createOscillator(), g = ctx.createGain()
  ring.frequency.value = 3650 + Math.random() * 300
  g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.022, now + .08); g.gain.exponentialRampToValueAtTime(.0001, now + len)
  ring.connect(g).connect(bus); ring.start(now); ring.stop(now + len + .05)
  ring.onended = () => { ring.disconnect(); g.disconnect() }
  heartbeat({ ...o, dry: bus, wet: bus }, now + .25, Math.round(len / .55), .55)
}

// ---------- the other scare styles (encounterStaging.StageStyle) ----------
/** No warning: a scream at full force right in your face, a crack and a boom that rings on in the dark. */
export function playJumpScare(ctx: Ctx, bus: AudioNode, voice: 'scream' | 'roar' = 'scream') {
  const o = output(ctx, bus), now = ctx.currentTime + .005
  // A beast roars instead of screaming: two roars stacked, one an octave down.
  const real = voice === 'roar'
    ? clip(o, 'roar-a', now, { gain: 1, rate: .9, wet: .2 }) && clip(o, 'roar-low', now, { gain: .9, rate: .6, wet: .2 })
    : clip(o, any('scream-a', 'scream-b'), now, { gain: 1, rate: .85 + Math.random() * .2, wet: .2 })
  clip(o, voice === 'roar' ? 'snarl-a' : any('roar-a', 'roar-low', 'snarl-a'), now, { gain: .7, rate: .75 + Math.random() * .15, wet: .25 })
  clip(o, any('hit-low', 'hit-deep', 'hit-mid'), now, { gain: .9, wet: .25, offset: .35, until: now + 2.2, fadeOut: 1.6 })
  noise(o, now, { type: 'highpass', freq: 300, gain: .7, attack: .002, release: .45, wet: .3 })
  thud(o, now, .9, 52)
  if (!real && voice === 'roar') growl(o, now, .8, .3)
  else if (!real) shriek(o, now, .7, .16)
}
/** The beast in its crouch: a low wet snarl, close, getting louder until it leaps. */
export function playPounceCrouch(ctx: Ctx, bus: AudioNode, len: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  if (!clip(o, 'snarl-a', now, { gain: .55, rate: .62, wet: .15 })) growl(o, now, len, .14)
  clip(o, 'growl-low', now + len * .45, { gain: .7, rate: .7, wet: .15 })
  growl(o, now, len + .1, .07)
}
/** The runner coming flat out: bare feet slapping faster and louder, a scream rising as it closes. */
export function playSprint(ctx: Ctx, bus: AudioNode, start: number, len: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  for (let t = 0, i = 0; t < len; i++) {
    const near = Math.min(1, (t + .1) / len)
    noise(o, now + start + t, { type: 'lowpass', freq: 600 + near * 2400, gain: .12 + near * .45, attack: .002, release: .07, pan: (i % 2 ? .15 : -.15), wet: .5 - near * .35 })
    tone(o, now + start + t, { wave: 'sine', freq: 110, to: 60, gain: .06 + near * .25, attack: .002, release: .08, wet: .3 })
    t += .2 - near * .08
  }
  if (!clip(o, any('scream-a', 'scream-b'), now + start + len - .55, { gain: .9, rate: .9, wet: .2, fadeIn: .25 })) shriek(o, now + start + len - .5, .6, .14)
  clip(o, any('hit-low', 'hit-deep'), now + start + len - .1, { gain: .9, offset: .35, until: now + start + len + 1.8, fadeOut: 1.4, wet: .25 })
  thud(o, now + start + len, .9, 52)
}
/** The statue has moved: stone grinding on stone, and the floor takes its weight. */
export function playStoneStep(ctx: Ctx, bus: AudioNode, near: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .005
  scrape(o, now, .35 + near * .2, 0, .3 + near * .3)
  noise(o, now, { type: 'lowpass', freq: 260, to: 90, gain: .25 + near * .3, attack: .01, release: .4, wet: .4 })
  thud(o, now + .3, .35 + near * .4, 48)
}
/** The false alarm: stutter, drone and heartbeat as usual… then silence, cut dead, and the lamps clunk back on. */
export function playFakeout(ctx: Ctx, bus: AudioNode, calm: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  buildUp(o, now, calm)
  clip(o, 'dread', now, { gain: .35, fadeIn: calm * .7, until: now + calm, fadeOut: .04, wet: .3 })
  tone(o, now + calm, { wave: 'square', freq: 120, gain: .04, attack: .002, release: .12, filter: 1200, wet: .2 })
  noise(o, now + calm, { type: 'bandpass', freq: 900, q: 2, gain: .1, attack: .002, release: .06, wet: .3 })
}
/** The stalker far down the hall: a low moan, far off, when you first see it. */
export function playStalkStart(ctx: Ctx, bus: AudioNode) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  if (!clip(o, any('moan-a', 'moan-b'), now + .2, { gain: .35, rate: .7, wet: .85, until: now + 3, fadeOut: 1 })) growl(o, now + .2, 1.6, .06)
}
/** A blink of the lamps, and it is closer: the light cuts out with a clunk and a heavy step lands. */
export function playStalkStep(ctx: Ctx, bus: AudioNode, step: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .005, near = Math.min(1, step / 4)
  noise(o, now, { type: 'bandpass', freq: 1400, q: 3, gain: .14, attack: .002, release: .06, wet: .3 })
  thud(o, now + .1, .35 + near * .45, 60 - near * 12)
  clip(o, 'hit-low', now + .05, { gain: .25 + near * .45, offset: .3, until: now + .9 + near * .6, fadeOut: .6, wet: .3 })
  if (step >= 3) clip(o, 'breath', now + .25, { gain: .5, rate: .75, wet: .15 })
}
/** Breathing at your back, closer and louder, for `len` seconds; `pan` is where it stands, as you hear it. */
export function playBehind(ctx: Ctx, bus: AudioNode, len: number, pan: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .2
  let n = 0
  for (let t = 0; t < len - .3; t += 1.15, n++) {
    const close = Math.min(1, (t + .5) / len)
    if (!clip(o, 'breath', now + t, { gain: .25 + close * .45, rate: .7 + Math.random() * .1, pan: pan * (1 - close * .5), wet: .12 - close * .08 }))
      noise(o, now + t, { type: 'bandpass', freq: 900, q: 1.2, gain: .05 + close * .1, attack: .3, release: .5, pan, wet: .1 })
  }
  whisper(o, now + .4, Math.min(2, len * .5), pan, .06)
  if (n > 2) clip(o, 'growl-low', now + len - 1.2, { gain: .3, rate: .7, pan, wet: .1 })
}

/** The hanged one falls: rope whipping down out of the dark, snapping taut, then creaking as it swings. */
export function playRopeDrop(ctx: Ctx, bus: AudioNode) {
  const o = output(ctx, bus), now = ctx.currentTime + .005
  whoosh(o, now, .22, 0, 0, .45)
  noise(o, now + .2, { type: 'bandpass', freq: 700, q: 2, gain: .5, attack: .002, release: .12, wet: .3 })
  thud(o, now + .2, .5, 90)
  for (let i = 0; i < 4; i++) creak(o, now + .45 + i * .32, .3, 140 + Math.random() * 40, Math.sin(i) * .4, .09 - i * .015)
}
/** A cage dropping out of the dark on its chains: links rattling down, then (the strike is the crash) bars. */
export function playCageDrop(ctx: Ctx, bus: AudioNode, rattle: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .005
  for (let t = 0; t < .2; t += .02) clank(o, now + t, .03 + t * .2)
  whoosh(o, now, .22, 0, 0, .3)
  playCageRattle(ctx, bus, rattle, .25)
}
/** Something throwing itself against the bars: metal hammering, a scream muffled under a sack. */
export function playCageRattle(ctx: Ctx, bus: AudioNode, len: number, delay = 0) {
  const o = output(ctx, bus), now = ctx.currentTime + .005 + delay
  for (let t = 0; t < len; t += .07 + Math.random() * .06) {
    clank(o, now + t, .05 + Math.random() * .06)
    thud(o, now + t, .15, 110 + Math.random() * 40)
  }
  if (!clip(o, 'scream-b', now + .1, { gain: .45, rate: .58, wet: .15, until: now + len, fadeOut: .2 })) shriek(o, now + .1, len, .05)
  growl(o, now, len, .08)
}
/** A wall beside you cracks open: stone splitting, grit falling, then the arm tearing through. */
export function playWallCrack(ctx: Ctx, bus: AudioNode) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  crackle(o, now, 10, .25, .4)
  noise(o, now, { type: 'lowpass', freq: 900, to: 200, gain: .3, attack: .005, release: .4, wet: .4 })
  thud(o, now + .25, .6, 62)
  scrape(o, now + .25, .5, 0, .35)
  if (!clip(o, 'snarl-a', now + .3, { gain: .5, rate: 1.15, wet: .2 })) growl(o, now + .3, .5, .1)
  crackle(o, now + .3, 8, .4, .3)
}

/** The ramp's eyes (RampEyes): wet lids parting around you, a murmur among them, all of them slapping shut. */
export function playEyes(ctx: Ctx, bus: AudioNode, kind: 'open' | 'shut' | 'murmur', count = 1) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  if (kind === 'open') {
    for (let i = 0; i < count; i++) {
      const at = now + Math.random() * .3, pan = Math.random() < .5 ? -.7 : .7
      noise(o, at, { type: 'bandpass', freq: 1400 + Math.random() * 900, to: 600, q: 6, gain: .07, attack: .01, release: .12, pan, wet: .5 })
      tone(o, at, { wave: 'sine', freq: 320, to: 140, gain: .03, attack: .005, release: .1, pan, wet: .4 })
    }
  } else if (kind === 'murmur') {
    whisper(o, now, 2.2, -.8, .05); whisper(o, now + .3, 2, .8, .05)
  } else {
    // Every lid at once: a wet slap down both walls, a thud, then nothing.
    for (let i = 0; i < 14; i++) squelch(o, now + Math.random() * .06, .12 + Math.random() * .08)
    thud(o, now + .03, .6, 50)
  }
}

/** The hall's presence between scares (HorrorPresence): you are not alone down here. */
export type PresenceSound = 'footsteps' | 'whisper' | 'bang' | 'lampOut' | 'lampsBack' | 'vanish' | 'redOn' | 'redOff'
export function playPresence(ctx: Ctx, bus: AudioNode, kind: PresenceSound, pan = 0) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  switch (kind) {
    case 'footsteps': {
      // Bare feet coming up behind you, closer each step, then nothing.
      const n = 5 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const near = (i + 1) / n, at = now + i * (.48 - near * .12)
        noise(o, at, { type: 'lowpass', freq: 500 + near * 1300, gain: .05 + near * .22, attack: .002, release: .1, pan: pan * (1 - near * .4), wet: .8 - near * .4 })
        tone(o, at, { wave: 'sine', freq: 120, to: 70, gain: .03 + near * .1, attack: .002, release: .08, pan, wet: .6 })
      }
      break
    }
    // A whisper, then a breath right at your ear.
    case 'whisper': whisper(o, now, 1.6, pan, .13); clip(o, 'breath', now + 1.5, { gain: .45, rate: .8, pan: pan * 1.1, wet: .1 }); break
    // Something heavy falls far off, and something answers it.
    case 'bang': clank(o, now, .12); thud(o, now + .02, .35, 50); clip(o, 'hit-mid', now, { gain: .35, rate: .9, wet: .95, pan })
      if (!clip(o, any('moan-a', 'moan-b'), now + 1, { gain: .22, rate: .7, wet: .95, pan: -pan, until: now + 4.5, fadeOut: 1.2 })) growl(o, now + .9, 1.4, .05)
      break
    case 'lampOut': noise(o, now, { type: 'bandpass', freq: 1400, q: 3, gain: .12, attack: .002, release: .08, pan, wet: .5 }); tone(o, now, { wave: 'square', freq: 120, gain: .03, attack: .002, release: .15, filter: 900, pan, wet: .4 }); break
    case 'lampsBack': for (let i = 0; i < 4; i++) tone(o, now + i * .09, { wave: 'square', freq: 118, gain: .025, attack: .002, release: .06, filter: 1200, pan, wet: .3 }); break
    // The light goes red (horrorRules, rule 2): a relay thrown somewhere, and a low alarm that swells and holds.
    case 'redOn':
      noise(o, now, { type: 'bandpass', freq: 1100, q: 4, gain: .22, attack: .002, release: .07, wet: .3 }); thud(o, now + .01, .3, 70)
      for (const [f, d] of [[49, 0], [52, 9], [98, -6]] as const) tone(o, now + .05, { wave: 'sawtooth', freq: f, detune: d, filter: 260, gain: f > 60 ? .025 : .06, attack: .5, hold: 4.5, release: 1.4, vibrato: .02, wet: .5 })
      tone(o, now + .05, { wave: 'sine', freq: 330, to: 311, gain: .018, attack: .9, hold: 3.8, release: 1.2, wet: .7 })
      break
    case 'redOff': noise(o, now, { type: 'bandpass', freq: 1100, q: 4, gain: .18, attack: .002, release: .06, wet: .3 })
      for (let i = 0; i < 3; i++) tone(o, now + .08 + i * .08, { wave: 'square', freq: 118, gain: .025, attack: .002, release: .05, filter: 1200, wet: .3 }); break
    case 'vanish': noise(o, now, { type: 'highpass', freq: 1800, to: 5000, gain: .1, attack: .05, release: .5, pan, wet: .9 }); whisper(o, now, .8, pan, .08)
      clip(o, 'moan-c', now, { gain: .25, rate: 1.15, pan, wet: .9, until: now + 1.1, fadeOut: .6 }); break
  }
}

/**
 * One step of something walking up behind you (approachPlan), `delay` seconds from now. Far off (`near` 0) it is a
 * dull, wet thud lost in the echo; at your back (1) a hard bare slap with its weight coming through the floor. The first
 * step of the rush (`burst` and `first`) brings its breath in with it.
 */
export function playApproachStep(ctx: Ctx, bus: AudioNode, near: number, pan: number, delay = 0, burst = false, first = false) {
  const o = output(ctx, bus), at = ctx.currentTime + .01 + Math.max(0, delay), loud = near ** 1.5
  // The slap of a bare foot, and the weight coming down through the floor.
  noise(o, at, { type: 'lowpass', freq: 320 + near * 2800, gain: .1 + loud * .6, attack: .002, release: .08 + (1 - near) * .1, pan, wet: .9 - near * .6 })
  tone(o, at, { wave: 'sine', freq: 95, to: 42, gain: .06 + loud * .6, attack: .002, release: .16 + near * .08, pan, wet: .75 - near * .5 })
  // The floor is wet: a small splash under the heel.
  noise(o, at + .015, { type: 'bandpass', freq: 1500 + Math.random() * 900, q: 3, gain: .025 + loud * .14, attack: .003, release: .06, pan, wet: .9 - near * .5 })
  if (burst) noise(o, at, { type: 'highpass', freq: 1800, gain: .18 + loud * .3, attack: .001, release: .035, pan: pan + (Math.random() - .5) * .3, wet: .2 })
  if (burst && first && !clip(o, 'breath', at, { gain: .9, rate: 1.05, pan, wet: .1, fadeIn: .1 })) whisper(o, at, .6, pan, .18)
}

/** It runs on past you (you kept still and did not look back): a rush of air from `side` across to the other, and its breath right at your ear as it goes. */
export function playPassBy(ctx: Ctx, bus: AudioNode, side: number) {
  const o = output(ctx, bus), now = ctx.currentTime + .01
  whoosh(o, now, .55, side * .7, -side * .9, .32)
  if (!clip(o, 'breath', now + .02, { gain: .85, rate: 1.15, pan: side * .2, wet: .08, until: now + .9, fadeOut: .3 })) whisper(o, now, .5, side * .2, .16)
  whisper(o, now + .6, 1.1, -side * .8, .06)
}

/** The hall's own sound while you are in it: a low drone, drips, distant groans and creaks. Call tick() each frame. */
export class UndergroundAmbience {
  private nodes: { gain: GainNode; sources: AudioScheduledSourceNode[] } | undefined
  private nextDrip = 0
  private nextGroan = 0
  private bus: AudioNode | undefined

  tick(ctx: Ctx, bus: AudioNode, active: boolean) {
    const now = ctx.currentTime
    if (!active) { this.stop(ctx); return }
    if (!this.nodes || this.bus !== bus) this.start(ctx, bus)
    const o = output(ctx, bus)
    if (now >= this.nextDrip) {
      const pan = Math.random() * 1.6 - .8, f = 900 + Math.random() * 1200
      tone(o, now + .02, { wave: 'sine', freq: f, to: f * .45, gain: .035 + Math.random() * .03, attack: .002, release: .12, pan, wet: .85 })
      this.nextDrip = now + 1.2 + Math.random() * 4
    }
    if (now >= this.nextGroan) {
      if (this.nextGroan) {
        const r = Math.random(), pan = Math.random() * 1.4 - .7
        // A real moan far down the halls, slowed and drowned in the reverb (when the clips are in), a groan or a creak.
        const moaned = r < .4 && clip(o, any('moan-a', 'moan-b', 'moan-c'), now + .02, { gain: .14, rate: .6 + Math.random() * .2, pan, wet: .97, fadeIn: .8 })
        if (!moaned && r < .7) tone(o, now + .02, { wave: 'sawtooth', freq: 95 + Math.random() * 30, to: 55 + Math.random() * 15, filter: 320, gain: .03, attack: 1.2, hold: .6, release: 1.8, vibrato: .06, pan, wet: .95 })
        else if (!moaned) creak(o, now + .02, 1.4, 110 + Math.random() * 60, pan, .035)
      }
      this.nextGroan = now + 10 + Math.random() * 16
    }
  }

  private start(ctx: Ctx, bus: AudioNode) {
    this.stop(ctx)
    void loadHorrorClips(ctx)
    const o = output(ctx, bus), gain = ctx.createGain(), sources: AudioScheduledSourceNode[] = []
    gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5)
    for (const [f, d, level] of [[46, 0, .017], [46.6, 0, .015], [92.4, 5, .005]] as const) {
      const osc = ctx.createOscillator(); osc.frequency.value = f; osc.detune.value = d
      const g = ctx.createGain(); g.gain.value = level; osc.connect(g).connect(gain); osc.start(); sources.push(osc)
    }
    const rumble = ctx.createBufferSource(); rumble.buffer = kits.get(ctx)!.noise; rumble.loop = true
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140
    const rg = ctx.createGain(); rg.gain.value = .03
    rumble.connect(lp).connect(rg).connect(gain); rumble.start(); sources.push(rumble)
    const routed = route(o, gain, 0, .3)
    release(rumble, [lp, rg, gain, ...routed])
    this.nodes = { gain, sources }; this.bus = bus
    this.nextDrip = ctx.currentTime + 1; this.nextGroan = ctx.currentTime + 4
  }

  stop(ctx: Ctx) {
    const n = this.nodes; if (!n) return
    this.nodes = undefined
    const t = ctx.currentTime
    n.gain.gain.cancelScheduledValues(t); n.gain.gain.setValueAtTime(Math.max(.0001, n.gain.gain.value), t); n.gain.gain.exponentialRampToValueAtTime(.0001, t + .8)
    for (const s of n.sources) s.stop(t + .85)
    this.nextGroan = 0
  }
}
