import { afterEach, expect, it, vi } from 'vitest'
import { OmokSpectatorEvents, parseSpectatorEvent, spectatorText, useOmokEvents, type EventScope } from '../../src/game/omok/spectatorEvents'
import type { Envelope } from '../../src/network/protocol'

const feeds: OmokSpectatorEvents[] = []
afterEach(() => { feeds.splice(0).forEach(f => f.reset()); vi.useRealTimers() })
const eventId = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
it('keeps commentator identity and scopes/deduplicates NPC speech to its game',()=>{
  const feed=new OmokSpectatorEvents({scope:()=>({key:'game',gameId:'g',version:6,role:'PLAYER',canSend:true}),request:vi.fn()});feeds.push(feed)
  const event:Envelope={requestId:null,type:'WORLD_AI_COMPANION_SPEECH',payload:{gameId:'g',basedOnVersion:6,incidentId:'comment-6',name:'박영감',speech:'흑이 조금 편해 보이는구먼.',expiresAt:Date.now()+30000}}
  feed.accept({...event,payload:{...event.payload,basedOnVersion:5}});expect(useOmokEvents.getState().history).toHaveLength(0)
  feed.accept({...event,payload:{...event.payload,gameId:'other'}});expect(useOmokEvents.getState().history).toHaveLength(0)
  feed.accept(event);feed.accept(event)
  expect(useOmokEvents.getState().history).toHaveLength(1);expect(useOmokEvents.getState().history[0]).toMatchObject({displayName:'박영감',senderUserId:'npc:omok'})
})
it('retired AI hiding cannot replace game history or delete its live bubble', () => {
  const feed = new OmokSpectatorEvents({ scope: () => ({ key: 'game', gameId: 'g', version: 8, role: 'SPECTATOR', canSend: true }),
    request: vi.fn(), now: () => 0 })
  feeds.push(feed)
  feed.accept(message('chat'))
  feed.accept({requestId:null,type:'GAME_CHAT_MODERATED',payload:{gameId:'other',messageId:`g:505:${eventId()}`,version:1}})
  expect(useOmokEvents.getState().history[0]?.text).toBe('여기요')
  feed.accept({requestId:null,type:'GAME_CHAT_MODERATED',payload:{gameId:'g',messageId:`g:505:${eventId()}`,version:1}})
  feed.sync()
  expect(useOmokEvents.getState().history[0]?.text).toBe('여기요')
  expect(useOmokEvents.getState().chats).toHaveLength(1)
})
it('fills initially unknown game chat names on profile arrival without rewriting confirmed history', () => {
  let name: string | undefined
  const feed = new OmokSpectatorEvents({ scope: () => ({ key: 'game', gameId: 'g', version: 8, role: 'SPECTATOR', canSend: true }),
    displayName: () => name, request: vi.fn(), now: () => 0 })
  feeds.push(feed)
  feed.accept(message('chat'))
  expect(useOmokEvents.getState().history[0]?.displayName).toBeUndefined()
  name = '늦게 온 이름'; feed.sync()
  expect(useOmokEvents.getState().history[0]?.displayName).toBe(name)
  name = undefined; feed.sync()
  expect(useOmokEvents.getState().history[0]?.displayName).toBe('늦게 온 이름')
})
it('snapshots game chat and ping names without trusting a wire displayName', () => {
  let name = '받은 당시 이름'
  const feed = new OmokSpectatorEvents({ scope: () => ({ key: 'game', gameId: 'g', version: 8, role: 'SPECTATOR', canSend: true }),
    displayName: () => name, request: vi.fn(), now: () => 0 })
  feeds.push(feed)
  feed.accept(message('chat', { displayName: '위조한 이름' }))
  feed.accept(message('ping', { eventId: eventId(2) }))
  name = '퇴장 후 다른 이름'
  feed.sync()
  expect(useOmokEvents.getState().history[0]?.displayName).toBe('받은 당시 이름')
  expect(useOmokEvents.getState().chats[0]?.displayName).toBe('받은 당시 이름')
  expect(useOmokEvents.getState().pings[0]?.displayName).toBe('받은 당시 이름')
})
const message = (kind: 'chat' | 'ping' = 'ping', patch: object = {}): Envelope => ({ requestId: null,
  type: kind === 'chat' ? 'GAME_SPECTATOR_CHAT_MESSAGE' : 'OMOK_SPECTATOR_PING',
  payload: { gameId: 'g', eventId: eventId(), senderUserId: '505', sentAt: 100_000, serverNow: 100_000,
    expiresAt: 100_000 + (kind === 'chat' ? 3000 : 2000), ...(kind === 'chat' ? { text: '여기요' } : { x: 7, y: 7, basedOnVersion: 8 }), ...patch } })
const npcSpeech = ():Envelope => ({requestId:null,type:'WORLD_AI_COMPANION_SPEECH',payload:{gameId:'g',basedOnVersion:9,incidentId:'npc-9',name:'박영감',speech:'가운데를 잘 지켰구먼.',expiresAt:Date.now()+30000}})
it('holds NPC speech arriving before the polled snapshot and displays it once on synchronization',()=>{
 const f=setup('PLAYER'),event=npcSpeech();f.feed.accept(event);f.feed.accept(event)
 expect(useOmokEvents.getState().history).toHaveLength(0)
 f.advance(650);f.version(9)
 expect(useOmokEvents.getState().history.map(e=>e.text)).toEqual(['가운데를 잘 지켰구먼.'])
 f.feed.accept(event);expect(useOmokEvents.getState().history).toHaveLength(1)
})
it('drops queued NPC speech when the match changes or the snapshot skips its version',()=>{
 const f=setup('PLAYER');f.feed.accept(npcSpeech());f.version(10)
 expect(useOmokEvents.getState().history).toHaveLength(0)
 const other=setup('PLAYER');other.feed.accept(npcSpeech());other.context({key:'other',gameId:'other',version:9,role:'PLAYER',canSend:true})
 expect(useOmokEvents.getState().history).toHaveLength(0)
})
it('does not resurrect NPC speech after a delayed snapshot exceeds the bounded waiting period',()=>{
 const f=setup('PLAYER');f.feed.accept(npcSpeech());f.advance(5001);f.version(9)
 expect(useOmokEvents.getState().history).toHaveLength(0)
})
function setup(role: 'PLAYER' | 'SPECTATOR' = 'SPECTATOR') {
  let context: EventScope | null = { key: 'owner/connection/g/'+role, gameId: 'g', version: 8, role, canSend: true }
  let now = 0
  const request = vi.fn<(type: string, p: Record<string, unknown>, expected: readonly string[], id: (v: string) => void) => Promise<Envelope>>()
  const feed = new OmokSpectatorEvents({ scope: () => context, now: () => now, request }); feeds.push(feed); feed.sync()
  return { feed, request, context: (value: EventScope | null) => { context = value; feed.sync() },
    version: (version: number) => { context = context && { ...context, version }; feed.sync() }, advance: (ms: number) => { now += ms } }
}
it('uses the existing word filter for game history and speech bubbles', () => {
  const f=setup('PLAYER')
  f.feed.accept(message('chat',{text:'씨발 테스트 5'}))
  expect(useOmokEvents.getState().history[0]?.text).toBe('** 테스트 5')
  expect(useOmokEvents.getState().chats[0]?.text).toBe('** 테스트 5')
})
it('keeps game-only history after bubbles expire, and erases it on a match change', () => {
  const f = setup('PLAYER')
  f.feed.accept(message('chat'))
  f.feed.accept(message('chat'))
  expect(useOmokEvents.getState().history).toHaveLength(1)
  f.advance(4000); f.version(9)
  expect(useOmokEvents.getState().chats).toHaveLength(0)
  expect(useOmokEvents.getState().history).toHaveLength(1)
  f.context({ key: 'another-match', gameId: 'other', role: 'SPECTATOR', version: 1, canSend: true })
  f.feed.accept(message('chat'))
  expect(useOmokEvents.getState().history).toHaveLength(0)
})
it('accepts numeric Unix ms and exact coordinate/version boundaries; rejects ISO, invalid coordinates and UUID', () => {
  expect(parseSpectatorEvent(message('ping', { x: 0, y: 14, basedOnVersion: Number.MAX_SAFE_INTEGER }))).not.toBeNull()
  for (const patch of [{ x: -1 }, { y: 15 }, { x: 1.1 }, { x: '7' }, { basedOnVersion: -1 },
    { sentAt: '2026-10-27T01:00:00Z' }, { serverNow: NaN }, { eventId: 'not-uuid' }, { expiresAt: 104_000 }])
    expect(parseSpectatorEvent(message('ping', patch))).toBeNull()
  expect(spectatorText('  응원 👋  ')).toBe('응원 👋')
  expect(() => spectatorText('bad\ntext')).toThrow()
  expect(() => spectatorText('가'.repeat(201))).toThrow()
  expect(parseSpectatorEvent(message('chat', { text: '<b>추천</b>' }))?.kind).toBe('chat')
})
it('uses expiresAt-serverNow and monotonic time, not the PC clock or a renewed full TTL', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2040-01-01'))
  const s = setup('PLAYER')
  s.feed.accept(message('chat', { serverNow: 102_000 }))
  expect(useOmokEvents.getState().chats[0]?.until).toBe(1000)
  vi.setSystemTime(new Date('1990-01-01')); s.advance(1001); vi.advanceTimersByTime(1001)
  expect(useOmokEvents.getState().chats).toEqual([])
  s.feed.accept(message('chat', { eventId: eventId(2), serverNow: 103_000 }))
  expect(useOmokEvents.getState().chats).toEqual([])
})
it('deduplicates sender ACK/pushes, isolates games and clears on disconnect/next game', () => {
  const s = setup(); s.feed.accept(message()); s.feed.accept({ ...message(), requestId: 'ack' })
  expect(useOmokEvents.getState().pings).toHaveLength(1)
  s.feed.accept(message('chat', { gameId: 'other' })); expect(useOmokEvents.getState().chats).toHaveLength(0)
  s.context(null); expect(useOmokEvents.getState().pings).toHaveLength(0); expect(useOmokEvents.getState().canSend).toBe(false)
  s.feed.accept(message()); expect(useOmokEvents.getState().pings).toHaveLength(0)
})
it('buffers only matching future pings until the state catches up, expires them and clears old versions', () => {
  const s = setup(); s.feed.accept(message('ping', { basedOnVersion: 9 }))
  expect(useOmokEvents.getState().pings).toHaveLength(0)
  s.version(9); expect(useOmokEvents.getState().pings).toHaveLength(1)
  s.version(10); expect(useOmokEvents.getState().pings).toHaveLength(0)
  s.feed.accept(message('ping', { eventId: eventId(2), basedOnVersion: 9 })); expect(useOmokEvents.getState().pings).toHaveLength(0)
  s.feed.accept(message('ping', { eventId: eventId(3), basedOnVersion: 11 })); s.advance(2001); s.version(11)
  expect(useOmokEvents.getState().pings).toHaveLength(0)
})
it('bounds chat/ping display without an unbounded queue and keeps only the latest sender ping', () => {
  const s = setup()
  for (let n=1; n<=8; n++) {
    s.feed.accept(message('chat', { eventId: eventId(n) }))
    s.feed.accept(message('ping', { eventId: eventId(100+n), senderUserId: String(500+n) }))
  }
  expect(useOmokEvents.getState().chats).toHaveLength(3); expect(useOmokEvents.getState().pings).toHaveLength(5)
  expect(new Set(useOmokEvents.getState().chats.map(c => c.slot)).size).toBe(3)
  s.feed.accept(message('ping', { eventId: eventId(200), senderUserId: '508' }))
  expect(useOmokEvents.getState().pings.filter(p => p.senderUserId === '508')).toHaveLength(1)
})
it('never sends before approval, sends the displayed version for spectators and displays ACK once', async () => {
  const unapproved = setup(); unapproved.context({ key: 'unapproved', gameId: 'g', version: 8, role: 'SPECTATOR', canSend: false })
  expect(await unapproved.feed.send('chat', 'hello')).toBe(false); expect(unapproved.request).not.toHaveBeenCalled()
  const s = setup()
  s.request.mockImplementation(async (_, payload, __, onId) => {
    onId('req-1')
    const ack = { ...message('ping', payload), requestId: 'req-1' }; s.feed.accept(ack); return ack
  })
  expect(await s.feed.send('ping', { x: 0, y: 14 })).toBe(true)
  expect(s.request.mock.calls[0]?.[0]).toBe('OMOK_SPECTATOR_PING_SEND')
  expect(s.request.mock.calls[0]?.[1]).toMatchObject({ gameId: 'g', x: 0, y: 14, basedOnVersion: 8 })
  expect(useOmokEvents.getState().pings).toHaveLength(1)
  expect(await s.feed.send('ping', { x: 1, y: 1 })).toBe(false); expect(s.request).toHaveBeenCalledTimes(1)
})
it('allows an approved player chat but never grants player ping authority', async () => {
  const s = setup('PLAYER')
  expect(s.feed.canPing()).toBe(false)
  expect(await s.feed.send('ping', { x: 7, y: 7 })).toBe(false)
  expect(s.request).not.toHaveBeenCalled()
  s.request.mockImplementation(async (_, payload, __, onId) => {
    onId('player-chat')
    const ack = { ...message('chat', payload), requestId: 'player-chat' }
    s.feed.accept(ack); return ack
  })
  expect(await s.feed.send('chat', '함께 해요')).toBe(true)
  expect(s.request.mock.calls[0]?.[0]).toBe('GAME_SPECTATOR_CHAT_SEND')
  expect(useOmokEvents.getState().chats).toHaveLength(1)
  expect(s.feed.canPing()).toBe(false)
  s.context({ key: 'player-chat-recovering', gameId: 'g', version: 8, role: 'PLAYER', canSend: false })
  expect(await s.feed.send('chat', '복구 전')).toBe(false)
  expect(s.request).toHaveBeenCalledTimes(1)
})
it('owns spectator errors without mutating game state, never retries, and blocks denied senders', async () => {
  const s = setup()
  s.request.mockImplementation(async (_, __, ___, onId) => {
    onId('req-denied')
    expect(s.feed.accept({ type:'ERROR', requestId:'req-denied', payload:{ code:'GAME_SPECTATOR_ACCESS_DENIED' } })).toBe(true)
    throw Object.assign(new Error('관전 권한을 확인해주세요.'), { code:'GAME_SPECTATOR_ACCESS_DENIED' })
  })
  expect(await s.feed.send('chat', 'hello')).toBe(false); expect(useOmokEvents.getState().canSend).toBe(false)
  expect(await s.feed.send('ping', { x:7,y:7 })).toBe(false); expect(s.request).toHaveBeenCalledTimes(1)
  expect(s.feed.accept({ type:'ERROR',requestId:'foreign',payload:{} })).toBe(false)
})
it('ignores a request finishing after the connection scope changes', async () => {
  const s = setup(); let resolve!: (value: Envelope) => void
  s.request.mockImplementation(() => new Promise(done => { resolve = done }))
  const task = s.feed.send('chat', 'hello')
  s.context({ key:'new-session',gameId:'g',version:8,role:'SPECTATOR',canSend:true })
  resolve(message('chat')); expect(await task).toBe(false); expect(useOmokEvents.getState().chats).toHaveLength(0)
})

it('publishes ping approval, cooldown and pending state separately from chat and expires feedback', async () => {
  vi.useFakeTimers()
  const s = setup()
  let finish!: () => void
  s.request.mockImplementation((_, payload, __, onId) => {
    onId('ping-one')
    return new Promise(resolve => { finish = () => resolve({ ...message('ping', payload), requestId: 'ping-one' }) })
  })
  const sending = s.feed.send('ping', { x: 7, y: 7 })
  expect(useOmokEvents.getState().pingSending).toBe(true)
  expect(useOmokEvents.getState().pingNotice).toBe('')
  expect(await s.feed.send('ping', { x: 0, y: 0 })).toBe(false)
  expect(s.request).toHaveBeenCalledTimes(1)
  expect(useOmokEvents.getState().pingError).toContain('1초 간격')
  expect(useOmokEvents.getState().error).toBe('')
  finish(); expect(await sending).toBe(true)
  expect(useOmokEvents.getState()).toMatchObject({ pingSending: false, pingReadyAt: 1000, pingNotice: 'H8 추천을 보냈어요.' })
  s.advance(1000); vi.advanceTimersByTime(1000)
  expect(useOmokEvents.getState()).toMatchObject({ pingReadyAt: 0, pingError: '' })
  expect(s.feed.canPing()).toBe(true)
  s.advance(1600); vi.advanceTimersByTime(1600)
  expect(useOmokEvents.getState().pingNotice).toBe('')
  s.context(null)
  expect(useOmokEvents.getState()).toMatchObject({ pingSending: false, pingReadyAt: 0, pingNotice: '', pingError: '' })
})
