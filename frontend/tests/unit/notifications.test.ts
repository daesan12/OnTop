import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'inbox-fixture' } as { status: 'AUTHENTICATED'; accessToken: string } | null, refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { inboxRequest, loadNotifications, parseNotificationDetail, parseNotificationPage, readNotification, sendFeedbackReply } from '../../src/features/notifications/api'

const row = { id: '12', type: 'FEEDBACK_REPLY', title: '운영진에게 메시지가 도착했어요', createdAt: '2026-11-07T09:00:00Z', readAt: null }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'inbox-fixture' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())
it('validates ordered opaque IDs and unread counts without assuming the current page contains every unread item', () => {
  expect(parseNotificationPage({ items: [row], nextCursor: '12', unreadCount: 45 })).toMatchObject({ unreadCount: 45 })
  expect(parseNotificationPage({ items: [], nextCursor: null, unreadCount: 0 }).items).toEqual([])
})
it.each([
  { items: [row,row], nextCursor: null, unreadCount: 2 }, { items: [], nextCursor: '12', unreadCount: 0 },
  { items: [row], nextCursor: null, unreadCount: -1 }, { items: [row], nextCursor: null, unreadCount: 0.5 },
  { items: [{...row,id:'0'}], nextCursor: null, unreadCount: 1 },
  { items: [{...row,id:'9223372036854775808'}], nextCursor: null, unreadCount: 1 },
  { items: [{...row,type:'UNKNOWN'}], nextCursor: null, unreadCount: 1 },
  { items: [{...row,readAt:'invalid'}], nextCursor: null, unreadCount: 1 },
])('rejects malformed or duplicated private notifications: %j', v => expect(() => parseNotificationPage(v)).toThrow())
it('requires actual reply content and a related feedback ID in a message detail', () => {
  const detail = {...row, body:'<script>일반 텍스트입니다</script>', feedbackId:'7', feedbackText:'내 의견',feedbackStatus:'RESOLVED'}
  expect(parseNotificationDetail(detail).body).toBe(detail.body)
  expect(() => parseNotificationDetail({...detail,feedbackStatus:'BAD'})).toThrow()
  expect(() => parseNotificationDetail({...detail,feedbackId:'-1'})).toThrow()
})
it('uses the authenticated member endpoint without user-ID claims, cookies or persistent cache', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({items:[row],nextCursor:null,unreadCount:1})); vi.stubGlobal('fetch',fetcher)
  await loadNotifications('',new AbortController().signal)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/notifications?limit=20',expect.objectContaining({method:'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer inbox-fixture'}}))
})
it('ignores late responses from another authentication owner', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch',vi.fn(() => new Promise<Response>(r => { resolve=r })))
  const result=loadNotifications('',new AbortController().signal)
  auth.session=null; resolve(Response.json({items:[row],nextCursor:null,unreadCount:1}))
  await expect(result).rejects.toThrow('취소')
})
it('refreshes only once and keeps the exact operation ID when retrying a reply', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({}, {status:401})).mockResolvedValueOnce(Response.json({ok:true}));vi.stubGlobal('fetch',fetcher)
  auth.refresh.mockImplementation(async()=>{auth.session={status:'AUTHENTICATED',accessToken:'refreshed'};return true})
  const body={operationId:'5467d58d-3f10-4df1-adb5-8d47bde7c227',text:'감사합니다',status:'RESOLVED' as const,expectedVersion:0}
  await sendFeedbackReply('7',body,new AbortController().signal)
  expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body)
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer refreshed')
  expect(auth.refresh).toHaveBeenCalledTimes(1)
})
it('does not report read success when the server returns another ID or no read timestamp', async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...row,body:'답변',feedbackId:'7',feedbackText:'의견',feedbackStatus:'RESOLVED'})))
  await expect(readNotification('12',new AbortController().signal)).rejects.toThrow()
})
it('preserves meaningful conflict and recipient errors for the administrator',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({code:'FEEDBACK_RECIPIENT_UNAVAILABLE'},{status:409})))
  await expect(inboxRequest('/api/v1/admin/operations/feedback/7/replies',new AbortController().signal,'POST',{})).rejects.toMatchObject({code:'FEEDBACK_RECIPIENT_UNAVAILABLE',status:409})
})
