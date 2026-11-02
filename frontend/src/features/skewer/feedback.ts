import { currentCard, transitionText } from './game'
import type { GameState } from './game'

/** Small synthesized tabletop cues. No external audio or automatic playback. */
export class SkewerFeedback {
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private previous: GameState | null = null
  private muted = false
  private disposed = false

  unlock(): void {
    if (this.disposed) return
    try {
      if (!this.context && typeof AudioContext !== 'undefined') {
        this.context = new AudioContext()
        this.output = this.context.createGain()
        this.output.gain.value = this.muted ? 0 : 0.12
        this.output.connect(this.context.destination)
      }
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined)
    } catch { /* Audio is optional; unavailable output must not block play. */ }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.context && this.output) this.output.gain.setTargetAtTime(muted ? 0 : 0.12, this.context.currentTime, 0.015)
  }

  private note(frequency: number, duration: number, delay = 0, volume = 0.45, type: OscillatorType = 'sine'): void {
    if (!this.context || !this.output || this.muted || this.disposed) return
    const when = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, when)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, when + duration)
    envelope.gain.setValueAtTime(0.0001, when)
    envelope.gain.exponentialRampToValueAtTime(volume, when + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    oscillator.connect(envelope)
    envelope.connect(this.output)
    oscillator.start(when)
    oscillator.stop(when + duration + 0.01)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
  }

  update(state: GameState): void {
    const previous = this.previous
    this.previous = state
    if (!previous) return
    const transition = transitionText(state)
    if (state.phase === 'countdown' && transition !== transitionText(previous)) this.note(transition === '시작!' ? 1040 : 620, 0.12, 0, 0.25, 'triangle')
    if (state.phase === 'ending' && previous.phase !== 'ending') {
      this.note(830, 0.18, 0, 0.3, 'triangle')
      this.note(660, 0.25, 0.14, 0.25, 'triangle')
    }
    if (state.phase === 'result' && previous.phase !== 'result') {
      if (state.feedback === 'success') {
        this.note(660, 0.16, 0, 0.3, 'triangle')
        this.note(830, 0.18, 0.07, 0.3, 'triangle')
        this.note(990, 0.25, 0.14, 0.25, 'triangle')
      } else this.note(165, 0.19, 0, 0.3, 'triangle')
    } else if (state.skewer.length > previous.skewer.length) this.note(850, 0.065, 0, 0.45, 'triangle')
    else if (state.skewer.length < previous.skewer.length) this.note(510, 0.07, 0, 0.3, 'triangle')
    else if (state.pending && state.pending !== previous.pending) this.note(1200, 0.035, 0, 0.16)
    else if (state.phase === 'playing' && state.cardIndex !== previous.cardIndex) {
      this.note(currentCard(state).kind === 'greeting' ? 1400 : 700, 0.12, 0, 0.25)
    }
    const seconds = Math.ceil(state.remainingMs / 1000)
    if (state.phase === 'playing' && seconds > 0 && seconds <= 5 && seconds !== Math.ceil(previous.remainingMs / 1000)) {
      this.note(620, 0.04, 0, 0.18)
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.context) void this.context.close().catch(() => undefined)
  }
}
