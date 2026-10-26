import { create } from 'zustand'

export const useDiceSound = create(() => ({ enabled: true }))
let audio: AudioContext | undefined
let lastSound = -Infinity
const voices = new Map<OscillatorNode, GainNode>()

function release(oscillator: OscillatorNode) {
  const gain = voices.get(oscillator)
  if (!gain) return
  voices.delete(oscillator)
  oscillator.disconnect(); gain.disconnect()
}
function silence() {
  for (const oscillator of voices.keys()) {
    try { oscillator.stop() } catch { /* Already ended. */ }
    release(oscillator)
  }
}
/** Called only by an accepted user gesture; audio is optional and never gates a game command. */
export function unlockDiceSound() {
  if (!useDiceSound.getState().enabled) return
  try {
    audio ??= new AudioContext()
    void audio.resume().catch(() => {})
  } catch { /* Unsupported or blocked audio must not interrupt play. */ }
}
export function setDiceSound(enabled: boolean) {
  useDiceSound.setState({ enabled })
  if (enabled) unlockDiceSound()
  else silence()
}
/** Original filtered percussion: no downloads, at most one short tone per 80ms. */
export function diceSound(strength = .5) {
  if (!audio || audio.state !== 'running' || !useDiceSound.getState().enabled
    || (typeof document !== 'undefined' && document.hidden) || voices.size >= 2
    || performance.now() - lastSound < 80) return
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : .5
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain()
    voices.set(oscillator, gain)
    oscillator.onended = () => release(oscillator)
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(420 + amount * 380, audio.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(90, audio.currentTime + .055)
    gain.gain.setValueAtTime(.035 * Math.min(1, amount + .2), audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .075)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(); oscillator.stop(audio.currentTime + .08)
    lastSound = performance.now()
  } catch { silence() }
}
export function disposeDiceSound() {
  silence()
  const previous = audio; audio = undefined; lastSound = -Infinity
  if (previous) void previous.close().catch(() => {})
}
