// The moment a scare gets you (S15P31B105-450), the same for every kind of scare and for the screamers: a strike
// sound that changes each time (horrorAudio.playStrike), the view jolted, the screen torn by static or flushed red,
// sometimes a face filling the screen; then the aftermath, everything muffled and ringing for a few seconds.

import { effectsOutput } from '../src/audio/bgm'
import { viewControls } from '../src/world/cameraPerspective'
import { nextFlavor, playAftermath, playStrike, type StrikeFlavor } from './horrorAudio'
import { nextScreamer, redFlash, showScreamer, staticOverlay, type Screamer } from './horrorScreamer'

/** Jolt the first-person view for `seconds`, dying away; only ever adds and takes back its own offset. */
export function shakeView(seconds = .45, amount = .05) {
  if (typeof requestAnimationFrame === 'undefined') return
  const start = performance.now(), end = start + seconds * 1000
  let yaw = 0, pitch = 0
  const tick = () => {
    viewControls.yaw -= yaw; viewControls.pitch -= pitch
    const now = performance.now()
    if (now >= end) return
    const k = (end - now) / (end - start)
    yaw = (Math.random() - .5) * 2 * amount * k; pitch = (Math.random() - .5) * 2 * amount * k * .6
    viewControls.yaw += yaw; viewControls.pitch += pitch
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export interface StrikeOptions {
  /** Which strike sound; a different one from last time when left out. */
  flavor?: StrikeFlavor
  /** Leave the sound to the scare itself (the runner's and the long look's have their own), keep the rest. */
  silent?: boolean
  /** Fill the screen with a face: true for the next unseen one, or a given one. */
  image?: boolean | Screamer
}

/** Strike now. Returns the flavor used. */
export function strike(options: StrikeOptions = {}): StrikeFlavor {
  const flavor = options.flavor ?? nextFlavor()
  const out = effectsOutput()
  if (out) {
    if (!options.silent) playStrike(out.context, out.bus, flavor)
    // Muffle only after the strike has hit, or it would muffle the strike itself.
    setTimeout(() => { const o = effectsOutput(); if (o) playAftermath(o.context, o.bus, 3.2) }, 450)
  }
  shakeView(flavor === 'boom' ? .6 : .45, flavor === 'boom' ? .07 : .05)
  if (options.image) showScreamer(options.image === true ? nextScreamer(true) : options.image)
  else if (flavor === 'static') staticOverlay(420, .55)
  else if (flavor !== 'boom') redFlash()
  return flavor
}
