import { useEffect } from 'react'
import { create } from 'zustand'
import type { BgmSting, BgmTrack } from './bgmScene'

export const BGM_VOLUME = { min: 0, max: 100, initial: 50 } as const
const storageKey = 'ontop-bgm-v1'
const FADE_S = 1.5, PERIOD_FADE_S = 5, DUCK = 0.25

export function clampBgmVolume(volume: number) {
  if (!Number.isFinite(volume)) return BGM_VOLUME.initial
  return Math.min(BGM_VOLUME.max, Math.max(BGM_VOLUME.min, Math.round(volume)))
}

function savedSettings() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (value && typeof value === 'object' && 'volume' in value)
      return { volume: clampBgmVolume(Number(value.volume)), muted: 'muted' in value && value.muted === true }
  } catch {
    // Blocked or malformed storage falls back to the defaults.
  }
  return { volume: BGM_VOLUME.initial as number, muted: false }
}

export const useBgmSettings = create(savedSettings)

export function setBgmSettings(next: { volume?: number; muted?: boolean }) {
  const settings = { ...useBgmSettings.getState(), ...next }
  settings.volume = clampBgmVolume(settings.volume)
  useBgmSettings.setState(settings)
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // Storage can be blocked; the value still applies for this session.
  }
  applyVolume()
}

type Voice = { track: BgmTrack; source: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; duration: number }
let audio: AudioContext | undefined, master: GainNode | undefined, music: GainNode | undefined
let current: Voice | undefined
let wanted: BgmTrack | null = null
let armed = false
const buffers = new Map<string, Promise<AudioBuffer | null>>()
// Park loops continue where they left off after a short visit to a game or the shop.
const resumeAt = new Map<BgmTrack, number>()
const isPark = (track: BgmTrack) => track.startsWith('park-')

function load(context: AudioContext, name: string) {
  let buffer = buffers.get(name)
  if (!buffer) {
    buffer = fetch(`${import.meta.env.BASE_URL}audio/bgm/${name}.ogg`)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status))))
      .then(data => context.decodeAudioData(data))
      // A missing or undecodable file simply stays silent.
      .catch(() => null)
    buffers.set(name, buffer)
  }
  return buffer
}

function applyVolume() {
  if (!audio || !master) return
  const { volume, muted } = useBgmSettings.getState()
  master.gain.setTargetAtTime(muted ? 0 : (volume / 100) ** 2, audio.currentTime, 0.05)
}

function unlock() {
  window.removeEventListener('pointerdown', unlock, true)
  window.removeEventListener('keydown', unlock, true)
  if (audio) return
  try {
    audio = new AudioContext()
    master = audio.createGain()
    music = audio.createGain()
    music.connect(master).connect(audio.destination)
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
function armUnlock() {
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
export function playBgm(track: BgmTrack) {
  wanted = track
  if (!audio) return armUnlock()
  const context = audio, bus = music
  if (!context || !bus || current?.track === track) return
  void load(context, track).then(buffer => {
    if (wanted === track && current?.track !== track) crossfade(context, bus, track, buffer)
  })
}

/** Plays once over the loop, which dips while the sting sounds. */
export function playSting(name: BgmSting) {
  const context = audio, bus = music, out = master
  if (!context || !bus || !out || context.state !== 'running') return
  void load(context, name).then(buffer => {
    if (!buffer) return
    const now = context.currentTime
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(out)
    source.onended = () => source.disconnect()
    source.start(now)
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(bus.gain.value, now)
    bus.gain.linearRampToValueAtTime(DUCK, now + 0.3)
    bus.gain.setValueAtTime(DUCK, now + buffer.duration)
    bus.gain.linearRampToValueAtTime(1, now + buffer.duration + 1.5)
  })
}

export function useBgmTrack(track: BgmTrack) {
  useEffect(() => playBgm(track), [track])
}
