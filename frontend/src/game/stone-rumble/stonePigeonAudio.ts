import { duckBgm, effectsOutput, loadSound, useSfxSettings } from '../../audio/bgm'
import { globalStoneCue, stoneCueDistance, type StoneCue, type StoneListener } from './feedback'
import { STONE_ACTION_DURATION, stoneActionBuffer } from './stoneActionSounds'
import { STONE_PALETTE, loadStonePalette, type StonePaletteKind } from './stonePalette'

interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan?: StereoPannerNode; important: boolean }
interface Mix { node: WaveShaperNode; bus: GainNode; voices: number }
const MAX_VOICES = 6
const LEVELS = { step: .55, crack: .8, jump: .18, fire: 1, hit: 1.2, cloud: .65, eliminated: .95, 'ring-warning': .65, collapse: 1.1, slide: 1.25 }
const PEAK_CURVE = Float32Array.from({ length: 2049 }, (_, i) => {
  const value = i / 1024 - 1, level = Math.abs(value)
  // 정규화한 BGM의 peak(<.3)와 합쳐도 여유가 남도록 큰 효과음 합산만 .7 아래로 제한한다.
  return level <= .5 ? value : Math.sign(value) * (.5 + .2 * Math.tanh((level - .5) / .2))
})

/** 공통 효과음 bus/음소거를 재사용하되 공원 월드 좌표의 리스너는 변경하지 않는다. */
export class StonePigeonAudio {
  private generation = 0
  private voices = new Set<Voice>()
  private mix?: Mix
  private output(context: AudioContext, bus: GainNode) {
    if (this.mix?.node.context === context && this.mix.bus === bus) return this.mix
    if (this.mix?.voices === 0) this.mix.node.disconnect()
    const node = context.createWaveShaper()
    // 돌탑 효과음만 제한한다. 동시 명중·붕괴·최대 볼륨에서의 합산 피크를 잡는다.
    node.curve = PEAK_CURVE
    node.connect(bus)
    return this.mix = { node, bus, voices: 0 }
  }
  prepare() {
    const output = effectsOutput()
    if (output) {
      for (const kind of Object.keys(STONE_ACTION_DURATION) as (keyof typeof STONE_ACTION_DURATION)[]) stoneActionBuffer(output.context, kind)
      for (const kind of Object.keys(STONE_PALETTE) as StonePaletteKind[]) void loadStonePalette(output.context, kind)
      void loadSound(output.context, 'move-jump')
    }
  }
  async play(cue: StoneCue, listener: StoneListener) {
    const settings = useSfxSettings.getState(), output = effectsOutput()
    const distance = stoneCueDistance(cue, listener)
    if (!output || settings.muted || settings.volume === 0 || distance >= 18) return
    const generation = this.generation, requestedAt = performance.now()
    const palette = cue.kind in STONE_PALETTE ? cue.kind as StonePaletteKind : undefined
    const buffer = cue.kind === 'jump' ? await loadSound(output.context, 'move-jump') : palette ? await loadStonePalette(output.context, palette)
      : stoneActionBuffer(output.context, cue.kind as keyof typeof STONE_ACTION_DURATION)
    if (!buffer || generation !== this.generation || performance.now() - requestedAt > 250
      || output.context.state !== 'running' || useSfxSettings.getState().muted || useSfxSettings.getState().volume === 0) return
    const important = cue.userId === listener.userId || globalStoneCue(cue)
    if (this.voices.size >= MAX_VOICES) {
      const quiet = important && [...this.voices].find(voice => !voice.important)
      if (!quiet) return
      quiet.source.stop(); this.voices.delete(quiet)
    }
    const { context, bus } = output, source = context.createBufferSource(), gain = context.createGain()
    const mix = this.output(context, bus)
    const pan = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : undefined
    const duration = cue.kind === 'jump' ? buffer.duration : palette ? STONE_PALETTE[palette] : STONE_ACTION_DURATION[cue.kind as keyof typeof STONE_ACTION_DURATION]
    // 반복되는 디딤/균열은 작은 음색 차이만 준다. 음량과 사건 시각은 그대로 유지한다.
    const rate = cue.kind === 'step' || cue.kind === 'crack' ? [ .96, 1, 1.04 ][Math.abs(Math.floor(cue.at / 20)) % 3]! : 1
    // 짧은 게임 신호가 기본 효과음 볼륨에서도 분명하도록 기존보다 약6dB 높인다.
    const level = LEVELS[cue.kind] * (important ? 1 : .55 * Math.max(0, 1 - distance / 18))
    source.buffer = buffer; source.playbackRate.value = rate
    const now = context.currentTime
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(level, now + .003)
    gain.gain.setValueAtTime(level, now + duration - .04); gain.gain.linearRampToValueAtTime(0, now + duration)
    source.connect(gain)
    if (pan) { pan.pan.value = globalStoneCue(cue) ? 0 : Math.max(-.8, Math.min(.8, (cue.x - listener.x) / 12)); gain.connect(pan).connect(mix.node) }
    else gain.connect(mix.node)
    const voice = { source, gain, pan, important }
    this.voices.add(voice)
    mix.voices++
    source.onended = () => {
      this.voices.delete(voice); source.disconnect(); gain.disconnect(); pan?.disconnect()
      if (--mix.voices === 0 && mix !== this.mix) mix.node.disconnect()
    }
    source.start(now, 0, Math.min(buffer.duration, duration * rate)); source.stop(now + duration)
    if (important && !['collapse', 'slide', 'step', 'crack', 'jump'].includes(cue.kind))
      duckBgm(duration + .08, cue.kind === 'eliminated' ? .3 : cue.kind === 'fire' ? .85 : .5)
  }
  stop() {
    this.generation++
    const mix = this.mix; this.mix = undefined
    if (mix?.voices === 0) mix.node.disconnect()
    for (const voice of this.voices) {
      const now = voice.source.context.currentTime
      voice.gain.gain.cancelScheduledValues(now)
      voice.gain.gain.setTargetAtTime(0, now, .005)
      voice.source.stop(now + .02)
    }
    this.voices.clear()
  }
}
