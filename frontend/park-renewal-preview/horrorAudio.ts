// Underground sound (S15P31B105-450), synthesised with Web Audio — no sound files. Each encounter gets its own
// stinger (whispers, stone scraping, rope and door creaks, a growl, a shriek, a splash, bone cracks, wet squelches),
// timed to the beats its animation already uses, and the hall itself hums: a low drone, dripping water, distant
// groans and the odd metal creak. Everything goes through the park's effects bus, so the SFX volume and mute apply.

import { STAGE } from './encounterStaging'

type Ctx = BaseAudioContext
interface Out { ctx: Ctx; dry: AudioNode; wet: AudioNode }

const kits = new WeakMap<Ctx, { noise: AudioBuffer; reverb: ConvolverNode; master: DynamicsCompressorNode; bus: AudioNode }>()
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
    reverb.connect(wetGain).connect(master); master.connect(bus)
    k = { noise, reverb, master, bus }
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
/** The rush: a shriek right in your face, a hit, then the dark swallows it. */
function lungeHit(o: Out, at: number, len: number) {
  shriek(o, at, len + .25, .13)
  noise(o, at, { type: 'bandpass', freq: 1800, to: 700, q: .8, gain: .5, attack: .02, hold: len * .6, release: .3, wobble: .5, wet: .3 })
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
  playEncounterSound(ctx, bus, id, (lunge - reveal) * 1000, beats, reveal)
}
/** The rush, played when it actually starts (on time, or early when you walk up to it). */
export function playEncounterLunge(ctx: Ctx, bus: AudioNode, duration: number) {
  lungeHit(output(ctx, bus), ctx.currentTime + .01, (STAGE.blackout - STAGE.lunge) * duration / 1000)
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
        if (Math.random() < .55) tone(o, now + .02, { wave: 'sawtooth', freq: 95 + Math.random() * 30, to: 55 + Math.random() * 15, filter: 320, gain: .03, attack: 1.2, hold: .6, release: 1.8, vibrato: .06, pan: Math.random() * 1.4 - .7, wet: .95 })
        else creak(o, now + .02, 1.4, 110 + Math.random() * 60, Math.random() * 1.4 - .7, .035)
      }
      this.nextGroan = now + 10 + Math.random() * 16
    }
  }

  private start(ctx: Ctx, bus: AudioNode) {
    this.stop(ctx)
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
