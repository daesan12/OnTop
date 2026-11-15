import { afterEach, expect, it, vi } from 'vitest'
import { loadStonePalette } from '../../src/game/stone-rumble/stonePalette'

afterEach(() => vi.unstubAllGlobals())
it('8인 사건과 반복 준비가 겹쳐도 핵심 파일은 context마다 한 번만 요청·디코딩한다', async () => {
  const data = new ArrayBuffer(8), buffer = { duration: .3 }
  const fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => data })
  vi.stubGlobal('fetch', fetch)
  const context = { decodeAudioData: vi.fn().mockResolvedValue(buffer) } as unknown as AudioContext
  const results = await Promise.all(Array.from({ length: 8 }, () => loadStonePalette(context, 'fire')))
  expect(results.every(value => value === buffer)).toBe(true)
  expect(fetch).toHaveBeenCalledOnce(); expect(context.decodeAudioData).toHaveBeenCalledOnce()
  await loadStonePalette(context, 'hit'); expect(fetch).toHaveBeenCalledTimes(2)
})
it('파일 실패는 게임을 중단하지 않고 반복 요청도 만들지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
  vi.stubGlobal('fetch', fetch)
  const context = { decodeAudioData: vi.fn() } as unknown as AudioContext
  expect(await loadStonePalette(context, 'step')).toBeNull()
  expect(await loadStonePalette(context, 'step')).toBeNull()
  expect(fetch).toHaveBeenCalledOnce(); expect(context.decodeAudioData).not.toHaveBeenCalled()
})
