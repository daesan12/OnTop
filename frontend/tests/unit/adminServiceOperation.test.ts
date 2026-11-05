import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as
    | { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>(),
}))
vi.mock('../../src/auth/authFlow', () => ({
  getAuthSession: () => auth.session, restoreAuthSession: auth.refresh,
}))

import {
  loadAdminServiceOperation,
  updateAdminServiceOperation,
  type AdminServiceOperationCommand,
} from '../../src/features/admin/adminServiceOperation'

const normal = { mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
  version: 4, updatedAt: '2026-11-05T01:00:00Z', serverTime: '2026-11-05T01:01:00Z' } as const
const command: AdminServiceOperationCommand = { mode: 'DRAINING', notice: '진행 중인 게임을 마무리해주세요.',
  expectedOpenAt: '2026-11-05T02:00:00Z', expectedVersion: 4 }
const draining = { ...normal, mode: 'DRAINING', notice: command.notice,
  maintenanceStartedAt: '2026-11-05T01:02:00Z', expectedOpenAt: command.expectedOpenAt,
  version: 5, updatedAt: '2026-11-05T01:02:00Z', serverTime: '2026-11-05T01:02:00Z' } as const

beforeEach(() => {
  auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }
  auth.refresh.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

it('loads the private operation state with the current access token', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(normal)); vi.stubGlobal('fetch', fetcher)
  expect(await loadAdminServiceOperation(new AbortController().signal)).toEqual(normal)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/operations/status', expect.objectContaining({
    method: 'GET', credentials: 'omit', cache: 'no-store',
    headers: { Authorization: 'Bearer test-access' },
  }))
})

it('updates the exact optimistic-lock command and verifies the returned version', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(draining)); vi.stubGlobal('fetch', fetcher)
  expect(await updateAdminServiceOperation(command, new AbortController().signal)).toEqual(draining)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/operations/status', expect.objectContaining({
    method: 'PUT',
    headers: { Authorization: 'Bearer test-access', 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  }))
})

it('rejects a success response that does not match the command or next version', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...draining, version: 6 })))
  await expect(updateAdminServiceOperation(command, new AbortController().signal)).rejects
    .toMatchObject({ code: 'INVALID_RESPONSE', kind: 'uncertain', requiresRefresh: true })
})

it('retries one expired access token without changing the update command', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json(draining))
  vi.stubGlobal('fetch', fetcher)
  auth.refresh.mockImplementation(async () => {
    auth.session = { status: 'AUTHENTICATED', accessToken: 'new-access' }; return true
  })
  await updateAdminServiceOperation(command, new AbortController().signal)
  expect(auth.refresh).toHaveBeenCalledWith(true)
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer new-access')
  expect(fetcher.mock.calls[1]![1].body).toBe(JSON.stringify(command))
})

it.each([
  [400, 'OPERATION_INVALID_REQUEST', 'invalid', false],
  [403, 'ADMIN_OPERATION_REQUIRED', 'forbidden', false],
  [409, 'OPERATION_VERSION_CONFLICT', 'conflict', true],
] as const)('classifies HTTP %s %s as %s', async (status, code, kind, requiresRefresh) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code }, { status })))
  await expect(updateAdminServiceOperation(command, new AbortController().signal)).rejects
    .toMatchObject({ code, kind, requiresRefresh })
})

it('marks an interrupted update uncertain so the caller reloads current state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  await expect(updateAdminServiceOperation(command, new AbortController().signal)).rejects
    .toMatchObject({ code: 'NETWORK_ERROR', kind: 'uncertain', requiresRefresh: true })
})

it('marks an unexpected update server error uncertain so the caller reloads current state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'INTERNAL_ERROR' }, { status: 500 })))
  await expect(updateAdminServiceOperation(command, new AbortController().signal)).rejects
    .toMatchObject({ code: 'INTERNAL_ERROR', kind: 'uncertain', requiresRefresh: true })
})

it('discards a response after the authentication owner changes', async () => {
  let release!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const pending = loadAdminServiceOperation(new AbortController().signal)
  auth.session = null; release(Response.json(normal))
  await expect(pending).rejects.toThrow('취소')
})
