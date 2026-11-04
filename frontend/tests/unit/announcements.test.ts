import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'test' } as { status: 'AUTHENTICATED'; accessToken: string } | null, refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { parseNoticeFeed, visibleNotices, loadNotices, saveAnnouncement, noticeRefreshDelay } from '../../src/features/announcements/api'
const feed = { serverTime: '2026-11-04T00:00:00Z', refreshAt: '2026-11-04T00:00:10Z', announcements: [
  { id: 'a78baf0b-0246-4391-adef-a247f90ac50a', text: '<script>일반 텍스트</script>', endsAt: '2026-11-04T00:00:05Z', version: 0 },
] }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'test' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())
it('서버 시각에 경과시간을 더해 종료된 공지를 숨긴다', () => {
  expect(visibleNotices(parseNoticeFeed(feed), 4999)).toHaveLength(1)
  expect(visibleNotices(feed, 5000)).toHaveLength(0)
})
it.each([{}, { ...feed, serverTime: 'bad' }, { ...feed, announcements: [{ ...feed.announcements[0], version: -1 }] }])('잘못된 피드는 성공으로 취급하지 않는다', v => expect(() => parseNoticeFeed(v)).toThrow())
it('만료 토큰 재발급 후에도 401이면 재로그인으로 구분한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 401 })))
  auth.refresh.mockResolvedValue(true)
  await expect(loadNotices(new AbortController().signal)).rejects.toMatchObject({ status: 401 })
  expect(auth.refresh).toHaveBeenCalledTimes(1)
})
it('로그인 주체가 바뀐 동안 수신한 응답은 폐기한다', async () => {
  let done!: (v: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { done = resolve })))
  const pending = loadNotices(new AbortController().signal); auth.session = null; done(Response.json(feed))
  await expect(pending).rejects.toThrow('취소')
})
it('생성 재시도는 같은 UUID와 JSON을 사용하며 쿠키를 보내지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetcher)
  const draft = { title: '제목', text: '본문', published: false, displayOrder: 1, startsAt: null, endsAt: null, expectedVersion: 0 }
  await saveAnnouncement(feed.announcements[0]!.id, draft, true, new AbortController().signal)
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', body: JSON.stringify(draft) })
})

it.each([[-10, 2000], [0, 2000], [50, 2000], [1999, 2000], [2000, 2000], [5000, 5000], [30000, 10000]])('서버 경계 %dms는 다음 폴링까지 %dms를 보장한다', (boundary, delay) => {
  const serverTime = '2026-11-04T00:00:00Z'
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(serverTime) + 3600000)
  try {
    expect(noticeRefreshDelay({ serverTime, refreshAt: new Date(Date.parse(serverTime) + boundary).toISOString() })).toBe(delay)
  } finally { vi.restoreAllMocks() }
})
