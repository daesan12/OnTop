import type { JumpHit } from '../../layout-preview/jumpSimulation'
let noise: AudioBuffer | undefined, voices = 0, lastVariant = -1
/** Ports the accepted preview's synthesis into the existing service effects bus. No new sound assets. */
export function playJumpSound(hit: JumpHit, options: { output: { context: AudioContext; bus: AudioNode }; remote?: boolean; level?: number; pan?: number }) {
  const { context: ctx, bus } = options.output
  if (document.hidden || ctx.state !== 'running' || voices >= 6 || (options.level ?? 1) <= 0) return
  const t = ctx.currentTime, theme = hit.pad.theme, variant = (lastVariant + 1 + Math.floor(Math.random() * 4)) % 5
  lastVariant = variant
  if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const data = noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1 }
  voices++; setTimeout(() => voices--, 650)
  const frequencies = { stone: 210, gomoku: hit.pad.ordinal % 2 ? 190 : 620, fish: 380, cloud: 170, lantern: 760, kite: 480, lily: 130, gate: 990 }
  const base = frequencies[theme] * (.95 + variant * .025)
  for (let layer = 0; layer < 3; layer++) {
    if (hit.kind === 'leave' && layer !== 2 || options.remote && layer !== 1) continue
    const at = t + [0, .015, .09][layer]!, duration = layer === 2 ? .3 : theme === 'cloud' ? .25 : .13
    const gain = ctx.createGain(), pan = ctx.createStereoPanner()
    pan.pan.value = options.pan ?? 0; gain.connect(pan); pan.connect(bus)
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime([.045, .085, .027][layer]! * (options.level ?? 1), at + .004); gain.gain.exponentialRampToValueAtTime(.0001, at + duration)
    const clean = () => { gain.disconnect(); pan.disconnect() }
    if (['stone', 'fish', 'kite'].includes(theme) && layer !== 0) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(); source.buffer = noise
      filter.type = 'bandpass'; filter.frequency.value = theme === 'kite' ? 2800 : theme === 'fish' ? 1350 : 850; filter.Q.value = .7
      source.connect(filter); filter.connect(gain); source.start(at, variant * .06, duration)
      source.onended = () => { source.disconnect(); filter.disconnect(); clean() }
    } else {
      const osc = ctx.createOscillator(); osc.type = theme === 'gomoku' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(base * (layer === 2 ? 1.5 : 1), at); osc.frequency.exponentialRampToValueAtTime(Math.max(50, base * (theme === 'cloud' ? 1.45 : .5)), at + duration)
      osc.connect(gain); osc.start(at); osc.stop(at + duration + .02); osc.onended = () => { osc.disconnect(); clean() }
    }
  }
}
