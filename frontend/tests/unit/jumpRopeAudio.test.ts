import { afterEach, describe, expect, it } from 'vitest'
import { setBgmSettings } from '../../src/audio/bgm'
import { JumpRopeAudio, jumpRopeBgm, jumpRopeSfx, maxJumpRopeVoices, type AudioLogEntry, type AudioOutput } from '../../src/jump-rope-preview/jumpRopeAudio'
import type { JumpRopeSfx } from '../../src/jump-rope-preview/jumpRopeAudioCues'

/** A small Web Audio stand-in: it records connections and scheduled gain changes, and never makes a sound. */
class Param {
  events: [kind: string, value: number, at: number][] = []
  constructor(public value: number) {}
  setValueAtTime(value: number, at: number) { this.events.push(['set', value, at]); this.value = value; return this }
  linearRampToValueAtTime(value: number, at: number) { this.events.push(['ramp', value, at]); return this }
  setTargetAtTime(value: number, at: number) { this.events.push(['target', value, at]); return this }
  cancelScheduledValues(at: number) { this.events.push(['cancel', 0, at]); return this }
}
class Node {
  outputs: Node[] = []
  constructor(readonly context: Context) {}
  connect<T extends Node>(node: T) { this.outputs.push(node); return node }
  disconnect() { this.outputs = [] }
}
class Gain extends Node { gain = new Param(1) }
class Source extends Node {
  buffer: { duration: number } | null = null
  loop = false
  onended: (() => void) | null = null
  started: [when: number, offset?: number] | null = null
  stoppedAt: number | null = null
  start(when = 0, offset?: number) { this.started = [when, offset] }
  stop(when = 0) { this.stoppedAt = when }
}
class Context {
  currentTime = 0
  state = 'running'
  destination = new Node(this)
  sources: Source[] = []
  createGain() { return new Gain(this) }
  createBufferSource() {
    const source = new Source(this)
    this.sources.push(source)
    return source
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** `hold` keeps every clip loading until the test resolves it, like a slow first fetch. */
function rig({ locked = false, missing = [] as string[], hold: holding = false } = {}) {
  const context = new Context()
  const bus = new Gain(context)
  const loads: string[] = []
  const pending = new Map<string, (buffer: { duration: number } | null) => void>()
  let hold = holding
  const durations: Record<string, number> = { [jumpRopeBgm.file]: 26.952, 'sfx/grandpa_enter_voice.ogg': 2.351, 'sfx/pigeon_miss_laugh.ogg': 2 }
  const state = { locked }
  const output = () => state.locked ? null : { context, bus } as unknown as AudioOutput
  const audio = new JumpRopeAudio(output, (_context, file) => {
    loads.push(file)
    if (missing.includes(file)) return Promise.resolve(null)
    const buffer = { duration: durations[file] ?? 0.6 }
    if (!hold) return Promise.resolve(buffer as AudioBuffer)
    return new Promise(resolve => pending.set(file, value => resolve(value as AudioBuffer | null)))
  })
  const log: AudioLogEntry[] = []
  audio.subscribe(entry => log.push(entry))
  const voices = () => context.sources.filter(source => !source.loop && source.started && source.stoppedAt === null)
  return {
    audio, context, bus, loads, log, state, voices,
    holdLoads(on: boolean) { hold = on },
    resolve(file: string) { pending.get(file)!({ duration: durations[file] ?? 0.6 }) },
    events: (sound: JumpRopeSfx | 'bgm') => log.filter(entry => entry.sound === sound).map(entry => entry.reason ? `${entry.event}:${entry.reason}` : entry.event),
  }
}

afterEach(() => setBgmSettings({ volume: 50, muted: false }))

describe('jump rope audio mixer', () => {
  it('오디오가 잠겨 있으면 건너뛰고, 열리면 12개 파일을 한 번씩 미리 불러와 효과음 bus로 재생한다', async () => {
    const r = rig({ locked: true })
    r.audio.play('countdownTick')
    r.audio.setBgm('on')
    await flush()
    expect(r.events('countdownTick')).toEqual(['skip:locked'])
    expect(r.context.sources).toHaveLength(0)

    r.state.locked = false
    r.audio.play('countdownTick')
    await flush()
    expect(new Set(r.loads)).toEqual(new Set([jumpRopeBgm.file, ...Object.values(jumpRopeSfx).map(spec => spec.file)]))
    expect(new Set(r.loads).size).toBe(12)
    expect(r.events('countdownTick')).toEqual(['skip:locked', 'play'])
    const [tick] = r.voices()
    const gain = tick!.outputs[0] as Gain
    expect(gain.gain.value).toBe(jumpRopeSfx.countdownTick.level)
    // Effects pass the jump rope effects channel, then the shared bus with the player's 효과음 setting.
    expect(gain.outputs[0]!.outputs[0]).toBe(r.bus)
    expect(tick!.started).toEqual([0, 0])
    // The broom hit skips its near-silent lead-in, so the whack sounds with the stun.
    r.audio.play('broomHit')
    await flush()
    expect(r.context.sources.at(-1)!.started).toEqual([0, jumpRopeSfx.broomHit.offsetS])
    expect(jumpRopeSfx.broomHit.offsetS).toBe(0.22)
  })

  it('같은 소리는 겹치지 않게 앞 소리를 줄이거나 버리고, 다른 소리는 최대 6개까지 함께 낸다', async () => {
    const r = rig()
    r.audio.play('missLaugh')
    await flush()
    r.context.currentTime = 1.95
    r.audio.play('missLaugh')
    await flush()
    const laughs = r.context.sources.filter(source => source.started)
    expect(laughs).toHaveLength(2)
    // The first laugh fades out over 60 ms instead of stacking under the new one.
    expect(laughs[0]!.stoppedAt).toBeCloseTo(2.01, 6)
    expect(laughs[1]!.stoppedAt).toBeNull()

    // Two flights starting together flutter once; one 350 ms later restarts the flutter.
    r.audio.play('pigeonFlap')
    r.audio.play('pigeonFlap')
    await flush()
    expect(r.events('pigeonFlap')).toEqual(['play', 'skip:throttled'])
    r.context.currentTime = 2.3
    r.audio.play('pigeonFlap')
    await flush()
    expect(r.events('pigeonFlap')).toEqual(['play', 'skip:throttled', 'play'])

    r.audio.play('victory')
    r.audio.play('victory')
    await flush()
    expect(r.events('victory')).toEqual(['play', 'skip:playing'])
    // A kept sound also drops a repeat while its clip is still on its first fetch.
    const slow = rig({ hold: true })
    slow.audio.play('victory')
    slow.audio.play('victory')
    slow.resolve('sfx/victory_fanfare.ogg')
    await flush()
    expect(slow.events('victory')).toEqual(['skip:playing', 'play'])

    for (const sound of ['countdownTick', 'gameGo', 'broomWindup', 'broomSwing', 'broomHit', 'poopSplat'] as const) r.audio.play(sound)
    await flush()
    expect(r.voices().length).toBe(maxJumpRopeVoices)
  })

  it('게임 오버는 남은 비웃음을 줄이고, 늦게 로딩되거나 없는 파일은 조용히 건너뛴다', async () => {
    const r = rig({ missing: ['sfx/broom_hit.ogg'] })
    r.audio.play('missLaugh')
    await flush()
    r.audio.play('gameOver')
    await flush()
    const [laugh, sting] = r.context.sources.filter(source => source.started)
    expect(laugh!.stoppedAt).not.toBeNull()
    expect(sting!.stoppedAt).toBeNull()

    r.audio.play('broomHit')
    await flush()
    expect(r.events('broomHit')).toEqual(['skip:missing'])

    // A clip still on its first fetch starts only if it arrives within 150 ms.
    const slow = rig({ hold: true })
    slow.audio.play('poopSplat')
    slow.context.currentTime += 0.2
    slow.resolve('sfx/pigeon_poop_splat.ogg')
    slow.audio.play('countdownTick')
    slow.context.currentTime += 0.1
    slow.resolve('sfx/countdown_tick.ogg')
    await flush()
    expect(slow.events('poopSplat')).toEqual(['skip:late'])
    expect(slow.events('countdownTick')).toEqual(['play'])
  })

  it('미리 디코딩된 소리는 같은 프레임의 무거운 작업을 기다리지 않고 요청 즉시 시작한다', async () => {
    const r = rig()
    await flush()
    r.audio.play('grandpaEnter')
    // No await: the source has already started inside play().
    expect(r.events('grandpaEnter')).toEqual(['play'])
    expect(r.voices()).toHaveLength(1)
    r.audio.setBgm('on')
    expect(r.events('bgm')).toEqual(['duck', 'play'])
  })

  it('할아버지 보이스 동안 BGM을 낮췄다가 보이스가 끝나면 되돌린다', async () => {
    const r = rig()
    r.audio.setBgm('on')
    await flush()
    r.context.currentTime = 10
    r.audio.play('grandpaEnter')
    r.audio.play('grandpaEnter')
    await flush()
    expect(r.events('grandpaEnter').filter(event => event === 'play')).toHaveLength(1)
    expect(r.events('grandpaEnter')).toContain('skip:playing')
    const loop = r.context.sources.find(source => source.loop)!
    const duck = loop.outputs[0]!.outputs[0] as Gain
    expect(duck.gain.events.filter(([kind]) => kind !== 'cancel')).toEqual([
      ['set', 1, 10], ['ramp', jumpRopeBgm.duck, 10 + jumpRopeBgm.duckInS],
      ['set', jumpRopeBgm.duck, 10 + 2.351], ['ramp', 1, 10 + 2.351 + jumpRopeBgm.duckOutS],
    ])
    // Stopping the voice early (a reset) brings the loop straight back.
    r.audio.stopSfx()
    expect(duck.gain.events.at(-1)).toEqual(['ramp', 1, 10.2])
  })

  it('BGM은 반복 재생되고 일시정지는 위치를 기억하며 정지는 처음부터 다시 시작한다', async () => {
    const r = rig()
    r.audio.setBgm('on')
    r.audio.setBgm('on')
    await flush()
    const first = r.context.sources.filter(source => source.loop)
    expect(first).toHaveLength(1)
    expect(first[0]!.started).toEqual([0, 0])
    // Loop source → fade → duck → music level → speakers.
    const music = first[0]!.outputs[0]!.outputs[0]!.outputs[0] as Gain
    expect(music.outputs[0]).toBe(r.context.destination)
    expect(music.gain.events.at(-1)![1]).toBeCloseTo(0.25 * jumpRopeBgm.level, 9)
    setBgmSettings({ volume: 100 })
    expect(music.gain.events.at(-1)![1]).toBeCloseTo(jumpRopeBgm.level, 9)
    setBgmSettings({ muted: true })
    expect(music.gain.events.at(-1)![1]).toBe(0)

    r.context.currentTime = 5
    r.audio.setBgm('paused')
    expect(first[0]!.stoppedAt).toBeCloseTo(5 + jumpRopeBgm.pauseFadeS, 9)
    r.context.currentTime = 8
    r.audio.setBgm('on')
    await flush()
    const resumed = r.context.sources.filter(source => source.loop)[1]!
    expect(resumed.started![1]).toBeCloseTo(5, 9)
    r.context.currentTime = 9
    r.audio.setBgm('off')
    expect(resumed.stoppedAt).toBeCloseTo(9 + jumpRopeBgm.stopFadeS, 9)
    r.audio.setBgm('on')
    await flush()
    expect(r.context.sources.filter(source => source.loop)[2]!.started).toEqual([9, 0])
    expect(r.events('bgm')).toEqual(['play', 'pause', 'play', 'stop', 'play'])
  })

  it('확인창은 BGM 위치를 유지하고 효과음을 멈추며, 재시작·언마운트 후에는 늦게 온 소리도 시작하지 않는다', async () => {
    const r = rig()
    r.audio.setBgm('on')
    r.audio.play('broomSwing')
    await flush()
    r.context.currentTime = 3
    r.audio.hold()
    expect(r.events('bgm').at(-1)).toBe('pause')
    expect(r.voices()).toHaveLength(0)

    r.audio.resetRound()
    r.audio.setBgm('on')
    await flush()
    const loop = r.context.sources.filter(source => source.loop).at(-1)!
    expect(loop.started).toEqual([3, 0])
    r.audio.play('victory')
    r.audio.dispose()
    await flush()
    expect(loop.stoppedAt).not.toBeNull()
    expect(r.voices()).toHaveLength(0)
    r.audio.setBgm('on')
    expect(r.context.sources.filter(source => source.loop).at(-1)).toBe(loop)

    // Clips that finish their first fetch after a reset or an unmount never start.
    const slow = rig({ hold: true })
    slow.audio.play('broomWindup')
    slow.audio.resetRound()
    slow.resolve('sfx/broom_windup.ogg')
    await flush()
    slow.audio.play('victory')
    slow.audio.dispose()
    slow.resolve('sfx/victory_fanfare.ogg')
    await flush()
    expect(slow.events('broomWindup')).toEqual(['skip:cancelled'])
    expect(slow.voices()).toHaveLength(0)
  })
})
