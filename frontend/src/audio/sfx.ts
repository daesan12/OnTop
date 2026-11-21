import { effectsOutput, loadSound, useSfxSettings } from './bgm'
import { chessSoundBuffer, isChessSound } from '../game/chess/sound'

/** File names under public/audio/bgm, plus generated chess percussion. */
export type SfxName = 'ui-click' | 'ui-manual' | 'ui-equip' | 'coin-gain'
  | 'game-ready' | 'game-start' | 'game-turn' | 'omok-place' | 'dice-roll' | 'card-draw' | 'card-one' | 'halli-bell'
  | 'chess-move' | 'chess-capture' | 'chess-check' | 'chess-checkmate' | 'chess-checkmate-win' | 'chess-checkmate-lose'
  | 'chess-draw' | 'chess-select' | 'chess-invalid'
  | 'chess-promotion' | 'chess-castle' | 'chess-en-passant'
  | 'bungeo-pour' | 'bungeo-flip' | 'bungeo-burn'
  | 'emote-clap' | 'emote-tsk' | 'emote-fart' | 'emote-wave-male' | 'emote-wave-female'
  | 'move-jump' | 'move-land' | 'move-splash' | 'move-step-stone' | 'move-step-grass' | 'amb-pigeon-takeoff'
  | 'alkkagi-select' | 'alkkagi-shot' | 'alkkagi-collision' | 'alkkagi-fall' | 'alkkagi-item' | 'alkkagi-turn-change'
  | 'arcade-button' | 'arcade-roulette-slow-stop'
  | 'mole-hit' | 'mole-hedgehog-hit' | 'mole-empty-stun' | 'mole-phase-change'
export type SfxLoop = 'dice-shake' | 'amb-fountain' | 'amb-pond' | 'arcade-roulette-spin'
export interface SoundPoint { x: number; y: number; z: number }

// Files are peak-normalised, so these levels set how loud each cue sits against the others.
const LEVEL: Record<SfxName | SfxLoop, number> = {
  'ui-click': 0.25, 'ui-manual': 0.5, 'ui-equip': 0.45, 'coin-gain': 0.5,
  'omok-place': .6,
  'chess-move': .6, 'chess-capture': .7,
  'chess-check': .55, 'chess-checkmate': .6,
  'chess-checkmate-win': .6, 'chess-checkmate-lose': .5,
  'chess-draw': .5,
  'chess-select': .22,
  'chess-invalid': .28,
  'chess-promotion': .5,
  'chess-castle': .6,
  'chess-en-passant': .6,
  'game-ready': 0.5, 'game-start': 0.55, 'game-turn': 0.5, 'dice-roll': 0.6, 'card-draw': 0.5, 'card-one': 0.55,
  'halli-bell': 0.55,
  'bungeo-pour': 0.5, 'bungeo-flip': 0.5, 'bungeo-burn': 0.45,
  'emote-clap': 0.55, 'emote-tsk': 0.6, 'emote-fart': 0.6, 'emote-wave-male': 0.45, 'emote-wave-female': 0.4,
  'move-jump': 0.18, 'move-land': 0.35, 'move-splash': 0.55, 'move-step-stone': 0.22, 'move-step-grass': 0.18,
  'amb-pigeon-takeoff': 0.5, 'dice-shake': 0.45, 'amb-fountain': 0.5, 'amb-pond': 0.6,
  'alkkagi-select': 0.4, 'alkkagi-shot': 0.55, 'alkkagi-collision': 0.5, 'alkkagi-fall': 0.5, 'alkkagi-item': 0.5,
  'alkkagi-turn-change': 0.45,
  'arcade-button': 0.35, 'arcade-roulette-spin': 0.45, 'arcade-roulette-slow-stop': 0.5,
  // 기절음은 평균 음량이 다른 효과음보다 10dB 가까이 커서 낮춘다.
  'mole-hit': 0.45, 'mole-hedgehog-hit': 0.55, 'mole-empty-stun': 0.3, 'mole-phase-change': 0.5,
}
const VARIANTS: Partial<Record<SfxName, number>> = { 'move-step-stone': 4, 'move-step-grass': 4 }
// Placed sounds play at full level within `near` metres of the camera and fade to silence at `far`.
const RANGE: Partial<Record<SfxName | SfxLoop, readonly [near: number, far: number]>> = {
  'move-step-stone': [3, 16], 'move-step-grass': [3, 16], 'move-jump': [4, 20], 'move-land': [4, 20],
  'move-splash': [5, 25], 'amb-pigeon-takeoff': [5, 25], 'amb-fountain': [8, 25], 'amb-pond': [5, 20],
}
export const rangeOf = (name: SfxName | SfxLoop) => RANGE[name] ?? [6, 30] as const
// A loop starts inside `far` and stops only this much beyond it, so standing on the edge does not flicker.
const HYSTERESIS = 3
export const loopAudible = (distance: number, far: number, running: boolean) => distance < far + (running ? HYSTERESIS : 0)
const MAX_VOICES = 10
const listener: SoundPoint = { x: 0, y: 0, z: 0 }
const distanceTo = (at: SoundPoint) => Math.hypot(at.x - listener.x, at.y - listener.y, at.z - listener.z)
let voices = 0

function place(node: PannerNode, at: SoundPoint) {
  if (node.positionX) {
    node.positionX.value = at.x; node.positionY.value = at.y; node.positionZ.value = at.z
  } else node.setPosition(at.x, at.y, at.z)
}
function panner(context: AudioContext, at: SoundPoint, [near, far]: readonly [number, number]) {
  const node = context.createPanner()
  // HRTF also tells front from back and above from below, most clearly on headphones.
  node.panningModel = 'HRTF'
  node.distanceModel = 'linear'
  node.refDistance = near
  node.maxDistance = far
  node.rolloffFactor = 1
  place(node, at)
  return node
}

/** Decodes a cue ahead of its first play into the shared cache; does nothing until audio is unlocked. */
function effectBuffer(context: AudioContext, name: string) {
  return isChessSound(name) ? Promise.resolve(chessSoundBuffer(context, name)) : loadSound(context, name)
}
export function preloadSfx(name: SfxName) {
  const out = effectsOutput()
  if (out && !VARIANTS[name]) void effectBuffer(out.context, name)
}

/** Plays once; `at` places it in the park so it pans and fades with distance from the camera. */
export function playSfx(name: SfxName, at?: SoundPoint, level = 1, delaySeconds = 0) {
  if (isChessSound(name)) {
    const settings = useSfxSettings.getState()
    if (settings.muted || settings.volume === 0 || typeof document !== 'undefined' && document.hidden) return
  }
  const out = effectsOutput()
  if (!out || voices >= MAX_VOICES) return
  // Out-of-range sounds are skipped instead of decoded and mixed at silence.
  if (at && distanceTo(at) >= rangeOf(name)[1]) return
  const count = VARIANTS[name]
  voices++
  void effectBuffer(out.context, count ? `${name}-${1 + Math.floor(Math.random() * count)}` : name).then(buffer => {
    if (!buffer) { voices--; return }
    const { context, bus } = out
    const source = context.createBufferSource(), gain = context.createGain(), space = at && panner(context, at, rangeOf(name))
    source.buffer = buffer
    // Repeated steps vary slightly so a walk does not sound like one sample on repeat.
    if (count) source.playbackRate.value = 0.94 + Math.random() * 0.12
    gain.gain.value = LEVEL[name] * level
    source.connect(gain)
    if (space) gain.connect(space).connect(bus)
    else gain.connect(bus)
    source.onended = () => { voices--; source.disconnect(); gain.disconnect(); space?.disconnect() }
    // Let the wooden move/capture impact speak before the position alert.
    source.start(context.currentTime + delaySeconds + (name === 'chess-promotion' || name === 'chess-check' || name.startsWith('chess-checkmate') || name === 'chess-draw' ? .18 : 0))
  })
}

type Loop = { source: AudioBufferSourceNode; gain: GainNode; space?: PannerNode }
const loops = new Map<SfxLoop, Loop | 'loading' | 'missing'>()
// The latest request wins once a loop finishes loading, so a short spin that already ended does not start late.
const requested = new Map<SfxLoop, [level: number, at?: SoundPoint]>()

function stopLoop(name: SfxLoop, loop: Loop, context: AudioContext) {
  loops.delete(name)
  loop.gain.gain.setTargetAtTime(0, context.currentTime, 0.15)
  loop.source.onended = () => { loop.source.disconnect(); loop.gain.disconnect(); loop.space?.disconnect() }
  loop.source.stop(context.currentTime + 0.8)
}

/**
 * Keeps a seamless loop at `level` while it is wanted; `at` places it in the park. It fades in when the
 * camera comes within range and stops once the camera leaves it or `level` drops to 0.
 */
export function setSfxLoop(name: SfxLoop, level: number, at?: SoundPoint) {
  requested.set(name, [level, at])
  const out = effectsOutput(), loop = loops.get(name)
  if (!out || loop === 'loading' || loop === 'missing') return
  const wanted = level > 0 && (!at || loopAudible(distanceTo(at), rangeOf(name)[1], !!loop))
  if (loop && !wanted) return stopLoop(name, loop, out.context)
  if (!loop) {
    if (!wanted) return
    loops.set(name, 'loading')
    void loadSound(out.context, name).then(buffer => {
      // A missing file is never fetched again.
      if (!buffer) { loops.set(name, 'missing'); return }
      const { context, bus } = out
      const source = context.createBufferSource(), gain = context.createGain(), space = at && panner(context, at, rangeOf(name))
      source.buffer = buffer
      source.loop = true
      gain.gain.value = 0
      source.connect(gain)
      if (space) gain.connect(space).connect(bus)
      else gain.connect(bus)
      source.start(0, Math.random() * buffer.duration)
      loops.set(name, { source, gain, space })
      setSfxLoop(name, ...requested.get(name)!)
    })
    return
  }
  loop.gain.gain.setTargetAtTime(level * LEVEL[name], out.context.currentTime, 0.2)
  if (at && loop.space) place(loop.space, at)
}

/** The camera is the listener: placed sounds pan with its facing and fade with distance from it. */
export function setSfxListener(position: SoundPoint, forward: SoundPoint) {
  Object.assign(listener, position)
  const out = effectsOutput()
  if (!out) return
  const ear = out.context.listener
  if (ear.positionX) {
    ear.positionX.value = position.x; ear.positionY.value = position.y; ear.positionZ.value = position.z
    ear.forwardX.value = forward.x; ear.forwardY.value = forward.y; ear.forwardZ.value = forward.z
    ear.upX.value = 0; ear.upY.value = 1; ear.upZ.value = 0
  } else {
    ear.setPosition(position.x, position.y, position.z)
    ear.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0)
  }
}
