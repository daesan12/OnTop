import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadServiceOperation, unavailableServiceOperation } from './serviceOperation'

describe('service operation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('점검 상태와 재개 예정 시각을 검증해 읽는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      mode: 'DRAINING',
      notice: '진행 중인 경기를 마무리하고 있어요.',
      maintenanceStartedAt: '2026-11-04T03:00:00Z',
      expectedOpenAt: '2026-11-04T03:10:00Z',
      version: 2,
      updatedAt: '2026-11-04T03:00:00Z',
      serverTime: '2026-11-04T03:01:00Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const status = await loadServiceOperation()

    expect(status.mode).toBe('DRAINING')
    expect(status.expectedOpenAt).toBe('2026-11-04T03:10:00Z')
  })

  it('알 수 없는 운영 상태 응답을 거절한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      mode: 'BROKEN', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
      version: 0, updatedAt: '', serverTime: '',
    }), { status: 200 })))

    await expect(loadServiceOperation()).rejects.toThrow('운영 상태 응답')
  })

  it('백엔드가 응답하지 않을 때 사용할 안전한 점검 상태를 만든다', () => {
    expect(unavailableServiceOperation().mode).toBe('MAINTENANCE')
  })
})
