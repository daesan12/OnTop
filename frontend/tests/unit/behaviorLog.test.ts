import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ session: null as null | { status: 'AUTHENTICATED'; accessToken: string } }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session }))

import { metrics, recordFrame, resetMetrics } from '../../src/performance/metrics'
import {
  clearBehaviorQueue, flushBehavior, logBehavior, MAX_BATCH, queuedBehaviorCount, type ClientBehaviorEvent,
} from '../../src/features/behaviorLog/client'
import { createPerfSampler, deviceClass, gpuFamily } from '../../src/features/behaviorLog/perfReport'
import { watchWelcomeTour } from '../../src/features/behaviorLog/tourLog'
import { endWelcomeTour, useWelcomeTour } from '../../src/features/welcomeTour/state'

const step = (action: 'collapse' | 'resume' = 'collapse'): ClientBehaviorEvent => ({
  type: 'ONBOARDING_STEP', props: { flow: 'welcome_tour', action, replay: false, doneCount: 0, elapsedSec: 0 },
})

beforeEach(() => {
  clearBehaviorQueue()
  auth.session = { status: 'AUTHENTICATED', accessToken: 'access-1' }
})
afterEach(() => { vi.unstubAllGlobals(); endWelcomeTour(); resetMetrics() })

describe('클라이언트 행동 로그 전송', () => {
  it('모인 로그를 회원 토큰과 ageMs로 묶어 보낸다', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    logBehavior(step())

    await flushBehavior()

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/behavior-events')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
    const body = JSON.parse(String(init.body))
    expect(body.events).toHaveLength(1)
    expect(body.events[0]).toMatchObject({ type: 'ONBOARDING_STEP', props: { action: 'collapse' } })
    expect(body.events[0].ageMs).toBeGreaterThanOrEqual(0)
    expect(queuedBehaviorCount()).toBe(0)
  })

  it('한 번에 서버 한도만큼만 보내고 나머지는 남긴다', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    for (let i = 0; i < MAX_BATCH + 3; i++) logBehavior(step())

    await flushBehavior()

    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).events).toHaveLength(MAX_BATCH)
    expect(queuedBehaviorCount()).toBe(3)
  })

  it('토큰 만료·서버 오류·네트워크 실패면 다음에 다시 보내고 형식 오류면 버린다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    logBehavior(step())
    await flushBehavior()
    expect(queuedBehaviorCount()).toBe(1)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await flushBehavior()
    expect(queuedBehaviorCount()).toBe(1)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })))
    await flushBehavior()
    expect(queuedBehaviorCount()).toBe(0)
  })

  it('로그인 회원이 아니면 보내지 않고 큐를 비운다', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    logBehavior(step())
    auth.session = null

    await flushBehavior()

    expect(fetch).not.toHaveBeenCalled()
    expect(queuedBehaviorCount()).toBe(0)
  })

  it('페이지를 떠날 때는 keepalive로 보내고 기다리지 않는다', async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetch)
    logBehavior(step())

    await flushBehavior({ leaving: true })

    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].keepalive).toBe(true)
    expect(queuedBehaviorCount()).toBe(0)
  })

  it('주기 전송 중에 떠나면 보내던 묶음은 keepalive로 이어 가고 남은 것만 따로 보낸다', async () => {
    let answer: (response: Response) => void = () => undefined
    const fetch = vi.fn((_url: string, _init: RequestInit) => fetch.mock.calls.length === 1
      ? new Promise<Response>(resolve => { answer = resolve })
      : Promise.resolve(new Response('{}', { status: 202 })))
    vi.stubGlobal('fetch', fetch)
    for (let i = 0; i < MAX_BATCH + 2; i++) logBehavior(step(i < MAX_BATCH ? 'collapse' : 'resume'))

    const periodic = flushBehavior()
    await flushBehavior()
    await flushBehavior({ leaving: true })
    answer(new Response('{}', { status: 202 }))
    await periodic

    expect(fetch).toHaveBeenCalledTimes(2)
    const sent = fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)).events as { props: { action: string } }[])
    expect(fetch.mock.calls.every(([, init]) => init.keepalive === true)).toBe(true)
    expect(sent.map(events => events.length)).toEqual([MAX_BATCH, 2])
    expect(sent[1].every(event => event.props.action === 'resume')).toBe(true)
    expect(queuedBehaviorCount()).toBe(0)
  })

  it('큐가 넘치면 오래된 것부터 버린다', () => {
    for (let i = 0; i < 100; i++) logBehavior(step())
    expect(queuedBehaviorCount()).toBe(60)
  })
})

describe('성능 보고', () => {
  it('GPU 이름 원문 대신 제조사 분류만 남긴다', () => {
    expect(gpuFamily('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('nvidia')
    expect(gpuFamily('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('intel')
    expect(gpuFamily('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('amd')
    expect(gpuFamily('Apple GPU')).toBe('apple')
    expect(gpuFamily('Adreno (TM) 650')).toBe('adreno')
    expect(gpuFamily('Mali-G78')).toBe('mali')
    expect(gpuFamily('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('software')
    expect(gpuFamily('WebGL 2 (GPU name unavailable)')).toBe('unknown')
    expect(gpuFamily('Some New GPU')).toBe('other')
  })

  it('기기는 터치만 있는 경우만 mobile로 본다', () => {
    expect(deviceClass(q => q === '(pointer: coarse)')).toBe('mobile')
    expect(deviceClass(q => q === '(pointer: coarse)' || q === '(any-pointer: fine)')).toBe('desktop')
    expect(deviceClass(() => false)).toBe('desktop')
    expect(deviceClass(() => { throw new Error('no matchMedia') })).toBe('desktop')
  })

  it('지난 보고 뒤의 프레임과 느린 프레임을 세고 그린 프레임이 없으면 보내지 않는다', () => {
    resetMetrics()
    let now = 0
    Object.assign(metrics, { renderMode: 'continuous', drawCalls: 300, triangles: 120000, dpr: 1, renderer: 'Apple GPU' })
    const sample = createPerfSampler('low', 'desktop', () => now)
    for (let i = 0; i < 100; i++) recordFrame(i < 5 ? 80 : 16)
    now = 60_000

    const report = sample()

    expect(report).toMatchObject({ windowSec: 60, frames: 100, slowFrames: 5, quality: 'low', device: 'desktop',
      gpu: 'apple', renderMode: 'continuous', drawCalls: 300, dpr: 1 })
    expect(report).toMatchObject({ p95Ms: 16, p99Ms: 80 })
    now = 120_000
    expect(sample()).toBeNull()
  })

  it('측정이 초기화되면 초기화 뒤의 프레임만 센다', () => {
    resetMetrics()
    let now = 0
    for (let i = 0; i < 50; i++) recordFrame(16)
    const sample = createPerfSampler('low', 'desktop', () => now)
    resetMetrics()
    for (let i = 0; i < 10; i++) recordFrame(16)
    now = 30_000

    expect(sample()).toMatchObject({ frames: 10, slowFrames: 0, windowSec: 30 })
  })
})

describe('체험 투어 로그', () => {
  it('첫 입장 투어의 시작·비행·단계·접기·완료를 순서대로 남긴다', () => {
    const events: ClientBehaviorEvent[] = []
    let now = 0
    const stop = watchWelcomeTour(event => events.push(event), () => now)
    useWelcomeTour.setState({ phase: 'flight', owner: 's', done: [], walked: 0, collapsed: false })
    now = 6_000
    useWelcomeTour.setState({ phase: 'tour', done: [] })
    useWelcomeTour.setState({ done: ['walk'] })
    useWelcomeTour.setState({ collapsed: true })
    useWelcomeTour.setState({ collapsed: false })
    useWelcomeTour.setState({ done: ['walk', 'greet', 'map', 'minigame'] })
    now = 120_000
    useWelcomeTour.setState({ done: ['walk', 'greet', 'map', 'minigame', 'table'], phase: 'finished' })
    endWelcomeTour()
    stop()

    expect(events.map(e => e.type === 'ONBOARDING_STEP' ? [e.props.action, e.props.step] : [e.type]))
      .toEqual([['start', undefined], ['step_done', 'flight'], ['step_done', 'walk'], ['collapse', undefined],
        ['resume', undefined], ['step_done', 'greet'], ['step_done', 'map'], ['step_done', 'minigame'],
        ['step_done', 'table'], ['finish', undefined]])
    expect(events.at(-1)!.props).toMatchObject({ replay: false, doneCount: 5, elapsedSec: 120 })
  })

  it('다시 보기는 replay로, 마치기 전에 끝내면 하던 단계와 함께 abandon으로 남긴다', () => {
    const events: ClientBehaviorEvent[] = []
    const stop = watchWelcomeTour(event => events.push(event), () => 0)
    useWelcomeTour.setState({ phase: 'tour', owner: 's', done: [], walked: 0, collapsed: false })
    useWelcomeTour.setState({ done: ['walk'] })
    endWelcomeTour()
    stop()

    expect(events.map(e => e.props)).toEqual([
      expect.objectContaining({ action: 'start', replay: true, doneCount: 0 }),
      expect.objectContaining({ action: 'step_done', step: 'walk', doneCount: 1 }),
      expect.objectContaining({ action: 'abandon', step: 'greet', doneCount: 1, replay: true }),
    ])
  })
})
