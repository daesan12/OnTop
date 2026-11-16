import { armUnlock, effectsOutput, useBgmSettings } from '../audio/bgm'
import type { BgmState, JumpRopeSfx } from './jumpRopeAudioCues'

/**
 * Final sound pack v5 for the jump rope: one mixer for the standalone preview and the park game.
 * It reuses the park's audio context, gesture unlock and hidden-tab suspend from audio/bgm. Effects go
 * through the shared effects bus (the player's 효과음 setting); the loop follows the 배경음악 setting
 * on its own gain, so both stay independently adjustable and nothing here changes the saved values.
 */
export const jumpRopeBgm = {
  file: 'bgm_comedy_loop.ogg',
  /** Pack manifest volume_suggested. */
  level: 0.28,
  fadeInS: 0.35,
  pauseFadeS: 0.12,
  stopFadeS: 0.5,
  /** The loop dips to this while the grandpa's entry voice plays, then comes back. */
  duck: 0.35,
  duckInS: 0.08,
  duckOutS: 0.4,
} as const

type SfxSpec = {
  file: string
  /** Pack manifest volume_suggested, applied under the player's effects setting. */
  level: number
  /** restart: a new one fades out the previous instance. keep: a new one is dropped while one plays. */
  overlap: 'restart' | 'keep'
  /** Requests closer together than this start only once. */
  minGapMs?: number
  /** Other sounds this one fades out when it starts. */
  chokes?: readonly JumpRopeSfx[]
  /** Dips the loop for the clip's length. */
  ducksBgm?: boolean
  /** Playback starts this far into the file, past a near-silent lead-in. The file itself is unchanged. */
  offsetS?: number
}

export const jumpRopeSfx: Record<JumpRopeSfx, SfxSpec> = {
  countdownTick: { file: 'sfx/countdown_tick.ogg', level: 0.43, overlap: 'restart' },
  gameGo: { file: 'sfx/game_go.ogg', level: 0.51, overlap: 'restart' },
  // A second MISS inside the 2 s laugh replaces it instead of stacking two laughs.
  missLaugh: { file: 'sfx/pigeon_miss_laugh.ogg', level: 0.55, overlap: 'restart' },
  grandpaEnter: { file: 'sfx/grandpa_enter_voice.ogg', level: 0.85, overlap: 'keep', ducksBgm: true },
  broomWindup: { file: 'sfx/broom_windup.ogg', level: 0.52, overlap: 'restart' },
  broomSwing: { file: 'sfx/broom_swing.ogg', level: 0.72, overlap: 'restart' },
  // The whack lands 240 ms into the file after a faint swish the swing sound already covers: start just before it,
  // so the impact sounds with the stun instead of a quarter second later.
  broomHit: { file: 'sfx/broom_hit.ogg', level: 0.76, overlap: 'restart', offsetS: 0.22 },
  // Two tracks can start flights close together in the last window: one flutter, not a stack.
  pigeonFlap: { file: 'sfx/pigeon_flap.ogg', level: 0.43, overlap: 'restart', minGapMs: 250 },
  poopSplat: { file: 'sfx/pigeon_poop_splat.ogg', level: 0.58, overlap: 'restart' },
  victory: { file: 'sfx/victory_fanfare.ogg', level: 0.72, overlap: 'keep' },
  gameOver: { file: 'sfx/game_over.ogg', level: 0.6, overlap: 'keep', chokes: ['missLaugh'] },
}

/** Different sounds may overlap (a laugh under a splat); beyond this the oldest one fades out. */
export const maxJumpRopeVoices = 6
/** A sound whose clip is still loading starts only if it is ready this soon; a late cue is worse than none. */
const maxStartDelayS = 0.15
const chokeFadeS = 0.06

export type AudioOutput = { context: AudioContext; bus: AudioNode }
export type AudioLoader = (context: AudioContext, file: string) => Promise<AudioBuffer | null>
export type AudioLogEntry = {
  seq: number
  sound: JumpRopeSfx | 'bgm'
  event: 'play' | 'skip' | 'pause' | 'stop' | 'duck'
  reason?: 'locked' | 'missing' | 'late' | 'playing' | 'throttled' | 'cancelled'
}

const assetBase = `${import.meta.env.BASE_URL}audio/jump-rope/`
const buffers = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer | null>>>()

/** Fetches and decodes a pack file once per context. A missing or undecodable file stays silent and the game goes on. */
export function loadJumpRopeSound(context: AudioContext, file: string) {
  let cache = buffers.get(context)
  if (!cache) buffers.set(context, cache = new Map())
  let buffer = cache.get(file)
  if (!buffer) {
    buffer = fetch(assetBase + file)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(data => context.decodeAudioData(data))
      .catch(() => null)
    cache.set(file, buffer)
  }
  return buffer
}

type Channels = { context: AudioContext; bus: AudioNode; sfx: GainNode; duck: GainNode; music: GainNode }
type Voice = { sound: JumpRopeSfx; source: AudioBufferSourceNode; gain: GainNode }
type Loop = { source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; duration: number }

export class JumpRopeAudio {
  private channels: Channels | null = null
  private readonly voices = new Set<Voice>()
  private readonly lastStart = new Map<JumpRopeSfx, number>()
  /** Kept sounds whose clip is still loading, so a repeat cannot slip in before the first one starts. */
  private readonly loading = new Set<JumpRopeSfx>()
  /** Clips already decoded (or found missing) for the current channels. */
  private readonly ready = new Map<string, AudioBuffer | null>()
  private readonly listeners = new Set<(entry: AudioLogEntry) => void>()
  /** Bumped by every stop, so clips that finish loading afterwards never start. */
  private generation = 0
  private seq = 0
  private disposed = false
  private bgmWanted: BgmState = 'off'
  private loop: Loop | null = null
  private loopLoading = false
  private loopMissing = false
  private loopOffset = 0
  private ducking: Voice | null = null
  private readonly stopSettings: () => void

  constructor(
    private readonly output: () => AudioOutput | null = effectsOutput,
    private readonly load: AudioLoader = loadJumpRopeSound,
  ) {
    // The park has unlocked audio long before; the standalone preview opens it on its first click or key.
    armUnlock()
    this.stopSettings = useBgmSettings.subscribe(() => this.applyMusicVolume())
    this.connect()
  }

  /** Recent decisions for the developer panel and the browser tests. */
  subscribe(listener: (entry: AudioLogEntry) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private log(sound: AudioLogEntry['sound'], event: AudioLogEntry['event'], reason?: AudioLogEntry['reason']) {
    const entry: AudioLogEntry = { seq: ++this.seq, sound, event, ...(reason ? { reason } : {}) }
    for (const listener of this.listeners) listener(entry)
  }

  /** The shared context once a gesture has opened it. The first connection also warms every clip. */
  private connect() {
    if (this.disposed) return null
    const shared = this.output()
    if (!shared) return null
    const current = this.channels
    if (current?.context === shared.context && current.bus === shared.bus) return current
    const { context, bus } = shared
    const sfx = context.createGain(), duck = context.createGain(), music = context.createGain()
    sfx.connect(bus)
    duck.connect(music).connect(context.destination)
    music.gain.value = 0
    const channels: Channels = { context, bus, sfx, duck, music }
    this.channels = channels
    this.ready.clear()
    this.applyMusicVolume()
    for (const file of [jumpRopeBgm.file, ...Object.values(jumpRopeSfx).map(spec => spec.file)]) {
      void this.load(context, file).then(buffer => { if (this.channels === channels) this.ready.set(file, buffer) })
    }
    return channels
  }

  /** The same curve as the park music: (volume / 100)² or silence when muted. */
  private applyMusicVolume() {
    const channels = this.channels
    if (!channels) return
    const { volume, muted } = useBgmSettings.getState()
    channels.music.gain.setTargetAtTime(muted ? 0 : (volume / 100) ** 2 * jumpRopeBgm.level, channels.context.currentTime, 0.05)
  }

  play(sound: JumpRopeSfx) {
    const spec = jumpRopeSfx[sound]
    const channels = this.connect()
    if (!channels) return this.log(sound, 'skip', 'locked')
    const { context } = channels
    const requestedAt = context.currentTime
    const last = this.lastStart.get(sound)
    if (spec.minGapMs && last !== undefined && (requestedAt - last) * 1000 < spec.minGapMs) return this.log(sound, 'skip', 'throttled')
    if (spec.overlap === 'keep' && (this.loading.has(sound) || [...this.voices].some(voice => voice.sound === sound))) {
      return this.log(sound, 'skip', 'playing')
    }
    this.lastStart.set(sound, requestedAt)
    // A warmed clip starts right here. A promise hop would wait for the rest of this frame, and a heavy frame
    // (the grandpa's first appearance compiling shaders) can outlast the start window and drop the cue.
    if (this.ready.has(spec.file)) {
      const buffer = this.ready.get(spec.file)
      return buffer ? this.start(channels, sound, spec, buffer) : this.log(sound, 'skip', 'missing')
    }
    if (spec.overlap === 'keep') this.loading.add(sound)
    const generation = this.generation
    void this.load(context, spec.file).then(buffer => {
      this.loading.delete(sound)
      if (generation !== this.generation || this.disposed || this.channels !== channels) return this.log(sound, 'skip', 'cancelled')
      if (!buffer) return this.log(sound, 'skip', 'missing')
      if (context.state !== 'running' || context.currentTime - requestedAt > maxStartDelayS) return this.log(sound, 'skip', 'late')
      this.start(channels, sound, spec, buffer)
    })
  }

  private start({ context, sfx }: Channels, sound: JumpRopeSfx, spec: SfxSpec, buffer: AudioBuffer) {
    for (const voice of [...this.voices]) {
      if (voice.sound === sound || spec.chokes?.includes(voice.sound)) this.release(voice, chokeFadeS)
    }
    while (this.voices.size >= maxJumpRopeVoices) this.release(this.voices.values().next().value!, chokeFadeS)
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer
    gain.gain.value = spec.level
    source.connect(gain).connect(sfx)
    const voice: Voice = { sound, source, gain }
    this.voices.add(voice)
    source.onended = () => {
      this.voices.delete(voice)
      // A voice that ran to its end already let the loop's scheduled dip recover.
      if (this.ducking === voice) this.ducking = null
      source.disconnect()
      gain.disconnect()
    }
    const offset = Math.min(spec.offsetS ?? 0, buffer.duration)
    source.start(context.currentTime, offset)
    if (spec.ducksBgm) this.duck(voice, buffer.duration - offset)
    this.log(sound, 'play')
  }

  private release(voice: Voice, fadeS: number) {
    this.voices.delete(voice)
    const param = voice.gain.gain, now = voice.source.context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(0, now + fadeS)
    voice.source.stop(now + fadeS)
    if (this.ducking === voice) this.restoreDuck()
  }

  private duck(voice: Voice, seconds: number) {
    const channels = this.channels
    if (!channels) return
    const param = channels.duck.gain, now = channels.context.currentTime
    this.ducking = voice
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(jumpRopeBgm.duck, now + jumpRopeBgm.duckInS)
    param.setValueAtTime(jumpRopeBgm.duck, now + seconds)
    param.linearRampToValueAtTime(1, now + seconds + jumpRopeBgm.duckOutS)
    this.log('bgm', 'duck')
  }

  private restoreDuck() {
    this.ducking = null
    const channels = this.channels
    if (!channels) return
    const param = channels.duck.gain, now = channels.context.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(1, now + 0.2)
  }

  /** Called on every step: only a change of the wanted state, or a loop still waiting to start, does work. */
  setBgm(state: BgmState) {
    if (this.disposed) return
    if (state === this.bgmWanted) {
      if (state === 'on' && !this.loop && !this.loopLoading && !this.loopMissing) this.startLoop()
      return
    }
    this.bgmWanted = state
    if (state === 'on') return this.startLoop()
    if (this.loop) this.stopLoop(state === 'paused' ? jumpRopeBgm.pauseFadeS : jumpRopeBgm.stopFadeS, state)
    if (state === 'off') this.loopOffset = 0
  }

  private startLoop() {
    const channels = this.connect()
    if (!channels) return
    if (this.ready.has(jumpRopeBgm.file)) return this.beginLoop(channels, this.ready.get(jumpRopeBgm.file)!)
    this.loopLoading = true
    void this.load(channels.context, jumpRopeBgm.file).then(buffer => {
      this.loopLoading = false
      if (this.disposed || this.bgmWanted !== 'on' || this.loop || this.channels !== channels) return
      this.beginLoop(channels, buffer)
    })
  }

  private beginLoop({ context, duck }: Channels, buffer: AudioBuffer | null) {
    if (!buffer) {
      this.loopMissing = true
      return this.log('bgm', 'skip', 'missing')
    }
    const source = context.createBufferSource(), gain = context.createGain(), now = context.currentTime
    source.buffer = buffer
    source.loop = true
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + jumpRopeBgm.fadeInS)
    source.connect(gain).connect(duck)
    const offset = this.loopOffset % buffer.duration
    source.start(now, offset)
    this.loop = { source, gain, startedAt: now, offset, duration: buffer.duration }
    this.log('bgm', 'play')
  }

  private stopLoop(fadeS: number, state: 'paused' | 'off') {
    const loop = this.loop!
    this.loop = null
    const { source, gain } = loop, now = source.context.currentTime
    this.loopOffset = (loop.offset + now - loop.startedAt) % loop.duration
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + fadeS)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    source.stop(now + fadeS)
    this.log('bgm', state === 'paused' ? 'pause' : 'stop')
  }

  /** Fades out every effect and drops clips still loading. */
  stopSfx(fadeS = chokeFadeS) {
    this.generation++
    for (const voice of [...this.voices]) this.release(voice, fadeS)
  }

  /** The exit confirmation froze the round: the loop keeps its place and the effects stop. */
  hold() {
    this.setBgm('paused')
    this.stopSfx()
  }

  /** A new round, a reset or a return to the menu: silence and a loop from the top. */
  resetRound() {
    this.setBgm('off')
    this.stopSfx()
    this.lastStart.clear()
  }

  dispose() {
    if (this.disposed) return
    this.stopSfx(0.03)
    if (this.loop) this.stopLoop(0.05, 'off')
    this.disposed = true
    this.stopSettings()
    this.listeners.clear()
    const channels = this.channels
    this.channels = null
    if (channels) setTimeout(() => {
      channels.sfx.disconnect()
      channels.duck.disconnect()
      channels.music.disconnect()
    }, 120)
  }
}
