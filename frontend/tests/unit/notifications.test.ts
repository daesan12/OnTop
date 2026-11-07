import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'inbox-fixture' } as { status: 'AUTHENTICATED'; accessToken: string } | null, refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { inboxRequest, loadNotifications, parseNotificationDetail, parseNotificationPage, readNotification, sendFeedbackReply } from '../../src/features/notifications/api'
import { claimReward, parseRewardReceipt, rewardLabel } from '../../src/features/notifications/api'

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

const reward = { kind:'COIN' as const, amount:1000, expiresAt:'2030-01-01T00:00:00Z', claimedAt:null }
it('keeps reward read state separate from claimed state and formats variable amounts without a plus sign',()=>{
  const value = {...row,type:'REWARD',readAt:'2026-11-07T09:01:00Z',reward}
  expect(parseNotificationPage({items:[value],nextCursor:null,unreadCount:0}).items[0]?.reward?.claimedAt).toBeNull()
  expect(rewardLabel(reward)).toBe('엽전 1,000냥')
  expect(rewardLabel({kind:'GACHA_TICKET',amount:1})).toBe('뽑기권 1장')
  expect(parseNotificationDetail({...value,body:'작은 선물이에요',feedbackId:null,feedbackText:null,feedbackStatus:null}).feedbackId).toBeNull()
})
it.each([{...reward,amount:0},{...reward,amount:1.1},{...reward,amount:Number.MAX_SAFE_INTEGER+1},
  {...reward,kind:'RAFFLE_TICKET'},{...reward,claimedAt:'invalid'},{...reward,expiresAt:'invalid'}])('rejects an invalid reward %j',v=>{
  expect(()=>parseNotificationPage({items:[{...row,type:'REWARD',reward:v}],nextCursor:null,unreadCount:1})).toThrow()
})
it('claims the owned notification without sending recipient or amount and verifies the receipt',async()=>{
  const receipt={notificationId:'12',kind:'COIN',amount:1000,claimedAt:'2026-11-07T09:02:00Z',balanceAfter:1100,ticketsAfter:null}
  const fetcher=vi.fn().mockResolvedValue(Response.json(receipt));vi.stubGlobal('fetch',fetcher)
  expect(await claimReward('12',new AbortController().signal)).toEqual(receipt)
  expect(fetcher.mock.calls[0]![0]).toBe('/api/v1/notifications/12/claim')
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
  expect(()=>parseRewardReceipt({...receipt,notificationId:'13'},'12')).toThrow()
  expect(()=>parseRewardReceipt({...receipt,balanceAfter:null},'12')).toThrow()
  expect(()=>parseRewardReceipt({...receipt,ticketsAfter:3},'12')).toThrow()
})

it('관리자 회원검색은 안전한 ID와 닉네임을 확인한다', async () => {
  const { findRewardRecipients } = await import('../../src/features/notifications/api')
  const fetcher = vi.fn().mockResolvedValue(Response.json([{userId:'202',nickname:'산책자'}])); vi.stubGlobal('fetch',fetcher)
  expect(await findRewardRecipients('산책자',new AbortController().signal)).toEqual([{userId:'202',nickname:'산책자'}])
  expect(String(fetcher.mock.calls[0][0])).toContain(encodeURIComponent('산책자'))
  fetcher.mockResolvedValueOnce(Response.json([{userId:'0',nickname:'산책자'}]))
  await expect(findRewardRecipients('산책자',new AbortController().signal)).rejects.toThrow()
})
it('보상 이력은 수령 상태와 커서 정합성을 확인한다',async()=>{
  const {loadRewardHistory}=await import('../../src/features/notifications/api')
  const row={notificationId:'12',title:'선물',kind:'COIN',amount:100,createdAt:'2026-11-07T09:00:00Z',expiresAt:'2030-01-01T00:00:00Z',claimedAt:null,status:'PENDING'}
  const fetcher=vi.fn().mockResolvedValue(Response.json({items:[row],nextCursor:'12'}));vi.stubGlobal('fetch',fetcher)
  expect((await loadRewardHistory('202','',new AbortController().signal)).nextCursor).toBe('12')
  fetcher.mockResolvedValueOnce(Response.json({items:[{...row,status:'CLAIMED'}],nextCursor:null}))
  await expect(loadRewardHistory('202','',new AbortController().signal)).rejects.toThrow()
  fetcher.mockResolvedValueOnce(Response.json({items:[row],nextCursor:'13'}))
  await expect(loadRewardHistory('202','',new AbortController().signal)).rejects.toThrow()
})
