import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { avatars, resetWorld, useSession } from '../../src/network/worldClient'
import { useEmoteState } from '../../src/features/emotes/state'
import { ParkRuntime } from '../../src/park/runtime/runtime'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import developmentBindings from '../../public/park-bindings.dev.json' with { type: 'json' }
import {practiceAction} from '../../src/ai-park/practiceActions'
import {parkRuntime} from '../../src/park/runtime/runtime'
import {acceptAiFeatures} from '../../src/features/ai/serviceFeatures'
import {useCompanions,type Practice} from '../../src/features/ai/companions'

const sockets: ContractSocket[] = []
class ContractSocket implements SocketLike {
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  emoteResponse: 'success' | 'error' | 'hold' = 'success'
  readyState = 0
  onopen: SocketLike['onopen'] = null
  onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null
  onerror: SocketLike['onerror'] = null
  constructor() {
    sockets.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.(new Event('open'))
      this.emit('CONNECTED', { userId: '101' })
    })
  }
  emit(type: string, payload: object, requestId: string | null = null) {
    this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent)
  }
  send(data: string) {
    const request = JSON.parse(data)
    this.requests.push(request)
    if (request.type === 'WORLD_FOLLOW_CHECK') queueMicrotask(() => this.emit('WORLD_FOLLOW_STATE', { channelId: 'channel-1', version: 0, links: [] }, request.requestId))
    if (request.type === 'CHANNEL_JOIN') queueMicrotask(() => this.emit('CHANNEL_STATE', {
      channelId: 'channel-1', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'],
    }, request.requestId))
    if (request.type === 'WORLD_EMOTE_SEND' && this.emoteResponse !== 'hold') queueMicrotask(() => {
      if (this.emoteResponse === 'error') this.emit('ERROR', { code: 'EMOTE_NOT_SUPPORTED', message: '등록되지 않은 감정표현입니다.' }, request.requestId)
      else this.emit('WORLD_EMOTE_EVENT', { eventId: crypto.randomUUID(), channelId: 'channel-1', userId: '101',
        emoteCode: request.payload.emoteCode, sentAt: new Date().toISOString() }, request.requestId)
    })
  }
  close(code = 1000) {
    this.readyState = 3
    queueMicrotask(() => this.onclose?.({ code } as CloseEvent))
  }
}

let runtime: ParkRuntime
type Handler = (path: string, init: RequestInit) => Response | Promise<Response> | undefined
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function server(override: Handler = () => undefined) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const special = override(url, init)
    if (special) return special
    if (url === '/api/v1/auth/refresh') return json({ accessToken: 'fixture-access' })
    if (url === '/park-bindings.json') return json({ bindings: [], emotes: [
      { motion: 'EMOTE_WAVE', code: 'WAVE' }, { motion: 'EMOTE_CLAP', code: 'CLAP' },
    ] })
    expect(init.credentials).toBe('omit')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer fixture-access' })
    if (url === '/api/v1/channels') return json({ items: [{ channelId: 'channel-1', name: '공원', currentUsers: 0, capacity: 4, joinable: true }] })
    if (url === '/api/v1/users/me') return json({ userId: 101, nickname: '회원', characterGender: 'FEMALE' })
    if (url === '/api/v1/auth/websocket-ticket') return json({ ticket: 'fixture-ticket', expiresIn: 30 })
    if (url.startsWith('/api/v1/tables?')) return json({ tables: [] })
    throw new Error('Unexpected request: ' + url)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
async function start() {
  await restoreAuthSession(true)
  runtime.start()
}
beforeEach(() => {
  clearAuthSession()
  resetWorld()
  sockets.length = 0
  vi.stubGlobal('window', { location: { href: 'http://localhost:5197/park' } })
  vi.stubGlobal('WebSocket', ContractSocket)
  runtime = new ParkRuntime()
})
afterEach(async () => {
  await runtime.stop()
  vi.useRealTimers()
  clearAuthSession()
  vi.unstubAllGlobals()
})

describe('M04 emote delivery through the existing Spring transport', () => {
  async function movementSession(override?: Handler) {
    server(override)
    await start()
    await vi.waitFor(() => expect(useSession.getState().roomId).toBe('channel-1'))
    const socket = sockets.at(-1)!
    socket.emit('WORLD_STATE', { channelId: 'channel-1', version: 1, mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: '101', position: { lastInputSeq: 0, x: 0, y: 0.8, z: 34, yaw: 0,
        moving: false, running: false, swimming: false } }] })
    return socket
  }
  it.each([
    ['EMOTE_WAVE', 'WAVE', 5000], ['EMOTE_CLAP', 'CLAP', 5000],
    ['EMOTE_APPLAUSE_REQUEST', 'APPLAUSE_REQUEST', 1800], ['EMOTE_TSK', 'TSK', 1800], ['EMOTE_FART', 'FART', 1800],
  ] as const)('loads deployed dev mapping and waits for server approval for %s', async (motion, code, cooldownMs) => {
    vi.stubGlobal('window', { location: { href: 'https://dev.on-top.world/park', hostname: 'dev.on-top.world' } })
    const socket = await movementSession(path => path === '/park-bindings.dev.json' ? json(developmentBindings) : undefined)
    socket.emoteResponse = 'hold'
    const pending = runtime.sendEmote(motion)
    expect(avatars.get('101')!.emote).toBe('')
    const request = socket.requests.find(r => r.type === 'WORLD_EMOTE_SEND')!
    expect(request.payload).toEqual({ emoteCode: code })
    const event = { eventId: crypto.randomUUID(), channelId: 'channel-1', userId: '101', emoteCode: code, sentAt: new Date().toISOString() }
    socket.emit('WORLD_EMOTE_EVENT', event, request.requestId)
    expect(await pending).toBe(true)
    expect(avatars.get('101')).toMatchObject({ emote: motion, emoteAt: Date.parse(event.sentAt) })
    expect(useEmoteState.getState().readyAt).toBe(Date.parse(event.sentAt) + cooldownMs)
    expect(await runtime.sendEmote(motion === 'EMOTE_WAVE' ? 'EMOTE_CLAP' : 'EMOTE_WAVE')).toBe(false)
    expect(socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND')).toHaveLength(1)
  })
  it('sends only the configured emote code and plays once after its own approval; neutral input preserves it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const socket = await movementSession()
    socket.emoteResponse = 'hold'
    const pending = runtime.sendEmote('EMOTE_WAVE')
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState().pending).toBe(true)
    const request = socket.requests.find(r => r.type === 'WORLD_EMOTE_SEND')!
    expect(request.payload).toEqual({ emoteCode: 'WAVE' })
    const event = { eventId: crypto.randomUUID(), channelId: 'channel-1', userId: '101', emoteCode: 'WAVE', sentAt: new Date().toISOString() }
    socket.emit('WORLD_EMOTE_EVENT', event, request.requestId)
    expect(await pending).toBe(true)
    expect(avatars.get('101')!.emote).toBe('EMOTE_WAVE')
    const at = avatars.get('101')!.emoteAt
    socket.emit('WORLD_EMOTE_EVENT', event, request.requestId)
    expect(avatars.get('101')!.emoteAt).toBe(at)
    runtime.move(0, 0, false)
    expect(avatars.get('101')!.emote).toBe('EMOTE_WAVE')
    runtime.move(0, -1, false, true)
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState().readyAt).toBe(0)
    socket.emoteResponse = 'success'
    expect(await runtime.sendEmote('EMOTE_CLAP')).toBe(true)
    expect(socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND')).toHaveLength(2)
  })
  it('reports rejection without a mock fallback and allows an explicit retry', async () => {
    const socket = await movementSession()
    socket.emoteResponse = 'error'
    expect(await runtime.sendEmote('EMOTE_CLAP')).toBe(false)
    expect(useEmoteState.getState()).toMatchObject({ pending: false, readyAt: 0, error: '등록되지 않은 감정표현입니다.' })
    expect(useSession.getState().error).toBe('')
    expect(avatars.get('101')!.emote).toBe('')
    socket.emoteResponse = 'success'
    expect(await runtime.sendEmote('EMOTE_CLAP')).toBe(true)
    expect(avatars.get('101')!.emote).toBe('EMOTE_CLAP')
  })

  it('preserves normal-completion cooldown when moving after a wave has already ended', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await movementSession()
    expect(await runtime.sendEmote('EMOTE_WAVE')).toBe(true)
    const readyAt = useEmoteState.getState().readyAt
    vi.setSystemTime(Date.now() + 3000)
    runtime.move(0, -1, false)
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState().readyAt).toBe(readyAt)
    expect(await runtime.sendEmote('EMOTE_CLAP')).toBe(false)
  })
  it('times out safely and ignores a late approval without automatic resend', async () => {
    const socket = await movementSession()
    socket.emoteResponse = 'hold'
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
    const request = runtime.sendEmote('EMOTE_WAVE')
    expect(await runtime.sendEmote('EMOTE_CLAP')).toBe(false)
    await vi.advanceTimersByTimeAsync(8000)
    expect(await request).toBe(false)
    expect(useEmoteState.getState().pending).toBe(false)
    expect(useEmoteState.getState().error).toContain('응답 시간이 초과')
    const sent = socket.requests.find(r => r.type === 'WORLD_EMOTE_SEND')!
    socket.emit('WORLD_EMOTE_EVENT', { eventId: crypto.randomUUID(), channelId: 'channel-1', userId: '101', emoteCode: 'WAVE', sentAt: new Date().toISOString() }, sent.requestId)
    expect(avatars.get('101')!.emote).toBe('')
    expect(socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND')).toHaveLength(1)
  })
  it('releases cancelled pending requests immediately and isolates an old ACK/finally from a newer request', async () => {
    const socket = await movementSession()
    socket.emoteResponse = 'hold'
    const request = runtime.sendEmote('EMOTE_WAVE')
    runtime.move(0, -1, false)
    expect(useEmoteState.getState()).toMatchObject({ readyAt: 0, pending: false })
    const sent = socket.requests.find(r => r.type === 'WORLD_EMOTE_SEND')!
    const next = runtime.sendEmote('EMOTE_CLAP')
    const nextId = socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND').at(-1)!.requestId
    socket.emit('WORLD_EMOTE_EVENT', { eventId: crypto.randomUUID(), channelId: 'channel-1', userId: '101', emoteCode: 'WAVE', sentAt: new Date().toISOString() }, sent.requestId)
    expect(await request).toBe(false)
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState()).toMatchObject({ readyAt: 0, pending: true, requestId: nextId, requested: 'EMOTE_CLAP' })
    socket.close(1012)
    expect(await next).toBe(false)
    expect(useEmoteState.getState().pending).toBe(false)
    expect(useSession.getState().status).toBe('reconnecting')
  })

  it('continues an approved fart through movement input without restarting it', async () => {
    vi.stubGlobal('window', { location: { href: 'https://dev.on-top.world/park', hostname: 'dev.on-top.world' } })
    const socket = await movementSession(path => path === '/park-bindings.dev.json' ? json(developmentBindings) : undefined)
    expect(await runtime.sendEmote('EMOTE_FART')).toBe(true)
    const at = avatars.get('101')!.emoteAt, readyAt = useEmoteState.getState().readyAt
    runtime.move(0, -1, true, true)
    expect(avatars.get('101')).toMatchObject({ emote: 'EMOTE_FART', emoteAt: at })
    expect(useEmoteState.getState().readyAt).toBe(readyAt)
    expect(socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND')).toHaveLength(1)
  })

  it('keeps a retired request rejection out of the new emote and global error state', async () => {
    const socket = await movementSession()
    socket.emoteResponse = 'hold'
    const old = runtime.sendEmote('EMOTE_WAVE')
    const oldId = socket.requests.filter(r => r.type === 'WORLD_EMOTE_SEND').at(-1)!.requestId
    runtime.move(0, -1, false)
    const next = runtime.sendEmote('EMOTE_CLAP')
    socket.emit('ERROR', { code: 'EMOTE_TOO_FREQUENT', message: 'old request' }, oldId)
    expect(await old).toBe(false)
    expect(useSession.getState().error).toBe('')
    expect(useEmoteState.getState()).toMatchObject({ pending: true, requested: 'EMOTE_CLAP', error: '' })
    socket.close(1012)
    expect(await next).toBe(false)
  })
})

describe('가챠의 실제 Spring REST 전송 경계', () => {
  it('인증된 구매·추첨·개봉·복구만 허용하고 임의 경로와 메서드는 차단한다', async () => {
    const fetch = server(path => path.startsWith('/api/v1/gacha') ? json({ accepted: true }) : undefined)
    await start()
    await vi.waitFor(() => expect(useSession.getState().roomId).toBe('channel-1'))
    for (const [path, method] of [
      ['/api/v1/gacha', 'GET'], ['/api/v1/gacha/tickets', 'POST'], ['/api/v1/gacha/draws', 'POST'],
      ['/api/v1/gacha/boxes/open', 'POST'], ['/api/v1/gacha/operations/operation-1', 'GET'],
    ]) {
      expect(await runtime.requestJSON(path!, { method })).toEqual({ accepted: true })
      expect(fetch.mock.calls.at(-1)?.[1]?.headers).toMatchObject({ Authorization: 'Bearer fixture-access' })
    }
    for (const [path, method] of [['/api/v1/gacha/tickets', 'GET'], ['/api/v1/gacha/admin', 'POST'], ['/api/v1/gacha/operations/../users', 'GET']])
      await expect(runtime.requestJSON(path!, { method })).rejects.toThrow('현재 공원에서 사용할 수 없는 요청')
  })
})

describe('NPC 오목의 실제 Spring REST 전송 경계',()=>{
 it.each(['place','forfeit','undoRequest','drawRequest','stop'])('%s는 인증과 JSON Content-Type을 함께 전달한다',async kind=>{
  const p:Practice={name:'박영감',npcUserId:'9001',difficulty:'HARD',phase:'PLAYING',bet:0,thinking:false,speech:'',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'npc-json',tableId:'table1',version:0,blackUserId:101,whiteUserId:9001,turnUserId:101,winnerUserId:null,turnDeadline:new Date(Date.now()+30000).toISOString(),endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,outcome:'PLAYING',forbiddenMoves:[]}}}
  const sent:RequestInit[]=[]
  server((path,init)=>{
   if(path==='/api/v1/ai/companions/action'){
    sent.push(init)
    if(new Headers(init.headers).get('Content-Type')!=='application/json')return json({error:'Unsupported Media Type'},415)
    return json({accepted:true})
   }
   if(path==='/api/v1/ai/companions/status')return json({actors:[],practice:kind==='stop'?null:p,commentary:[]})
   return undefined
  })
  await start();await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('channel-1'))
  acceptAiFeatures({companions:true,jokeContest:false});useCompanions.setState({practice:p,receivedAt:performance.now(),practicePending:false,practiceError:''})
  const forward=vi.spyOn(parkRuntime,'requestJSON').mockImplementation(runtime.requestJSON)
  try{
   await practiceAction(kind,kind==='place'?{x:7,y:7}:{})
   expect(sent).toHaveLength(1)
   expect(new Headers(sent[0].headers).get('Content-Type')).toBe('application/json')
   expect(new Headers(sent[0].headers).get('Authorization')).toBe('Bearer fixture-access')
   expect(JSON.parse(sent[0].body as string)).toMatchObject({kind,gameId:'npc-json',version:0})
   expect(useCompanions.getState().practiceError).toBe('')
  }finally{forward.mockRestore()}
 })
})
