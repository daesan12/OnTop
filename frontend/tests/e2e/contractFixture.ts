import { expect, type Page, type WebSocketRoute } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { TABLES } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import type { Farkle } from '../../src/game/protocol'
import type { OneCard, Hand, Card } from '../../src/game/onecard/protocol'
import { bridgeState as makeBridge } from '../fixtures/bridge'
import type { Bridge, SecretDie } from '../../src/game/bridge/protocol'
import { facilityFixture } from './facilityFixture'
import type { PublicEquipment } from '../../src/network/equipment'
import developmentBindings from '../../public/park-bindings.dev.json' with { type: 'json' }

// Contract fixtures intercept HTTP/RawWS only in tests. No production fake-auth or socket bypass.
export const tableId = 'fixture-server-table'
const artifacts =
  process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-qa')
export async function screenshot(page: Page, name: string) {
  await fs.mkdir(artifacts, { recursive: true })
  await page.screenshot({ path: path.join(artifacts, name + '.png') })
}
export async function fixture(
  page: Page,
  options: {
    mapVersion?: string
    bindings?: boolean
    players?: number
    omok?: boolean
    dice?: boolean
    onecard?: 2 | 3 | 4
    bridge?: 2 | 3 | 4
    m09?: boolean
    startEvents?: boolean
    manualMovement?: boolean
    ownUserId?: '101' | '102'
    emoteBindings?: boolean | 'development'
    publicProfiles?: Record<string, { nickname?: string | null; characterGender?: 'MALE' | 'FEMALE' | null }>
    position?: { x: number; y: number; z: number; yaw: number }
    anchorId?: string
  } = {},
) {
  const anchor = TABLES.find(t => t.id === options.anchorId) ?? TABLES[0]!
  let tickets = 0,
    connections = 0,
    active = 0,
    maxActive = 0,
    version = 0,
    channelVersion = 0,
    loggedIn = true
  const sent: {
      type: string
      payload: Record<string, unknown>
      requestId: string
    }[] = [],
    sockets: WebSocketRoute[] = []
  const position = {
    x: anchor.position[0],
    y: anchor.position[1] + 0.8,
    z: anchor.position[2] + 3,
    yaw: Math.PI,
    moving: false,
    running: false,
    swimming: false,
    lastInputSeq: 0,
    ...options.position,
  }
  let emoteResponse: 'approve' | 'reject' | 'hold' = 'approve'
  let emoteCounter = 0
  let lastEmote: { eventId: string; channelId: string; userId: string; emoteCode: string; sentAt: string } | undefined
  let emoteRequestId = ''
  let remotePosition: Partial<typeof position> = {}
  const publicProfiles = { ...options.publicProfiles }
  const publicEquipment: Record<string, PublicEquipment[] | null> = {}
  let rejectGameWatch = false
  let watchingGame = false
  let watchMode: 'normal' | 'reject' | 'hold' = 'normal', watchRequestId = '', selectorOverride: string | undefined, targetScore: number | null = null
  let seated = false,
    rejectChat = false
  let gameCode: string | null = null,
    ready = false,
    gameVersion = 0,
    startRevision = 0,
    started = false,
    finished = false,
    holdState = false,
    forbid = false
  const gameId = options.bridge ? 'fixture-confirmed-bridge' : options.onecard ? 'fixture-confirmed-onecard' : options.dice ? 'fixture-confirmed-dice' : 'fixture-confirmed-omok'
  let bridgeState = makeBridge(options.bridge), bridgeSecret: SecretDie | null = null
  const bridgeReplies: { input: object; patch: Partial<Bridge>; secret: SecretDie | null }[] = []
  const initialHand: Card[] = ['4', '7', 'K', 'Q', 'J', '2', 'A'].map(rank => ({ id: `hearts-${rank}`, suit: 'hearts', rank }))
  let cardState: OneCard = { gameCode: 'ONE_CARD', status: 'PLAYING', players: Array.from({ length: options.onecard ?? 2 }, (_, i) => ({ userId: String(101 + i), cardCount: 7,
    active: true, oneCardUntil: null, oneCardStatus: 'none' })), turnUserId: options.ownUserId ?? '101', turnDeadline: new Date(Date.now() + 30000).toISOString(), turnTimeLimitMs: 30000,
    direction: 1, stage: 'PLAYING', extraAction: false, topCard: { id: 'hearts-5', suit: 'hearts', rank: '5' }, activeSuit: 'hearts', drawCount: 54 - (options.onecard ?? 2) * 7 - 1,
    attackTotal: 0, lastAttack: null, turnCount: 1, winnerUserIds: [], endReason: null, endedAt: null }
  let cardHand: Hand = { userId: options.ownUserId ?? '101', hand: initialHand, playableCardIds: initialHand.map(c => c.id), canDraw: true }
  const cardReplies: { input: object; patch: Partial<OneCard>; hand: Hand }[] = []
  let diceState: Farkle = { gameCode: 'DICE', status: 'PLAYING', players: ['101', '102'], scores: [0, 0], targetScore: 4000,
    turnTimeLimitMs: 30000, turnUserId: '101', turnDeadline: new Date(Date.now() + 30000).toISOString(), turnScore: 0, dice: [],
    stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START', winnerUserId: null, endReason: null, endedAt: null }
  const diceReplies: { input: object; patch: Partial<Farkle> }[] = []
  let gameDeadline = new Date(Date.now() + 30_000).toISOString()
  let nextActionError: { code: string; message: string } | null = null
  let dropAction = false
  let finishReason = 'TURN_TIMEOUT', winner: string | null = '101'
  const board: number[][] = Array.from({ length: 15 }, () => Array(15).fill(0))
  let lastMove: { x: number; y: number; stone: string } | null = null,
    turn = '101'
  const omok = () => ({
    gameCode: 'OMOK',
    status: finished ? 'FINISHED' : 'PLAYING',
    boardSize: 15,
    board,
    blackUserId: '101',
    whiteUserId: '102',
    turnUserId: finished ? null : turn,
    turnDeadline: finished ? null : gameDeadline,
    moveCount: board.flat().filter(Boolean).length,
    lastMove,
    winnerUserId: finished ? winner : null,
    endReason: finished ? finishReason : null,
    endedAt: finished ? new Date().toISOString() : null,
  })
  const emit = (
    ws: WebSocketRoute,
    type: string,
    payload: object,
    requestId: string | null = null,
  ) => ws.send(JSON.stringify({ type, payload, requestId }))
  const start = (
    ws: WebSocketRoute,
    phase: string,
    requestId: string | null = null,
  ) => options.startEvents !== false &&
    emit(
      ws,
      'GAME_START_STATE',
      {
        tableId,
        revision: ++startRevision,
        phase,
        startAttemptId: phase === 'WAITING' ? null : 'fixture-attempt',
        gameCode,
        gameSessionId: started ? gameId : null,
        code: null,
        simulation: false,
      },
      requestId,
    )
  const game = (ws: WebSocketRoute, requestId: string | null = null, role = watchingGame ? 'SPECTATOR' : 'PLAYER') =>
    emit(
      ws,
      'GAME_STATE',
      {
        gameId,
        version: gameVersion,
        role,
        publicState: options.bridge ? bridgeState : options.onecard ? cardState : options.dice ? diceState : omok(),
        privateState: role === 'SPECTATOR' ? {} : options.bridge ? bridgeSecret ?? {} : options.onecard ? cardHand : {},
      },
      requestId,
    )
  const recovery = (ws: WebSocketRoute) =>
    emit(ws, 'GAME_CONNECTION_STATE', {
      status: 'RESTORED',
      gameId,
      version: gameVersion,
      state: options.bridge ? { publicState: bridgeState, privateState: bridgeSecret ?? {} } : options.onecard ? { publicState: cardState, privateState: cardHand } : options.dice ? diceState : omok(),
      reconnectUntil: null,
      code: null,
    })
  let resultVersion = 1,
    settled = false
  const result = (ws: WebSocketRoute, requestId: string | null = null) =>
    emit(
      ws,
      'GAME_RESULT',
      {
        version: resultVersion,
        gameSessionId: gameId,
        gameCode: options.bridge ? 'LIAR_BRIDGE' : options.onecard ? 'ONE_CARD' : options.dice ? 'DICE' : 'OMOK',
        status: 'FINISHED',
        endReason: 'NORMAL',
        settlementStatus: settled ? 'SETTLED' : 'PENDING',
        betAmountPerPlayer: 1,
        participants: [
          { userId: '101', result: 'WIN' },
          { userId: '102', result: 'LOSE' },
        ],
        myCoinDelta: settled ? 1 : null,
        endedAt: new Date().toISOString(),
      },
      requestId,
    )
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/refresh'))
      return route.fulfill({
        json: loggedIn ? { accessToken: 'fixture-access' } : {},
        status: loggedIn ? 200 : 401,
      })
    if (url.pathname.endsWith('/auth/logout')) {
      loggedIn = false
      return route.fulfill({ status: 204 })
    }
    if (url.pathname.endsWith('/auth/websocket-ticket')) {
      ++tickets
      expect(route.request().headers().authorization).toBe(
        'Bearer fixture-access',
      )
      return route.fulfill({
        json: { ticket: 'fixture-' + tickets, expiresIn: 30 },
      })
    }
    if (url.pathname === '/api/v1/users/me') {
      expect(route.request().headers().authorization).toBe(
        'Bearer fixture-access',
      )
      return route.fulfill({
        json: { userId: Number(options.ownUserId ?? '101'), nickname: '공원 산책자', characterGender: 'MALE' },
      })
    }
    if (url.pathname === '/api/v1/channels')
      return route.fulfill({
        json: {
          items: [
            {
              channelId: 'fixture-channel',
              name: '공원 01',
              currentUsers: options.players ?? 2,
              capacity: 16,
              joinable: true,
            },
          ],
        },
      })
    if (url.pathname === '/api/v1/tables')
      return route.fulfill({
        json: {
          tables: [
            {
              tableId,
              capacity: 2,
              occupiedSeats: seated ? 2 : 1,
              availableSeats: seated ? 0 : 1,
              readyCount: 0,
              minimumPlayers: 2,
              allReady: false,
              status: 'WAITING',
              joinable: !seated,
              gameCode: null,
              targetScore,
            },
          ],
        },
      })
    return route.fulfill({ status: 404, json: { code: 'NOT_IN_FIXTURE' } })
  })
  await page.route('**/park-bindings.json', (route) =>
    route.fulfill({
      json: {
        emotes: options.emoteBindings === 'development' ? developmentBindings.emotes
          : options.emoteBindings === false ? [] : [{ motion: 'EMOTE_CLAP', code: 'CLAP' }, { motion: 'EMOTE_WAVE', code: 'WAVE' }],
        bindings:
          options.bindings === false
            ? []
            : [{ channelId: 'fixture-channel', tableId, anchorId: anchor.id }],
      },
    }),
  )
  const world = (ws: WebSocketRoute, requestId: string | null = null) =>
    ws.send(
      JSON.stringify({
        requestId,
        type: 'WORLD_STATE',
        payload: {
          channelId: 'fixture-channel',
          version: ++version,
          mapVersion: options.mapVersion ?? EXPECTED_MAP_VERSION,
          avatars: Array.from({ length: options.players ?? 2 }, (_, i) => ({
            userId: String(101 + i),
            ...publicProfiles[String(101 + i)],
            equipment: publicEquipment[String(101 + i)] ?? null,
            position:
              i === 0
                ? position
                : {
                    ...position,
                    x: anchor.position[0] + (i % 4) * 2,
                    z: anchor.position[2] - 2 - Math.floor(i / 4) * 2,
                    ...(i === 1 ? remotePosition : {}),
                  },
          })),
        },
      }),
    )
  const table = (ws: WebSocketRoute, type: string, requestId: string | null) =>
    ws.send(
      JSON.stringify({
        requestId,
        type,
        payload: {
          tableId,
          version: ++version,
          capacity: options.m09 && !['OMOK', 'DICE'].includes(gameCode ?? '') ? 4 : 2,
          minimumPlayers: 2,
          seats: Array.from({ length: options.m09 && !['OMOK', 'DICE'].includes(gameCode ?? '') ? 4 : 2 }, (_, i) => ({
            seatNumber: i + 1, userId: i === 0 ? seated ? '101' : null : i === 1 ? '102' : null,
            ready: i === 0 ? ready : i === 1 && options.omok ? ready : false,
          })),
          allReady: ready,
          selectorUserId: selectorOverride ?? (seated ? '101' : '102'),
          gameCode,
          targetScore,
        },
      }),
    )
  const facilities = facilityFixture({
    emit: (type, payload, id = null) => emit(sockets.at(-1)!, type, payload, id),
    world: () => world(sockets.at(-1)!), position, userId: options.ownUserId ?? '101',
    remotePosition: pose => { remotePosition = pose },
  })
  await page.routeWebSocket('**/ws/tables?**', (ws) => {
    connections++
    active++
    maxActive = Math.max(maxActive, active)
    sockets.push(ws)
    ws.send(
      JSON.stringify({
        requestId: null,
        type: 'CONNECTED',
        payload: { userId: options.ownUserId ?? '101' },
      }),
    )
    if (options.omok)
      emit(ws, 'GAME_CONNECTION_STATE', {
        status: 'LOBBY',
        gameId: null,
        version: null,
        state: null,
        reconnectUntil: null,
        code: null,
      })
    ws.onClose(() => {
      active--
      facilities.disconnect()
    })
    ws.onMessage((data) => {
      const message = JSON.parse(String(data))
      sent.push(message)
      const { requestId, type, payload } = message
      if (facilities.handle(type, payload, requestId)) return
      if (type === 'CHANNEL_JOIN') {
        ws.send(
          JSON.stringify({
            requestId,
            type: 'CHANNEL_STATE',
            payload: {
              channelId: 'fixture-channel',
              name: '공원 01',
              version: ++channelVersion,
              capacity: 16,
              currentUsers: options.players ?? 2,
              userIds: Array.from({ length: options.players ?? 2 }, (_, i) =>
                String(101 + i),
              ),
            },
          }),
        )
        world(ws)
      }
      if (type === 'WORLD_MOVE') {
        Object.assign(position, {
          ...(!options.manualMovement ? {
            x: position.x + Number(payload.dx) * 0.1,
            z: position.z + Number(payload.dz) * 0.1,
            moving: !!(payload.dx || payload.dz),
            running: payload.run,
          } : {}),
          lastInputSeq: payload.seq,
        })
        world(ws, requestId)
      }
      if (type === 'WORLD_CHAT_SEND') {
        ws.send(
          JSON.stringify(
            rejectChat
              ? {
                  requestId,
                  type: 'ERROR',
                  payload: {
                    code: 'CHAT_TOO_FREQUENT',
                    message: '잠시 후 다시 보내주세요.',
                  },
                }
              : {
                  requestId,
                  type: 'WORLD_CHAT_MESSAGE',
                  payload: {
                    messageId: 'fixture-message-' + sent.length,
                    channelId: 'fixture-channel',
                    userId: '101',
                    text: payload.text,
                    sentAt: '2026-10-22T00:00:00Z',
                  },
                },
          ),
        )
      }
      if (type === 'WORLD_EMOTE_SEND') {
        emoteRequestId = requestId
        lastEmote = { eventId: `fixture-emote-${++emoteCounter}-${Date.now()}`, channelId: 'fixture-channel',
          userId: options.ownUserId ?? '101', emoteCode: payload.emoteCode, sentAt: new Date().toISOString() }
        if (emoteResponse === 'approve') emit(ws, 'WORLD_EMOTE_EVENT', lastEmote, requestId)
        if (emoteResponse === 'reject') emit(ws, 'ERROR', { code: 'EMOTE_NOT_SUPPORTED', message: '등록되지 않은 감정표현입니다.' }, requestId)
      }
      if (type === 'TABLE_WATCH') {
        watchRequestId = requestId
        if (watchMode === 'reject') emit(ws, 'ERROR', { code: 'TABLE_OUT_OF_RANGE', message: '테이블 관전 범위를 확인해주세요.' }, requestId)
        if (watchMode === 'normal') table(ws, 'TABLE_WATCH_STATE', requestId)
      }
      if (options.m09 && type === 'GAME_WATCH') {
        if (rejectGameWatch) emit(ws, 'ERROR', { code: 'GAME_STATE_ACCESS_DENIED', message: '경기 관전 권한이 없습니다.' }, requestId)
        else { watchingGame = true; game(ws, requestId, 'SPECTATOR') }
      }
      if (options.m09 && type === 'GAME_UNWATCH') { watchingGame = false; emit(ws, 'GAME_WATCH_LEFT', { gameId }, requestId) }
      if (type === 'TABLE_UNWATCH')
        ws.send(
          JSON.stringify({
            requestId,
            type: 'TABLE_WATCH_LEFT',
            payload: { tableId },
          }),
        )
      if (type === 'TABLE_JOIN') {
        seated = true
        ws.send(
          JSON.stringify({
            requestId: null,
            type: 'TABLE_WATCH_LEFT',
            payload: { tableId },
          }),
        )
        table(ws, 'TABLE_STATE', requestId)
      }
      if (type === 'TABLE_LEAVE') {
        seated = false
        ws.send(
          JSON.stringify({
            requestId,
            type: 'TABLE_LEFT',
            payload: { tableId },
          }),
        )
        world(ws)
      }
      if (options.omok && type === 'GAME_SELECT') {
        gameCode = String(payload.gameCode)
        targetScore = payload.targetScore ?? null
        if (options.dice && gameCode === 'DICE') diceState = { ...diceState, targetScore: targetScore ?? 4000 }
        ready = false
        table(ws, 'TABLE_STATE', requestId)
        start(ws, 'WAITING')
      }
      if (options.omok && type === 'READY_SET') {
        ready = payload.ready
        table(ws, 'TABLE_STATE', requestId)
        if (ready) start(ws, 'STARTING')
      }
      if (options.omok && type === 'GAME_START_CHECK')
        start(ws, started ? 'PLAYING' : 'STARTING', requestId)
      if (options.omok && type === 'GAME_STATE_CHECK') game(ws, requestId)
      if (options.omok && type === 'GAME_RECONNECT_CHECK') recovery(ws)
      if (options.omok && type === 'GAME_RESULT_CHECK') result(ws, requestId)
      if (options.omok && type === 'GAME_ACTION_SEND') {
        if (dropAction) return
        if (nextActionError) {
          const error = nextActionError; nextActionError = null
          emit(ws, 'ERROR', error, requestId)
          return
        }
        if (options.bridge) {
          const reply = bridgeReplies.shift(); expect(reply, 'Explicitly script each approved bridge response').toBeTruthy(); expect(payload.input).toEqual(reply!.input)
          bridgeState = { ...bridgeState, ...reply!.patch }; bridgeSecret = reply!.secret; gameVersion++
          emit(ws, 'GAME_ACTION_RESULT', { gameId, actionId: payload.actionId, version: gameVersion }, requestId)
          if (!holdState) game(ws)
          return
        }
        if (options.onecard) {
          const reply = cardReplies.shift()
          expect(reply, 'Explicitly script each approved one-card response').toBeTruthy()
          expect(payload.input).toEqual(reply!.input)
          cardState = { ...cardState, ...reply!.patch }; cardHand = reply!.hand; gameVersion++
          emit(ws, 'GAME_ACTION_RESULT', { gameId, actionId: payload.actionId, version: gameVersion }, requestId)
          if (!holdState) game(ws)
          return
        }
        if (options.dice) {
          const reply = diceReplies.shift()
          expect(reply, 'A test must explicitly script each server dice response').toBeTruthy()
          expect(payload.input).toEqual(reply!.input)
          diceState = { ...diceState, ...reply!.patch }; gameVersion++
          emit(ws, 'GAME_ACTION_RESULT', { gameId, actionId: payload.actionId, version: gameVersion }, requestId)
          if (!holdState) game(ws)
          return
        }
        if (forbid) {
          forbid = false
          emit(
            ws,
            'ERROR',
            {
              code: 'GAME_ACTION_FORBIDDEN_MOVE',
              message: '금수입니다. 다른 곳에 놓아주세요.',
            },
            requestId,
          )
          return
        }
        const { x, y } = payload.input
        board[y]![x] = options.ownUserId === '102' ? 2 : 1
        lastMove = { x, y, stone: options.ownUserId === '102' ? 'WHITE' : 'BLACK' }
        turn = options.ownUserId === '102' ? '101' : '102'
        gameVersion++
        emit(
          ws,
          'GAME_ACTION_RESULT',
          { gameId, actionId: payload.actionId, version: gameVersion },
          requestId,
        )
        if (!holdState) game(ws)
      }
    })
  })
  return {
    sent,
    equipment: (userId: string, equipment: PublicEquipment[] | null) => {
      publicEquipment[userId] = equipment
      for (const ws of sockets) world(ws)
    },
    facilities,
    bridgeReply: (input: object, patch: Partial<Bridge>, secret: SecretDie | null = null) => bridgeReplies.push({ input, patch, secret }),
    bridgeSnapshot: (patch: Partial<Bridge>, secret: SecretDie | null = null, role = 'PLAYER') => { bridgeState = { ...bridgeState, ...patch }; bridgeSecret = secret; gameVersion++; game(sockets.at(-1)!, null, role) },
    bridgeState: () => structuredClone(bridgeState),
    cardReply: (input: object, patch: Partial<OneCard>, hand: Hand) => { cardReplies.push({ input, patch, hand }) },
    cardSnapshot: (patch: Partial<OneCard>, hand = cardHand, role = 'PLAYER') => { cardState = { ...cardState, ...patch }; cardHand = hand; gameVersion++; game(sockets.at(-1)!, null, role) },
    cardState: () => structuredClone(cardState),
    cardHand: () => structuredClone(cardHand),
    diceReply: (input: object, patch: Partial<Farkle>) => { diceReplies.push({ input, patch }) },
    diceSnapshot: (patch: Partial<Farkle>, role = 'PLAYER') => { diceState = { ...diceState, ...patch }; gameVersion++; game(sockets.at(-1)!, null, role) },
    rejectNextAction: (code: string, message: string) => { nextActionError = { code, message } },
    dropActions: (value: boolean) => { dropAction = value },
    turnTo: (userId: string, deadline = new Date(Date.now() + 30_000).toISOString()) => {
      turn = userId; gameDeadline = deadline; gameVersion++; game(sockets.at(-1)!)
    },
    resendGame: (role = 'PLAYER') => game(sockets.at(-1)!, null, role),
    rejectGameWatch: (value: boolean) => { rejectGameWatch = value },
    watchMode: (mode: typeof watchMode) => { watchMode = mode },
    replyWatch: () => table(sockets.at(-1)!, 'TABLE_WATCH_STATE', watchRequestId),
    host: (id: string) => { selectorOverride = id; table(sockets.at(-1)!, 'TABLE_STATE', null) },
    confirmStart: () => {
      started = true
      gameDeadline = new Date(Date.now() + 30_000).toISOString()
      if (options.dice) diceState = { ...diceState, turnDeadline: gameDeadline }
      if (options.onecard) cardState = { ...cardState, turnDeadline: gameDeadline }
      if (options.bridge) bridgeState = { ...bridgeState, turnDeadline: gameDeadline }
      start(sockets.at(-1)!, 'PLAYING')
      recovery(sockets.at(-1)!)
    },
    forbidNext: () => {
      forbid = true
    },
    holdState: (value: boolean) => {
      holdState = value
    },
    flushGame: () => game(sockets.at(-1)!),
    opponentMove: () => {
      board[6]![6] = 2
      lastMove = { x: 6, y: 6, stone: 'WHITE' }
      turn = '101'
      gameVersion++
      game(sockets.at(-1)!)
    },
    recoveryPending: () =>
      emit(sockets.at(-1)!, 'GAME_CONNECTION_STATE', {
        status: 'PENDING',
        gameId: null,
        version: null,
        state: null,
        reconnectUntil: null,
        code: null,
      }),
    restoreGame: () => recovery(sockets.at(-1)!),
    finishGame: (reason = 'TURN_TIMEOUT', winnerId: string | null = '101') => {
      finished = true
      finishReason = reason; winner = winnerId
      gameVersion++
      game(sockets.at(-1)!)
      // Start/settlement lifecycle is participant-only; a public watcher has no own start state.
      if (seated) start(sockets.at(-1)!, 'SETTLING')
    },
    settle: () => {
      settled = true
      resultVersion++
      result(sockets.at(-1)!)
    },
    nextRound: () => {
      started = false
      ready = false
      table(sockets.at(-1)!, 'TABLE_STATE', null)
      start(sockets.at(-1)!, 'WAITING')
    },
    // Synthetic public render workload only; does not test Renju legality or a real game result.
    renderBoard: (count: number) => {
      started = true
      finished = true
      for (let i = 0; i < 225; i++)
        board[Math.floor(i / 15)]![i % 15] = i < count ? (i % 2) + 1 : 0
      lastMove = count
        ? {
            x: (count - 1) % 15,
            y: Math.floor((count - 1) / 15),
            stone: (count - 1) % 2 ? 'WHITE' : 'BLACK',
          }
        : null
      gameVersion++
      start(sockets.at(-1)!, 'SETTLING')
      recovery(sockets.at(-1)!)
    },
    get tickets() {
      return tickets
    },
    get connections() {
      return connections
    },
    get active() {
      return active
    },
    get maxActive() {
      return maxActive
    },
    rejectChat: () => {
      rejectChat = true
    },
    close: (code: number) =>
      sockets.at(-1)!.close({ code, reason: 'Fixture close' }),
    endSession: () => {
      loggedIn = false
      sockets.at(-1)!.close({ code: 4401, reason: 'Login session ended' })
    },
    world: () => world(sockets.at(-1)!),
    profile: (userId: string, profile: NonNullable<typeof options.publicProfiles>[string]) => {
      publicProfiles[userId] = profile; world(sockets.at(-1)!)
    },
    chatFrom: (userId: string, text: string) => emit(sockets.at(-1)!, 'WORLD_CHAT_MESSAGE', {
      channelId: 'fixture-channel', userId, text, messageId: `fixture-chat-${version}`, sentAt: new Date().toISOString(),
    }),
    emoteResponse: (response: typeof emoteResponse) => { emoteResponse = response },
    completeEmote: () => { if (lastEmote) emit(sockets.at(-1)!, 'WORLD_EMOTE_EVENT', lastEmote, emoteRequestId) },
    lastEmote: () => lastEmote,
    emote: (event: NonNullable<typeof lastEmote>) => emit(sockets.at(-1)!, 'WORLD_EMOTE_EVENT', event),

    players: (count: number) => { options.players = count; world(sockets.at(-1)!) },
    pose: (patch: Partial<typeof position>) => { Object.assign(position, patch); world(sockets.at(-1)!) },
    remotePose: (patch: Partial<typeof position>) => { remotePosition = { ...remotePosition, ...patch }; world(sockets.at(-1)!) },
  }
}
