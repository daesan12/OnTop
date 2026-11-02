import type { JumpHit } from './jumpSimulation'
import { playJumpSound as playLandingSound, preloadJumpSounds } from '../features/jumpmap/audio'

let context: AudioContext | undefined
export function enableJumpAudio() {
  try {
    const audio = context ??= new AudioContext()
    void audio.resume().then(() => preloadJumpSounds(audio)).catch(() => {})
  } catch { /* A blocked preview audio device must not interrupt input. */ }
}
export function playJumpSound(hit: JumpHit, muted: boolean) {
  if (!muted && context) playLandingSound(hit, { output: { context, bus: context.destination } })
}
