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
  executeAdminWalletGrant, parseAdminWalletGrantPreview, parseAdminWalletGrantResult,
  previewAdminWalletGrant, type AdminWalletGrantCommand,
} from '../../src/features/admin/adminWalletGrant'

const preview = { amountPerMember: 100, reason: '출시 기념', recipientCount: 30,
  missingWalletCount: 0, totalAmount: 3000, executable: true }
const command: AdminWalletGrantCommand = { requestId: '378eb951-f173-4ca2-bdfc-eb291054777f',
  amountPerMember: 100, reason: '출시 기념', expectedRecipientCount: 30 }
const result = { batchId: 7, requestId: command.requestId, amountPerMember: 100, reason: '출시 기념',
  recipientCount: 30, totalAmount: 3000, executedAt: '2026-11-03T01:00:00Z' }

beforeEach(() => {
  auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }
  auth.refresh.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

it('accepts executable and empty previews while rejecting inconsistent totals and flags', () => {
  expect(parseAdminWalletGrantPreview(preview)).toEqual(preview)
  expect(parseAdminWalletGrantPreview({ amountPerMember: 100, reason: '대상 없음', recipientCount: 0,
    missingWalletCount: 0, totalAmount: 0, executable: false })).toMatchObject({ recipientCount: 0, executable: false })
  expect(() => parseAdminWalletGrantPreview({ ...preview, totalAmount: 2999 })).toThrow()
  expect(() => parseAdminWalletGrantPreview({ ...preview, missingWalletCount: 1, executable: true })).toThrow()
})

it('accepts only complete execute results with a UUID and matching total', () => {
  expect(parseAdminWalletGrantResult(result)).toEqual(result)
  expect(() => parseAdminWalletGrantResult({ ...result, requestId: 'not-a-uuid' })).toThrow()
  expect(() => parseAdminWalletGrantResult({ ...result, totalAmount: 1 })).toThrow()
  expect(() => parseAdminWalletGrantResult({ ...result, executedAt: 'invalid' })).toThrow()
})

it('sends a private no-store preview with the existing Access token', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(preview)); vi.stubGlobal('fetch', fetcher)
  expect(await previewAdminWalletGrant(100, '출시 기념', new AbortController().signal)).toEqual(preview)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/wallet-grants/preview', expect.objectContaining({
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { Authorization: 'Bearer test-access', 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountPerMember: 100, reason: '출시 기념' }),
  }))
})

it('executes the exact idempotency command and returns its audit result', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal('fetch', fetcher)
  expect(await executeAdminWalletGrant(command, new AbortController().signal)).toEqual(result)
  expect(fetcher.mock.calls[0]![1]).toEqual(expect.objectContaining({ body: JSON.stringify(command) }))
})

it('rejects a success body that does not belong to the requested preview or idempotency command', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...preview, amountPerMember: 200, totalAmount: 6000 })))
  await expect(previewAdminWalletGrant(100, '출시 기념', new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })))
  await expect(executeAdminWalletGrant(command, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

it('retries one expired Access token and preserves the request body', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json(result))
  vi.stubGlobal('fetch', fetcher)
  auth.refresh.mockImplementation(async () => {
    auth.session = { status: 'AUTHENTICATED', accessToken: 'new-access' }; return true
  })
  await executeAdminWalletGrant(command, new AbortController().signal)
  expect(auth.refresh).toHaveBeenCalledWith(true)
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer new-access')
  expect(fetcher.mock.calls[1]![1].body).toBe(JSON.stringify(command))
})

it.each([
  ['ADMIN_WALLET_GRANT_TARGET_CHANGED', 'changed', true],
  ['ADMIN_WALLET_GRANT_WALLETS_NOT_READY', 'changed', true],
  ['ADMIN_WALLET_GRANT_REQUEST_CONFLICT', 'conflict', false],
] as const)('classifies 409 %s as %s', async (code, kind, requiresPreview) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code }, { status: 409 })))
  await expect(executeAdminWalletGrant(command, new AbortController().signal)).rejects
    .toMatchObject({ code, kind, requiresPreview })
})

it('marks an unknown execute result retryable so the caller can reuse the same request ID', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  await expect(executeAdminWalletGrant(command, new AbortController().signal)).rejects
    .toMatchObject({ code: 'NETWORK_ERROR', kind: 'uncertain', retryable: true })
})

it('discards a response after the authentication owner changes', async () => {
  let release!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const pending = previewAdminWalletGrant(100, '출시 기념', new AbortController().signal)
  auth.session = null; release(Response.json(preview))
  await expect(pending).rejects.toThrow('취소')
})
