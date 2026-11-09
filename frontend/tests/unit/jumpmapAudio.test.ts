import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { COURSE } from '../../src/features/jumpmap/course'
import type { JumpHit } from '../../src/layout-preview/jumpSimulation'
import type { JumpTheme } from '../../src/layout-preview/jumpCourse'

const hit = (theme: JumpTheme, ordinal = 0, kind: JumpHit['kind'] = 'land'): JumpHit =>
  ({ id: 1, pad: { ...COURSE.find(p => p.theme === theme)!, ordinal }, time: 0, kind })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
const connection = () => ({ connect: vi.fn(), disconnect: vi.fn() })
function makeAudio() {
  const sources: ReturnType<typeof source>[] = [], gains: ReturnType<typeof gain>[] = [], pans: ReturnType<typeof pan>[] = []
  function source() { return { ...connection(), buffer: null as AudioBuffer | null, playbackRate: { value: 1 }, loop: false, start: vi.fn(), stop: vi.fn(), onended: undefined as (() => void) | undefined } }
  function gain() { return { ...connection(), gain: param() } }
  function pan() { return { ...connection(), pan: param() } }
  const audio = {
    state: 'running', currentTime: 2,
    decodeAudioData: vi.fn(async () => ({ duration: .4 } as AudioBuffer)),
    createBufferSource: vi.fn(() => { const node = source(); sources.push(node); return node }),
    createGain: vi.fn(() => { const node = gain(); gains.push(node); return node }),
    createStereoPanner: vi.fn(() => { const node = pan(); pans.push(node); return node }),
    createOscillator: vi.fn(() => ({ ...connection(), type: 'sine', frequency: param(), start: vi.fn(), stop: vi.fn(), onended: undefined as (() => void) | undefined })),
  }
  return { audio, context: audio as unknown as AudioContext, sources, gains, pans, bus: connection() as unknown as AudioNode }
}

let now = 1000
const fetcher = vi.fn(async () => response())
beforeEach(() => {
  vi.resetModules(); fetcher.mockReset(); fetcher.mockImplementation(async () => response())
  vi.stubGlobal('document', { hidden: false }); vi.stubGlobal('fetch', fetcher)
  now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('approved jumpmap landing audio', () => {
  it('VR 도약·바닥 착지는 기존 클립을 한 번만 준비하고 전달받은 효과음 버스를 사용한다', async () => {
    const { preloadJumpMotionSounds, playJumpMotionSound } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio()
    await preloadJumpMotionSounds(a.context); await preloadJumpMotionSounds(a.context)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenNthCalledWith(1, '/audio/bgm/move-jump.ogg')
    expect(fetcher).toHaveBeenNthCalledWith(2, '/audio/bgm/move-land.ogg')
    playJumpMotionSound('jump', { output: a }); playJumpMotionSound('land', { output: a }); await flush()
    expect(a.sources).toHaveLength(2)
    expect(a.gains.map(g => g.gain.value)).toEqual([.18, .35])
    expect(a.pans.every(p => p.connect.mock.calls[0]?.[0] === a.bus)).toBe(true)
  })

  it('VR 종료 후 늦게 디코딩된 도약음은 재생하지 않는다', async () => {
    const { playJumpMotionSound } = await import('../../src/features/jumpmap/audio')
    let resolve!: (value: ReturnType<typeof response>) => void
    fetcher.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const a = makeAudio(), abort = new AbortController()
    playJumpMotionSound('jump', { output: a, signal: abort.signal }); abort.abort()
    resolve(response()); await flush()
    expect(a.sources).toHaveLength(0)
  })

  it('VR 안내·종료 시 이미 재생 중인 체크포인트 차임도 취소한다', async () => {
    vi.useFakeTimers()
    const { playJumpSound } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio(), abort = new AbortController()
    playJumpSound(hit('gate'), { output: a, signal: abort.signal })
    abort.abort()
    for (const result of a.audio.createOscillator.mock.results) {
      expect(result.value.stop).toHaveBeenCalledTimes(2)
      expect(result.value.disconnect).toHaveBeenCalledTimes(1)
    }
    await vi.advanceTimersByTimeAsync(650)
  })

  it('ships all eight exact approved PCM files with the final selected durations', async () => {
    const { JUMP_LANDING_FILES } = await import('../../src/features/jumpmap/audio')
    const selected = JSON.parse(readFileSync(new URL('../../public/audio/jumpmap/selection.json', import.meta.url), 'utf8')) as {
      sounds: { sound: keyof typeof JUMP_LANDING_FILES; file: string; duration: number; sha256: string; sourceClip: string; sourceStartSeconds: number }[]
    }
    expect(selected.sounds).toHaveLength(8)
    expect(selected.sounds.map(s => s.file).sort()).toEqual(Object.values(JUMP_LANDING_FILES).sort())
    const expected = { stone: .35, 'gomoku-black': .4, 'gomoku-white': .4, fish: .12, cloud: .25, lantern: .12, kite: .2, lily: .15 }
    for (const s of selected.sounds) {
      expect(JUMP_LANDING_FILES[s.sound]).toBe(s.file)
      expect(s.duration).toBe(expected[s.sound])
      const bytes = readFileSync(new URL('../../public/audio/jumpmap/' + s.file, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(s.sha256)
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
      expect(bytes.readUInt16LE(20)).toBe(1) // PCM
      expect(bytes.readUInt16LE(22)).toBe(1) // mono
      expect(bytes.readUInt32LE(24)).toBe(48000)
      expect(bytes.readUInt16LE(34)).toBe(16)
      expect(bytes.readUInt32LE(40) / 2).toBe(Math.round(s.duration * 48000))
    }
    expect(selected.sounds.find(s => s.sound === 'stone')?.sourceStartSeconds).toBe(1.982)
    expect(selected.sounds.find(s => s.sound === 'kite')?.sourceStartSeconds).toBe(0)
    expect(selected.sounds.find(s => s.sound === 'gomoku-black')?.sourceClip).toBe('ASMR_R4_03_squishy_slime_A_target0.40s')
    expect(selected.sounds.find(s => s.sound === 'gomoku-white')?.sourceClip).toBe('ASMR_R4_03_squishy_slime_B_target0.40s')
  })

  it('matches the actual odd black/even white material assignment across the course', async () => {
    const { landingSoundForPad } = await import('../../src/features/jumpmap/audio')
    for (const pad of COURSE.filter(p => p.theme === 'gomoku'))
      expect(landingSoundForPad(pad)).toBe(pad.ordinal % 2 ? 'gomoku-black' : 'gomoku-white')
    expect(landingSoundForPad(hit('fish').pad)).toBe('fish')
    expect(landingSoundForPad(hit('lily').pad)).toBe('lily')
    expect(landingSoundForPad(hit('gate').pad)).toBeNull()
  })

  it('preloads in parallel once per context and reuses the decoded buffer on repeated landings', async () => {
    const { preloadJumpSounds, playJumpSound } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio(), b = makeAudio()
    await Promise.all([preloadJumpSounds(a.context), preloadJumpSounds(a.context)])
    expect(fetcher).toHaveBeenCalledTimes(8)
    expect(a.audio.decodeAudioData).toHaveBeenCalledTimes(8)
    playJumpSound(hit('stone'), { output: a }); playJumpSound(hit('stone'), { output: a }); await flush()
    expect(fetcher).toHaveBeenCalledTimes(8)
    expect(a.sources).toHaveLength(2)
    expect(a.sources[0]!.buffer).toBe(a.sources[1]!.buffer)
    await preloadJumpSounds(b.context)
    expect(fetcher).toHaveBeenCalledTimes(16)
  })

  it('plays one unpitched file through the existing effects bus with caller level and pan', async () => {
    const { playJumpSound, preloadJumpSounds } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio(); await preloadJumpSounds(a.context)
    playJumpSound(hit('gomoku', 1), { output: a, remote: true, level: .3, pan: -2 }); await flush()
    expect(a.sources).toHaveLength(1)
    expect(a.sources[0]!.playbackRate.value).toBe(1)
    expect(a.sources[0]!.loop).toBe(false)
    expect(a.sources[0]!.start).toHaveBeenCalledWith(2)
    expect(a.gains[0]!.gain.value).toBeCloseTo(.45 * .3)
    expect(a.pans[0]!.pan.value).toBe(-1)
    expect(a.pans[0]!.connect).toHaveBeenCalledWith(a.bus)
    expect(a.audio.createOscillator).not.toHaveBeenCalled()
  })

  it('skips kite takeoff, hidden pages, suspended contexts, zero level and aborted scopes', async () => {
    const { playJumpSound } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio()
    playJumpSound(hit('kite', 0, 'leave'), { output: a })
    vi.stubGlobal('document', { hidden: true }); playJumpSound(hit('stone'), { output: a })
    vi.stubGlobal('document', { hidden: false }); a.audio.state = 'suspended'; playJumpSound(hit('stone'), { output: a })
    a.audio.state = 'running'; playJumpSound(hit('stone'), { output: a, level: 0 })
    const abort = new AbortController(); abort.abort(); playJumpSound(hit('stone'), { output: a, signal: abort.signal })
    expect(fetcher).not.toHaveBeenCalled(); expect(a.sources).toHaveLength(0)
  })

  it.each(['abort', 'stale'] as const)('never replays an old landing after a slow load (%s)', async mode => {
    const { playJumpSound } = await import('../../src/features/jumpmap/audio')
    let resolve!: (value: ReturnType<typeof response>) => void
    fetcher.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const a = makeAudio(), abort = new AbortController()
    playJumpSound(hit('stone'), { output: a, signal: abort.signal })
    if (mode === 'abort') abort.abort(); else now += 151
    resolve(response()); await flush()
    expect(a.sources).toHaveLength(0)
    playJumpSound(hit('stone'), { output: a }); await flush()
    expect(a.sources).toHaveLength(1)
  })

  it('bounds overlaps at six voices and releases the slot when a sample ends', async () => {
    const { playJumpSound, preloadJumpSounds } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio(); await preloadJumpSounds(a.context)
    for (let i = 0; i < 7; i++) playJumpSound(hit('stone'), { output: a })
    await flush(); expect(a.sources).toHaveLength(6)
    a.sources[0]!.onended!()
    expect(a.sources[0]!.disconnect).toHaveBeenCalled()
    playJumpSound(hit('stone'), { output: a }); await flush(); expect(a.sources).toHaveLength(7)
  })

  it('caches a missing asset silently and releases pending voice slots', async () => {
    const { playJumpSound } = await import('../../src/features/jumpmap/audio')
    fetcher.mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
    const a = makeAudio()
    for (let i = 0; i < 6; i++) playJumpSound(hit('stone'), { output: a })
    await flush(); expect(a.sources).toHaveLength(0); expect(fetcher).toHaveBeenCalledTimes(1)
    playJumpSound(hit('stone'), { output: a }); await flush(); expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValue(response())
    playJumpSound(hit('cloud'), { output: a }); await flush(); expect(a.sources).toHaveLength(1)
  })

  it.each(['timeout', 'abort'] as const)('releases voices once if ended never arrives (%s)', async mode => {
    vi.useFakeTimers()
    const { playJumpSound, preloadJumpSounds } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio(), abort = new AbortController(); await preloadJumpSounds(a.context)
    for (let i = 0; i < 6; i++) playJumpSound(hit('stone'), { output: a, signal: abort.signal })
    await flush(); expect(a.sources).toHaveLength(6)
    a.audio.state = 'suspended'
    if (mode === 'abort') abort.abort(); else await vi.advanceTimersByTimeAsync(500)
    for (const source of a.sources) {
      expect(source.stop).toHaveBeenCalledTimes(1)
      expect(source.disconnect).toHaveBeenCalledTimes(1)
      source.onended!() // A late event cannot return a voice twice.
    }
    await vi.advanceTimersByTimeAsync(500)
    a.audio.state = 'running'
    for (let i = 0; i < 7; i++) playJumpSound(hit('stone'), { output: a })
    await flush(); expect(a.sources).toHaveLength(12)
  })

  it('keeps the existing gate chime layers, including the remote single-layer cue', async () => {
    vi.useFakeTimers()
    const { playJumpSound } = await import('../../src/features/jumpmap/audio')
    const a = makeAudio()
    playJumpSound(hit('gate'), { output: a })
    expect(a.audio.createOscillator).toHaveBeenCalledTimes(3)
    playJumpSound(hit('gate'), { output: a, remote: true })
    expect(a.audio.createOscillator).toHaveBeenCalledTimes(4)
    expect(fetcher).not.toHaveBeenCalled(); expect(a.sources).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(650)
  })
})
