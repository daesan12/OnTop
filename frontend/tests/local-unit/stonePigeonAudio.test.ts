import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StonePigeonAudio } from '../../src/game/stone-rumble/stonePigeonAudio'
import type { StoneCue } from '../../src/game/stone-rumble/feedback'

const audio = vi.hoisted(() => ({ output: null as unknown, settings: { muted: false, volume: 60 }, load: vi.fn(), duck: vi.fn() }))
vi.mock('../../src/audio/bgm', () => ({ effectsOutput: () => audio.output, loadSound: (...args: unknown[]) => audio.load(...args),
  useSfxSettings: { getState: () => audio.settings }, duckBgm: audio.duck }))
vi.mock('../../src/game/stone-rumble/stonePalette', () => ({
  STONE_PALETTE: { step: .2, crack: .34, fire: .3, hit: .24 }, loadStonePalette: (...args: unknown[]) => audio.load(...args),
}))

function parameter() { return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } }
function node() { const value = { disconnect: vi.fn(), connect: vi.fn() }; value.connect.mockImplementation(() => value); return value }
function context() {
  const sources: ReturnType<typeof source>[] = []
  function source() { return { ...node(), context: ctx, buffer: null, playbackRate: { value: 1 }, onended: null as null | (() => void), start: vi.fn(), stop: vi.fn() } }
  const ctx = { sampleRate: 48000, state: 'running', currentTime: 2, createBufferSource: () => { const value = source(); sources.push(value); return value },
    createGain: () => ({ ...node(), gain: parameter() }), createStereoPanner: () => ({ ...node(), pan: { value: 0 } }),
    createWaveShaper: vi.fn(() => ({ ...node(), context: ctx, curve: null as Float32Array | null })),
    createBuffer: vi.fn((_channels: number, length: number, rate: number) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) })) }
  return { ctx, sources }
}
const listener = { userId: '101', x: 0, y: 24, z: 0 }
const cue = (kind: 'fire' | 'hit' = 'hit', userId = '101'): StoneCue => ({ kind, userId, x: 0, y: 24.8, z: 0, at: 10000 })
beforeEach(() => { audio.settings = { muted: false, volume: 60 }; audio.output = null; audio.duck.mockReset(); audio.load.mockReset().mockResolvedValue({ duration: 4.45 }) })
afterEach(() => vi.restoreAllMocks())

it.each(['locked', 'muted', 'zero', 'far'])('잠긴 오디오·음소거·볼륨0·먼 사건은 재생 노드를 만들지 않는다: %s', async mode => {
  const { ctx, sources } = context()
  audio.output = mode === 'locked' ? null : { context: ctx, bus: node() }
  audio.settings.muted = mode === 'muted'; audio.settings.volume = mode === 'zero' ? 0 : 60
  await new StonePigeonAudio().play({ ...cue(), x: mode === 'far' ? 30 : 0 }, listener)
  expect(sources).toHaveLength(0)
})
it('핵심 네 효과음을 준비하고 돌탑 전용 발사·피격 파일을 지연 없이 처음부터 재생한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio()
  player.prepare(); await player.play(cue('fire'), listener); await player.play(cue(), listener)
  for (const kind of ['step', 'crack', 'fire', 'hit']) expect(audio.load).toHaveBeenCalledWith(ctx, kind)
  expect(sources[0]!.start).toHaveBeenCalledWith(2, 0, .3)
  expect(sources[0]!.stop).toHaveBeenCalledWith(2.3)
  expect(sources[1]!.start).toHaveBeenCalledWith(2, 0, .24)
  expect(ctx.createBuffer).toHaveBeenCalledTimes(5)
})
it('점프는 기존 move-jump 원본 전체를 같은 속도로 재생하고 음악 파일은 준비하지 않는다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio(); player.prepare()
  await player.play({ ...cue(), kind: 'jump' }, listener)
  expect(audio.load).toHaveBeenCalledWith(ctx, 'move-jump')
  expect(audio.load).not.toHaveBeenCalledWith(ctx, 'stone-rumble')
  expect(sources[0]!.start).toHaveBeenCalledWith(2, 0, 4.45)
  expect(sources[0]!.playbackRate.value).toBe(1)
  expect(audio.duck).not.toHaveBeenCalled()
})
it('8인 동시 소리는 최대6음성이며 본인 피격은 다른 사람의 소리를 교체한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio()
  for (let i = 0; i < 8; i++) await player.play(cue('hit', String(i)), listener)
  expect(sources).toHaveLength(6)
  await player.play(cue(), listener)
  expect(sources).toHaveLength(7); expect(sources[0]!.stop).toHaveBeenLastCalledWith()
  sources[0]!.onended?.()
  expect(sources[0]!.disconnect).toHaveBeenCalledOnce()
})
it('종료·복구·탭 숨김 뒤에 완료된 비동기 소리를 뒤늦게 재생하지 않는다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  let resolve!: (buffer: object) => void
  audio.load.mockImplementation(() => new Promise(done => { resolve = done }))
  const player = new StonePigeonAudio(), pending = player.play(cue('fire'), listener)
  player.stop(); resolve({ duration: 4.45 }); await pending
  expect(sources).toHaveLength(0)
})
it('버퍼 재생이 오래 지연되면 생략한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  let time = 0; vi.spyOn(performance, 'now').mockImplementation(() => time)
  audio.load.mockImplementation(async () => { time = 500; return { duration: 4.45 } })
  await new StonePigeonAudio().play(cue('fire'), listener)
  expect(sources).toHaveLength(0)
})
it('버퍼 로딩 중 음소거되면 나중에 파일이 준비돼도 재생하지 않는다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  let resolve!: (buffer: object) => void
  audio.load.mockImplementation(() => new Promise(done => { resolve = done }))
  const pending = new StonePigeonAudio().play(cue('fire'), listener)
  audio.settings.muted = true; resolve({ duration: 4.45 }); await pending
  expect(sources).toHaveLength(0)
})
it('재생 중 멈추면 감쇠·종료를 예약하고 모든 노드를 분리한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio(); await player.play(cue(), listener)
  player.stop()
  expect(sources[0]!.stop).toHaveBeenLastCalledWith(2.02)
  sources[0]!.onended?.(); expect(sources[0]!.disconnect).toHaveBeenCalledOnce()
})
it('비둘기 전용 피크 제한기는 여러 소리가 공유하고 마지막 페이드가 끝난 뒤 분리한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio(); await player.play(cue(), listener); await player.play(cue('fire'), listener)
  expect(ctx.createWaveShaper).toHaveBeenCalledOnce()
  const mix = ctx.createWaveShaper.mock.results[0]!.value
  expect(mix.curve![1024]).toBe(0); expect(mix.curve![1536]).toBe(.5)
  expect(Math.max(...mix.curve!)).toBeLessThan(.7); expect(Math.min(...mix.curve!)).toBeGreaterThan(-.7)
  player.stop(); expect(mix.disconnect).not.toHaveBeenCalled()
  sources[0]!.onended?.(); expect(mix.disconnect).not.toHaveBeenCalled()
  sources[1]!.onended?.(); expect(mix.disconnect).toHaveBeenCalledOnce()
})
it('종료 뒤 새 소리가 시작돼도 이전 제한기만 해제한다', async () => {
  const { ctx, sources } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio(); await player.play(cue(), listener); player.stop()
  await player.play(cue(), listener)
  const [oldMix, newMix] = ctx.createWaveShaper.mock.results.map(result => result.value)
  sources[0]!.onended?.()
  expect(oldMix.disconnect).toHaveBeenCalledOnce(); expect(newMix.disconnect).not.toHaveBeenCalled()
  player.stop(); sources[1]!.onended?.(); expect(newMix.disconnect).toHaveBeenCalledOnce()
})
it('본인 공격·피격은 음악만 낮추고 먼 사람의 소리·무음·거절된 소리는 음악을 건드리지 않는다', async () => {
  const { ctx } = context(); audio.output = { context: ctx, bus: node() }
  const player = new StonePigeonAudio()
  await player.play(cue('fire'), listener); await player.play(cue(), listener)
  expect(audio.duck).toHaveBeenCalledTimes(2)
  expect(audio.duck).toHaveBeenNthCalledWith(1, .38, .85)
  expect(audio.duck).toHaveBeenNthCalledWith(2, .32, .5)
  await player.play({ ...cue(), kind: 'step' }, listener)
  await player.play({ ...cue(), kind: 'crack' }, listener)
  await player.play(cue('hit', '202'), listener)
  audio.settings.muted = true; await player.play(cue(), listener)
  expect(audio.duck).toHaveBeenCalledTimes(2)
})
