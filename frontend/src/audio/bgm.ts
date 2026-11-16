import { useEffect } from 'react'
import { create } from 'zustand'
import type { BgmSting, BgmTrack } from './bgmScene'

export const BGM_VOLUME = { min: 0, max: 100, initial: 50 } as const
const FADE_S = 1.5, PERIOD_FADE_S = 5, DUCK = 0.25

export function clampBgmVolume(volume: number) {
  if (!Number.isFinite(volume)) return BGM_VOLUME.initial
  return Math.min(BGM_VOLUME.max, Math.max(BGM_VOLUME.min, Math.round(volume)))
}

function savedSettings(storageKey: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (value && typeof value === 'object' && 'volume' in value)
      return { volume: clampBgmVolume(Number(value.volume)), muted: 'muted' in value && value.muted === true }
  } catch {
    // Blocked or malformed storage falls back to the defaults.
  }
  return { volume: BGM_VOLUME.initial as number, muted: false }
}

function soundSettings(storageKey: string) {
  const store = create(() => savedSettings(storageKey))
  const set = (next: { volume?: number; muted?: boolean }) => {
    const settings = { ...store.getState(), ...next }
    settings.volume = clampBgmVolume(settings.volume)
    store.setState(settings)
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings))
    } catch {
      // Storage can be blocked; the value still applies for this session.
    }
    applyVolume()
  }
  return [store, set] as const
}

export const [useBgmSettings, setBgmSettings] = soundSettings('ontop-bgm-v1')
// Effects have their own level so a quiet soundtrack can still sit under clear game cues.
export const [useSfxSettings, setSfxSettings] = soundSettings('ontop-sfx-v1')

type Voice = { track: BgmTrack; source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; duration: number }
let audio: AudioContext | undefined, master: GainNode | undefined, music: GainNode | undefined, effects: GainNode | undefined
let jumpEffects: GainNode | undefined
let jumpmapFocused = false
let fountainFocus = 0
let firepitFocus = 0

export function setFirepitAudioFocus(focus: number) {
  if (firepitFocus === focus || (focus !== 0 && Math.abs(firepitFocus - focus) < .015)) return
  firepitFocus = focus
  applyVolume()
}

export function setFountainAudioFocus(focus: number) {
  if (Math.abs(fountainFocus - focus) < .015 && focus !== 0) return
  if (fountainFocus === focus) return
  fountainFocus = focus
  applyVolume()
}

/** Temporary mix only: never overwrite the player's saved volume or mute choices. */
export function setJumpmapAudioFocus(focused: boolean) {
  jumpmapFocused = focused
  applyVolume()
}
let current: Voice | undefined
let duckUntil = 0
let wanted: BgmTrack | null = null
let armed = false
const buffers = new Map<string, Promise<AudioBuffer | null>>()
// Park loops continue where they left off after a short visit to a game or the shop.
const resumeAt = new Map<BgmTrack, number>()
const isPark = (track: BgmTrack) => track.startsWith('park-')

export function loadSound(context: AudioContext, name: string) {
  let buffer = buffers.get(name)
  if (!buffer) {
    const file = name === 'omok-place' ? 'audio/omok/stone-tap.wav' : `audio/bgm/${name}.ogg`
    buffer = fetch(`${import.meta.env.BASE_URL}${file}`)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(data => context.decodeAudioData(data))
      // A missing or undecodable file simply stays silent.
      .catch(() => null)
    buffers.set(name, buffer)
  }
  return buffer
}

function applyVolume() {
  if (!audio || !master || !effects) return
  const ambience = Math.max(fountainFocus, firepitFocus)
  for (const [node, { volume, muted }, focus] of [[master, useBgmSettings.getState(), jumpmapFocused ? .25 : 1 - .66 * ambience], [effects, useSfxSettings.getState(), jumpmapFocused ? .2 : 1]] as const)
    node.gain.setTargetAtTime(muted ? 0 : (volume / 100) ** 2 * focus, audio.currentTime, 0.05)
  const sfx = useSfxSettings.getState()
  jumpEffects?.gain.setTargetAtTime(sfx.muted ? 0 : (sfx.volume / 100) ** 2, audio.currentTime, .05)
}

/** The effects bus once a gesture has opened audio; effects never open it on their own. */
export function effectsOutput(focus: 'background' | 'jumpmap' = 'background') {
  const bus = focus === 'jumpmap' ? jumpEffects : effects
  return audio && bus && audio.state === 'running' ? { context: audio, bus } : null
}

function unlock() {
  window.removeEventListener('pointerdown', unlock, true)
  window.removeEventListener('keydown', unlock, true)
  if (audio) return
  try {
    audio = new AudioContext()
    master = audio.createGain()
    music = audio.createGain()
    effects = audio.createGain()
    jumpEffects = audio.createGain()
    music.connect(master).connect(audio.destination)
    effects.connect(audio.destination)
    jumpEffects.connect(audio.destination)
    applyVolume()
    void audio.resume().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (audio) void (document.hidden ? audio.suspend() : audio.resume()).catch(() => {})
    })
  } catch {
    return // Unsupported or blocked audio must not interrupt the page.
  }
  if (wanted) playBgm(wanted)
}

/** Browsers start audio only after a user gesture, so the first click or key opens the context. */
export function armUnlock() {
  if (typeof window === 'undefined') return
  // Asked from inside a gesture (a button press): open now instead of waiting for the next one.
  if (!audio && navigator.userActivation?.isActive) return unlock()
  if (armed) return
  armed = true
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

function release(voice: Voice, now: number, fade: number) {
  if (isPark(voice.track)) resumeAt.set(voice.track, (voice.offset + now - voice.startedAt) % voice.duration)
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
  voice.gain.gain.linearRampToValueAtTime(0, now + fade)
  voice.source.onended = () => { voice.source.disconnect(); voice.gain.disconnect() }
  voice.source.stop(now + fade)
}

function crossfade(context: AudioContext, bus: GainNode, track: BgmTrack, buffer: AudioBuffer | null) {
  const now = context.currentTime
  const fade = current && isPark(current.track) && isPark(track) ? PERIOD_FADE_S : FADE_S
  if (current) release(current, now, fade)
  current = undefined
  if (!buffer) return
  const source = context.createBufferSource(), gain = context.createGain()
  const offset = (resumeAt.get(track) ?? 0) % buffer.duration
  source.buffer = buffer
  source.loop = true
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(1, now + fade)
  source.connect(gain).connect(bus)
  source.start(now, offset)
  current = { track, source, gain, startedAt: now, offset, duration: buffer.duration }
}

/** Loops the track seamlessly; asking for the track already playing changes nothing. */
export function playBgm(track: BgmTrack | null) {
  wanted = track
  if (track === null) {
    if (audio && current) release(current, audio.currentTime, FADE_S)
    current = undefined
    return
  }
  if (!audio) return armUnlock()
  const context = audio, bus = music
  if (!context || !bus || current?.track === track) return
  void loadSound(context, track).then(buffer => {
    if (wanted === track && current?.track !== track) crossfade(context, bus, track, buffer)
  })
}

/** Plays once over the loop, which dips while the sting sounds. */
export function playSting(name: BgmSting) {
  const context = audio, bus = music, out = master
  if (!context || !bus || !out || context.state !== 'running') return
  void loadSound(context, name).then(buffer => {
    if (!buffer) return
    const now = context.currentTime
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(out)
    source.onended = () => source.disconnect()
    source.start(now)
    duckUntil = now + buffer.duration
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(bus.gain.value, now)
    bus.gain.linearRampToValueAtTime(DUCK, now + 0.3)
    bus.gain.setValueAtTime(DUCK, now + buffer.duration)
    bus.gain.linearRampToValueAtTime(1, now + buffer.duration + 1.5)
  })
}

/** 게임의 중요한 효과음 동안 음악만 잠깐 낮춘다. 저장된 볼륨/음소거와 효과음 bus는 유지한다. */
export function duckBgm(seconds: number, level = .45) {
  if (!audio || !music || audio.state !== 'running' || !Number.isFinite(seconds) || !Number.isFinite(level)) return
  const now = audio.currentTime
  duckUntil = Math.max(duckUntil, now + Math.min(2, Math.max(0, seconds)))
  const target = Math.min(music.gain.value, Math.min(1, Math.max(.15, level)))
  music.gain.cancelScheduledValues(now)
  music.gain.setValueAtTime(music.gain.value, now)
  music.gain.linearRampToValueAtTime(target, now + .025)
  music.gain.setValueAtTime(target, duckUntil)
  music.gain.linearRampToValueAtTime(1, duckUntil + .25)
}

export function useBgmTrack(track: BgmTrack | null) {
  useEffect(() => playBgm(track), [track])
}
