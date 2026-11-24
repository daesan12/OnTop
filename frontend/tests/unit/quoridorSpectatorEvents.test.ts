import { afterEach, expect, it, vi } from 'vitest'
import { OmokSpectatorEvents, useOmokEvents, type EventScope } from '../../src/game/omok/spectatorEvents'
import type { Envelope } from '../../src/network/protocol'

const feeds: OmokSpectatorEvents[] = []
afterEach(() => feeds.splice(0).forEach(feed => feed.reset()))
const scope = (): EventScope => ({ key: 'q/spectator', gameId: 'q', version: 1, role: 'SPECTATOR', canSend: true, pingBoardSize: 9 })
function setup() {
  let context: EventScope | null = scope()
  const request = vi.fn(async (type: string, payload: Record<string, unknown>) => ({ requestId: 'ack',
    type: type === 'OMOK_SPECTATOR_PING_SEND' ? 'OMOK_SPECTATOR_PING' : 'GAME_SPECTATOR_CHAT_MESSAGE',
    payload: { ...payload, senderUserId: '505', sentAt: 1000, serverNow: 1000, expiresAt: type === 'OMOK_SPECTATOR_PING_SEND' ? 3000 : 4000 },
  } as Envelope))
  const feed = new OmokSpectatorEvents({ scope: () => context, request, now: () => 0, displayName: () => '훈수 할아버지' })
  feeds.push(feed); feed.sync()
  return { feed, request, context: (next: EventScope | null) => { context = next; feed.sync() } }
}

it('9칸 보드 끝의 추천 좌표를 I1로 확인하고 서버 승인 이벤트를 한 번만 표시한다', async () => {
  const f = setup()
  expect(await f.feed.send('ping', { x: 8, y: 8 })).toBe(true)
  expect(f.request.mock.calls[0][1]).toMatchObject({ gameId: 'q', basedOnVersion: 1, x: 8, y: 8 })
  expect(useOmokEvents.getState().pingNotice).toBe('I1 추천을 보냈어요.')
  const ack = await f.request.mock.results[0].value
  f.feed.accept(ack)
  expect(useOmokEvents.getState().pings).toHaveLength(1)
  expect(useOmokEvents.getState().pings[0].displayName).toBe('훈수 할아버지')
})

it('9칸 밖의 송수신 좌표를 막고 새 버전에서 지난 추천을 지운다', async () => {
  const f = setup()
  expect(await f.feed.send('ping', { x: 9, y: 0 })).toBe(false)
  expect(f.request).not.toHaveBeenCalled()
  await f.feed.send('ping', { x: 0, y: 0 })
  expect(useOmokEvents.getState().pingNotice).toBe('A9 추천을 보냈어요.')
  const ack = await f.request.mock.results[0].value
  f.feed.accept({ ...ack, payload: { ...ack.payload, eventId: crypto.randomUUID(), y: 9 } })
  expect(useOmokEvents.getState().pings).toHaveLength(1)
  f.context({ ...scope(), version: 2 })
  expect(useOmokEvents.getState().pings).toHaveLength(0)
  f.context(null)
  expect(useOmokEvents.getState().pingNotice).toBe('')
  expect(await f.feed.send('chat', '관전 해제 뒤')).toBe(false)
})

it('플레이어는 경기 채팅만 보내고 승인 없는 관전자는 채팅과 추천을 모두 보내지 못한다', async () => {
  const f = setup()
  f.context({ ...scope(), key: 'q/player', role: 'PLAYER' })
  expect(await f.feed.send('ping', { x: 4, y: 4 })).toBe(false)
  expect(await f.feed.send('chat', '가운데 길을 남겨요')).toBe(true)
  expect(useOmokEvents.getState().history[0].text).toBe('가운데 길을 남겨요')
  f.context({ ...scope(), canSend: false })
  expect(await f.feed.send('ping', { x: 4, y: 4 })).toBe(false)
  expect(await f.feed.send('chat', '승인 전')).toBe(false)
  expect(f.request).toHaveBeenCalledTimes(1)
})
