import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { loadAdminFeedback, parseAdminFeedbackPage } from '../../src/features/feedback/adminService'
const entry = { receiptId: '123', authorUserId: 202, channelId: 'a', text: '<script>입력은 일반 텍스트</script>\n줄바꿈', acceptedAt: '2026-10-25T00:00:00Z' }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())
it('accepts the approved list contract, withdrawn authors, empty lists and opaque decimal cursors', () => {
  expect(parseAdminFeedbackPage({ items: [entry], nextCursor: '123' })).toEqual({ items: [entry], nextCursor: '123' })
  expect(parseAdminFeedbackPage({ items: [{ ...entry, authorUserId: null }], nextCursor: null })).toMatchObject({ items: [{ authorUserId: null }] })
  expect(parseAdminFeedbackPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null })
  expect(parseAdminFeedbackPage({ items: [entry], nextCursor: null }, '124').items).toHaveLength(1)
})
it.each([{}, { items: [], nextCursor: '123' }, { items: [entry, entry], nextCursor: null },
  { items: [{ ...entry, receiptId: '9223372036854775808' }], nextCursor: null },
  { items: [{ ...entry, authorUserId: '202' }], nextCursor: null }, { items: [{ ...entry, text: null }], nextCursor: null },
  { items: [{ ...entry, acceptedAt: 'invalid' }], nextCursor: null }, { items: [entry], nextCursor: '124' },
])('rejects malformed pages without silently displaying an empty success: %j', value => expect(() => parseAdminFeedbackPage(value)).toThrow())
it('uses the existing authenticated read API without cookies, body, local persistence or user-ID query', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [entry], nextCursor: null })); vi.stubGlobal('fetch', fetcher)
  await loadAdminFeedback('124', new AbortController().signal)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/feedback?limit=20&cursor=124', expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-access' } }))
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
})
it('does not turn ordinary administrator denial into logout or a successful empty list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'FEEDBACK_ADMIN_REQUIRED' }, { status: 403 })))
  await expect(loadAdminFeedback('', new AbortController().signal)).rejects.toMatchObject({ code: 'FEEDBACK_ADMIN_REQUIRED', authEnded: false })
  expect(auth.session).not.toBeNull(); expect(auth.refresh).not.toHaveBeenCalled()
})
it('retries an expired Access token only once through existing refresh', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json({ items: [], nextCursor: null }))
  vi.stubGlobal('fetch', fetcher); auth.refresh.mockImplementation(async () => { auth.session = { status: 'AUTHENTICATED', accessToken: 'new-access' }; return true })
  expect(await loadAdminFeedback('', new AbortController().signal)).toEqual({ items: [], nextCursor: null })
  expect(auth.refresh).toHaveBeenCalledWith(true); expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer new-access')
})
it('discards a response when the authentication owner changed while it was pending', async () => {
  let release!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const pending = loadAdminFeedback('', new AbortController().signal)
  auth.session = null; release(Response.json({ items: [entry], nextCursor: null }))
  await expect(pending).rejects.toThrow('취소')
})
