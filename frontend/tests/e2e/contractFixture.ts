import { expect, type Page, type WebSocketRoute } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { TABLES } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import type { Farkle, Result } from '../../src/game/protocol'
import type { OneCard, Hand, Card } from '../../src/game/onecard/protocol'
import { bridgeState as makeBridge } from '../fixtures/bridge'
import type { Bridge, SecretDie } from '../../src/game/bridge/protocol'
import { facilityFixture } from './facilityFixture'
import { followFixture } from './followFixture'
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
    publicSpectator?: boolean
    forfeit?: boolean
    manualLobby?: boolean
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
  let emoteCounter = 0, chatCounter = 0
  let lastEmote: { eventId: string; channelId: string; userId: string; emoteCode: string; sentAt: string } | undefined
  let emoteRequestId = ''
  let remotePosition: Partial<typeof position> = {}
  const publicProfiles = { ...options.publicProfiles }
  const publicEquipment: Record<string, PublicEquipment[] | null> = {}
  let rejectGameWatch = false
  let watchingGame = false
  let watchMode: 'normal' | 'reject' | 'hold' = 'normal', watchRequestId = '', selectorOverride: string | undefined, targetScore: number | null = null
  let betAmountPerPlayer: number | null = options.publicSpectator ? 1 : null
  let tabletCount = 2, tabletOthersReady = false
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
  let gameId = options.bridge ? 'fixture-confirmed-bridge' : options.onecard ? 'fixture-confirmed-onecard' : options.dice ? 'fixture-confirmed-dice' : 'fixture-confirmed-omok'
  let publicGameId: string | null = options.publicSpectator ? gameId : null
  let watchingGameId = '', holdGameWatch = false
  const heldGameWatches: { requestId: string; gameId: string }[] = []
  if (options.publicSpectator) gameCode = options.bridge ? 'LIAR_BRIDGE' : options.onecard ? 'ONE_CARD' : options.dice ? 'DICE' : 'OMOK'
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
  let forfeitMode: 'approve' | 'hold' | 'drop' | 'reject' | 'malformed' | 'lost-after-apply' | 'receipt-only' = 'approve'
  let forfeitOrder: 'receipt-first' | 'state-first' = 'state-first', forfeitCode = 'GAME_FORFEIT_NOT_CONFIGURED'
  let forfeitVersion = -1, forfeitApplications = 0, recoveryStatus = 'RESTORED', pendingBridgeForfeit = false
  const heldForfeits: { ws: WebSocketRoute; requestId: string; payload: { gameId: string; actionId: string } }[] = []
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
  const game = (ws: WebSocketRoute, requestId: string | null = null, role = watchingGame ? 'SPECTATOR' : 'PLAYER', displayedId = gameId) =>
    emit(
      ws,
      'GAME_STATE',
      {
        gameId: displayedId,
        version: gameVersion,
        role,
        publicState: options.bridge ? bridgeState : options.onecard ? cardState : options.dice ? diceState : omok(),
        privateState: role === 'SPECTATOR' ? {} : options.bridge ? bridgeSecret ?? {} : options.onecard ? cardHand : {},
      },
      requestId,
    )
  const recovery = (ws: WebSocketRoute, requestId: string | null = null) =>
    emit(ws, 'GAME_CONNECTION_STATE', {
      status: options.forfeit ? recoveryStatus : 'RESTORED',
      gameId,
      version: gameVersion,
      state: options.bridge ? { publicState: bridgeState, privateState: bridgeSecret ?? {} } : options.onecard ? { publicState: cardState, privateState: cardHand } : options.dice ? diceState : omok(),
      reconnectUntil: null,
      code: null,
    }, requestId)
  let resultVersion = 1,
    settled = false
  let resultStatus: Result['status'] = 'FINISHED', resultReason = 'NORMAL', resultBet = 1
  let invalidVerdicts = false
  const resultEndedAt = new Date().toISOString()
  // Scripted single-winner, all-winner and draw results only; never a production payout calculator.
  const resultPayload = (): Result => {
    const ids = Array.from({ length: options.onecard ?? options.bridge ?? 2 }, (_, i) => String(101 + i))
    const state = options.bridge ? bridgeState : options.onecard ? cardState : options.dice ? diceState : omok()
    const winnerIds = options.forfeit && forfeitVersion >= 0 ? ['102']
      : options.bridge ? bridgeState.winnerUserIds : options.onecard ? cardState.winnerUserIds
      : (options.dice ? diceState.winnerUserId : winner) ? [options.dice ? diceState.winnerUserId! : winner!] : []
    const allWin = winnerIds.length === ids.length
    if (winnerIds.length > 1 && !allWin) throw new Error('부분 공동 승리에는 명시적인 서버 정산 fixture가 필요합니다.')
    const own = options.ownUserId ?? '101'
    const coinDelta = allWin || !winnerIds.length ? 0 : winnerIds.includes(own) ? resultBet * (ids.length - 1) : -resultBet
    return {
    version: resultVersion, gameSessionId: gameId,
    gameCode: options.bridge ? 'LIAR_BRIDGE' : options.onecard ? 'ONE_CARD' : options.dice ? 'DICE' : 'OMOK',
    status: resultStatus, endReason: resultStatus === 'INVALID' ? resultReason : state.endReason ?? resultReason,
    settlementStatus: settled ? 'SETTLED' : 'PENDING',
    betAmountPerPlayer: resultBet,
    participants: ids.map(userId => ({
      userId, result: resultStatus === 'INVALID' ? invalidVerdicts ? 'FORFEIT' : null
        : options.forfeit && forfeitVersion >= 0 && userId === '101' ? 'FORFEIT'
        : !winnerIds.length ? 'DRAW' : winnerIds.includes(userId) ? 'WIN' : 'LOSE',
    })),
    myCoinDelta: !settled ? null : resultStatus === 'INVALID' ? 0 : coinDelta,
    endedAt: resultEndedAt,
    }
  }
  const result = (ws: WebSocketRoute, requestId: string | null = null) =>
    emit(
      ws,
      'GAME_RESULT',
      resultPayload(),
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
    if (url.pathname === '/api/v1/wallets/me') return route.fulfill({ json: { balance: 100, reservedBalance: 0, availableBalance: 100 } })
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
              betAmountPerPlayer,
              ...(options.publicSpectator ? { gameId: publicGameId } : {}),
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
  const table = (ws: WebSocketRoute, type: string, requestId: string | null, patch: object = {}) =>
    ws.send(
      JSON.stringify({
        requestId,
        type,
        payload: {
          tableId,
          version: ++version,
          capacity: options.manualLobby ? tabletCount : options.m09 && !['OMOK', 'DICE'].includes(gameCode ?? '') ? 4 : 2,
          minimumPlayers: 2,
          seats: Array.from({ length: options.manualLobby ? tabletCount : options.m09 && !['OMOK', 'DICE'].includes(gameCode ?? '') ? 4 : 2 }, (_, i) => ({
            seatNumber: i + 1, userId: i === 0 ? seated ? '101' : null : options.manualLobby ? String(101 + i) : i === 1 ? '102' : null,
            ready: i === 0 ? ready : options.manualLobby ? tabletOthersReady : i === 1 && options.omok ? ready : false,
          })),
          allReady: ready && (!options.manualLobby || tabletOthersReady),
          selectorUserId: selectorOverride ?? (seated ? '101' : '102'),
          gameCode,
          targetScore,
          betAmountPerPlayer,
          ...(options.publicSpectator ? { gameId: publicGameId } : {}),
          ...patch,
        },
      }),
    )
  const facilities = facilityFixture({
    emit: (type, payload, id = null) => emit(sockets.at(-1)!, type, payload, id),
    world: () => world(sockets.at(-1)!), position, userId: options.ownUserId ?? '101',
    remotePosition: pose => { remotePosition = pose },
  })
  // Explicit public/private test snapshots for the BE contract, not a local game engine.
  const scriptedForfeitState = () => {
    if (forfeitVersion >= 0) return
    forfeitApplications++; gameVersion++; forfeitVersion = gameVersion
    finished = !(options.onecard && options.onecard > 2 || options.bridge && options.bridge > 2 || pendingBridgeForfeit)
    finishReason = 'EXPLICIT_LEAVE'; winner = '102'; recoveryStatus = finished ? 'FINISHED' : 'ELIMINATED'
    if (options.dice) diceState = { ...diceState, status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null,
      winnerUserId: '102', endReason: 'EXPLICIT_LEAVE', endedAt: new Date().toISOString() }
    if (options.onecard) {
      cardHand = { userId: '101', hand: [], playableCardIds: [], canDraw: false }
      cardState = { ...cardState, players: cardState.players.map(p => p.userId === '101' ? { ...p, active: false, cardCount: 0 } : p),
        turnUserId: finished ? null : '102', ...(finished ? { status: 'FINISHED', stage: 'FINISHED', turnDeadline: null,
          winnerUserIds: ['102'], endReason: 'LAST_PLAYER_STANDING', endedAt: new Date().toISOString() } : {}) }
    }
    if (options.bridge) {
      bridgeSecret = null
      bridgeState = { ...bridgeState, players: bridgeState.players.map(p => p.userId !== '101' ? p : pendingBridgeForfeit
        ? { ...p, pendingForfeit: true } : { ...p, forfeited: true, pawns: p.pawns.map(pawn => ({ ...pawn, status: 'FORFEITED' })) }),
        lastEvent: 'PLAYER_LEFT', ...(pendingBridgeForfeit ? { stage: 'RESPONDING', declaration: 2, responderUserId: '102', responseOrder: ['102'] }
          : { turnUserId: finished ? null : '102', ...(finished ? { status: 'FINISHED', stage: 'FINISHED', turnDeadline: null,
            winnerUserIds: ['102'], endReason: 'LAST_PLAYER_STANDING', endedAt: new Date().toISOString() } : {}) }) }
    }
  }
  const approveForfeit = (entry: typeof heldForfeits[number], mode = forfeitMode) => {
    const duplicate = forfeitVersion >= 0
    scriptedForfeitState()
    const state = () => { recovery(entry.ws); game(entry.ws); if (finished) start(entry.ws, 'SETTLING') }
    const receipt = () => emit(entry.ws, 'GAME_FORFEIT_RESULT', { gameId: mode === 'malformed' ? 'foreign-game' : entry.payload.gameId,
      actionId: entry.payload.actionId, version: forfeitVersion, duplicate }, entry.requestId)
    if (mode === 'lost-after-apply') { state(); return }
    if (mode === 'receipt-only') { receipt(); return }
    if (forfeitOrder === 'state-first') { state(); receipt() } else { receipt(); state() }
  }
  const follow = followFixture((type, payload, id = null) => emit(sockets.at(-1)!, type, payload, id), options.ownUserId ?? '101')
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
    if (options.forfeit && started) recovery(ws)
    else if (options.omok)
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
      follow.disconnect()
    })
    ws.onMessage((data) => {
      const message = JSON.parse(String(data))
      sent.push(message)
      const { requestId, type, payload } = message
      if (facilities.handle(type, payload, requestId)) return
      if (follow.handle(type, payload, requestId)) return
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
        if (options.forfeit && started) { table(ws, 'TABLE_STATE', null); start(ws, finished ? 'SETTLING' : 'PLAYING') }
      }
      if (type === 'WORLD_MOVE') {
        if (payload.dx || payload.dz || payload.jump) follow.release()
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
      if ((options.m09 || options.publicSpectator) && type === 'GAME_WATCH') {
        if (rejectGameWatch) emit(ws, 'ERROR', { code: 'GAME_STATE_ACCESS_DENIED', message: '경기 관전 권한이 없습니다.' }, requestId)
        else if (holdGameWatch) { heldGameWatches.push({ requestId, gameId: String(payload.gameId) }); watchingGameId = String(payload.gameId) }
        else { watchingGame = true; watchingGameId = String(payload.gameId); game(ws, requestId, 'SPECTATOR', watchingGameId) }
      }
      if ((options.m09 || options.publicSpectator) && type === 'GAME_UNWATCH') {
        const previousId = watchingGameId || gameId; watchingGame = false; watchingGameId = ''
        for (const pending of heldGameWatches) emit(ws, 'ERROR', { code: 'GAME_WATCH_CANCELLED', message: '관전 취소' }, pending.requestId)
        emit(ws, 'GAME_WATCH_LEFT', { gameId: previousId }, requestId)
      }
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
        betAmountPerPlayer = payload.betAmountPerPlayer
        if (options.dice && gameCode === 'DICE') diceState = { ...diceState, targetScore: targetScore ?? 4000 }
        ready = false
        table(ws, 'TABLE_STATE', requestId)
        start(ws, 'WAITING')
      }
      if (options.omok && type === 'READY_SET') {
        ready = payload.ready
        table(ws, 'TABLE_STATE', requestId)
        if (ready && !options.manualLobby) start(ws, 'STARTING')
      }
      if (options.omok && type === 'GAME_START_CHECK')
        start(ws, started ? 'PLAYING' : 'STARTING', requestId)
      if (options.omok && type === 'GAME_STATE_CHECK') game(ws, requestId)
      if (options.omok && type === 'GAME_RECONNECT_CHECK') recovery(ws, requestId)
      if (options.forfeit && type === 'GAME_FORFEIT') {
        const entry = { ws, requestId, payload }
        if (forfeitMode === 'hold') heldForfeits.push(entry)
        else if (forfeitMode === 'reject') emit(ws, 'ERROR', { code: forfeitCode, message: '기권 요청 거절' }, requestId)
        else if (forfeitMode !== 'drop') approveForfeit(entry)
      }
      if (options.omok && type === 'GAME_RESULT_CHECK') {
        if (payload.gameSessionId === gameId) result(ws, requestId)
        else emit(ws, 'ERROR', { code: 'GAME_RESULT_ACCESS_DENIED', message: '본인 경기 결과만 확인할 수 있습니다.' }, requestId)
      }
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
    follow,
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
    holdGameWatch: (value: boolean) => { holdGameWatch = value },
    lateGameWatch: () => { for (const pending of heldGameWatches.splice(0)) game(sockets.at(-1)!, pending.requestId, 'SPECTATOR', pending.gameId) },
    publicMatch: (id: string | null) => {
      publicGameId = id
      if (id) { gameId = id; gameVersion = 0; finished = false }
      table(sockets.at(-1)!, 'TABLE_WATCH_STATE', null)
    },
    stalePublicMatch: (id: string | null) => table(sockets.at(-1)!, 'TABLE_WATCH_STATE', null, { version: 0, gameId: id }),
    latePublicGame: (id: string) => game(sockets.at(-1)!, null, 'SPECTATOR', id),
    publicMoveForRefresh: () => { board[7]![7] = 1; lastMove = { x: 7, y: 7, stone: 'BLACK' }; turn = '102'; gameVersion++ },
    revokeWatch: () => { watchingGame = false; emit(sockets.at(-1)!, 'ERROR', { code: 'GAME_STATE_ACCESS_DENIED', message: '관전 권한 회수' }) },
    watchMode: (mode: typeof watchMode) => { watchMode = mode },
    replyWatch: () => table(sockets.at(-1)!, 'TABLE_WATCH_STATE', watchRequestId),
    host: (id: string) => { selectorOverride = id; table(sockets.at(-1)!, 'TABLE_STATE', null) },
    configureTablet: (selection: { gameCode: string; playerCount: number; betAmountPerPlayer: number; targetScore?: number }) => {
      gameCode = selection.gameCode; tabletCount = selection.playerCount; betAmountPerPlayer = selection.betAmountPerPlayer
      targetScore = selection.targetScore ?? null; ready = false; tabletOthersReady = false
      table(sockets.at(-1)!, 'TABLE_STATE', null); start(sockets.at(-1)!, 'WAITING')
    },
    readyTabletOthers: (value: boolean) => { tabletOthersReady = value; table(sockets.at(-1)!, 'TABLE_STATE', null) },
    confirmStart: () => {
      started = true
      resultBet = betAmountPerPlayer ?? 1
      resultStatus = 'FINISHED'; resultReason = 'NORMAL'; resultVersion = 1; settled = false
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
    storeInvalidResult: (settlementStatus: Result['settlementStatus'] = 'PENDING', forfeitVerdicts = false) => {
      resultStatus = 'INVALID'; resultReason = forfeitVerdicts ? 'ABORTED_NO_PLAYERS' : 'ENGINE_LOST'
      invalidVerdicts = forfeitVerdicts; settled = settlementStatus === 'SETTLED'; resultVersion = settled ? 2 : 1
      return resultPayload()
    },
    notifyResult: (payload: Result) => emit(sockets.at(-1)!, 'GAME_RESULT', payload),
    nextRound: () => {
      if (options.forfeit) {
        gameId += '-next'; gameVersion = 0; forfeitVersion = -1; finished = false; recoveryStatus = 'RESTORED'
        turn = '101'; forfeitMode = 'approve'; bridgeState = makeBridge(options.bridge)
        diceState = { ...diceState, status: 'PLAYING', stage: 'AWAITING_ROLL', turnUserId: '101', turnDeadline: new Date(Date.now() + 30000).toISOString(), winnerUserId: null, endedAt: null, endReason: null }
        cardHand = { userId: '101', hand: initialHand, playableCardIds: initialHand.map(c => c.id), canDraw: true }
        cardState = { ...cardState, status: 'PLAYING', stage: 'PLAYING', players: cardState.players.map(p => ({ ...p, active: true, cardCount: 7 })),
          turnUserId: '101', turnDeadline: new Date(Date.now() + 30000).toISOString(), winnerUserIds: [], endReason: null, endedAt: null }
      }
      started = false
      ready = false
      table(sockets.at(-1)!, 'TABLE_STATE', null)
      start(sockets.at(-1)!, 'WAITING')
    },
    forfeitMode: (mode: typeof forfeitMode, code = 'GAME_FORFEIT_NOT_CONFIGURED') => { forfeitMode = mode; forfeitCode = code },
    forfeitOrder: (order: typeof forfeitOrder) => { forfeitOrder = order },
    completeForfeit: () => { for (const entry of heldForfeits.splice(0)) approveForfeit(entry, 'approve') },
    forfeitPendingBridge: () => { pendingBridgeForfeit = true },
    lateForfeitError: (requestId: string) => emit(sockets.at(-1)!, 'ERROR', { code: 'GAME_RECOVERY_REQUIRED', message: '이전 기권 오류' }, requestId),
    lateForfeitReceipt: (gameId: string, actionId: string) => emit(sockets.at(-1)!, 'GAME_FORFEIT_RESULT', { gameId, actionId, version: 1, duplicate: true }),
    get forfeitApplications() { return forfeitApplications },
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
      channelId: 'fixture-channel', userId, text, messageId: `fixture-chat-${++chatCounter}`, sentAt: new Date().toISOString(),
    }),
    emoteResponse: (response: typeof emoteResponse) => { emoteResponse = response },
    completeEmote: () => { if (lastEmote) emit(sockets.at(-1)!, 'WORLD_EMOTE_EVENT', lastEmote, emoteRequestId) },
    lastEmote: () => lastEmote,
    emote: (event: NonNullable<typeof lastEmote>) => emit(sockets.at(-1)!, 'WORLD_EMOTE_EVENT', event),
    cancelEmote: (event: object) => emit(sockets.at(-1)!, 'WORLD_EMOTE_CANCELLED', event),

    players: (count: number) => { options.players = count; world(sockets.at(-1)!) },
    pose: (patch: Partial<typeof position>) => { Object.assign(position, patch); world(sockets.at(-1)!) },
    remotePose: (patch: Partial<typeof position>) => { remotePosition = { ...remotePosition, ...patch }; world(sockets.at(-1)!) },
  }
}
