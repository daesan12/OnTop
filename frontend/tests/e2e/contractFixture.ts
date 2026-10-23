import { expect, type Page, type WebSocketRoute } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { TABLES } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

// Contract fixtures intercept HTTP/RawWS only in tests. No production fake-auth or socket bypass.
const anchor = TABLES[0]!
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
    manualMovement?: boolean
    position?: { x: number; y: number; z: number; yaw: number }
  } = {},
) {
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
  let remotePosition: Partial<typeof position> = {}
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
  const gameId = 'fixture-confirmed-omok'
  let gameDeadline = new Date(Date.now() + 30_000).toISOString()
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
    winnerUserId: finished ? '101' : null,
    endReason: finished ? 'TURN_TIMEOUT' : null,
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
  ) =>
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
  const game = (ws: WebSocketRoute, requestId: string | null = null) =>
    emit(
      ws,
      'GAME_STATE',
      {
        gameId,
        version: gameVersion,
        role: 'PLAYER',
        publicState: omok(),
        privateState: {},
      },
      requestId,
    )
  const recovery = (ws: WebSocketRoute) =>
    emit(ws, 'GAME_CONNECTION_STATE', {
      status: 'RESTORED',
      gameId,
      version: gameVersion,
      state: omok(),
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
        gameCode: 'OMOK',
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
        json: { userId: 101, nickname: '공원 산책자', characterGender: 'MALE' },
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
              targetScore: null,
            },
          ],
        },
      })
    return route.fulfill({ status: 404, json: { code: 'NOT_IN_FIXTURE' } })
  })
  await page.route('**/park-bindings.json', (route) =>
    route.fulfill({
      json: {
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
          capacity: 2,
          minimumPlayers: 2,
          seats: [
            { seatNumber: 1, userId: seated ? '101' : null, ready },
            {
              seatNumber: 2,
              userId: '102',
              ready: options.omok ? ready : false,
            },
          ],
          allReady: ready,
          selectorUserId: seated ? '101' : '102',
          gameCode,
          targetScore: null,
        },
      }),
    )
  await page.routeWebSocket('**/ws/tables?**', (ws) => {
    connections++
    active++
    maxActive = Math.max(maxActive, active)
    sockets.push(ws)
    ws.send(
      JSON.stringify({
        requestId: null,
        type: 'CONNECTED',
        payload: { userId: '101' },
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
    })
    ws.onMessage((data) => {
      const message = JSON.parse(String(data))
      sent.push(message)
      const { requestId, type, payload } = message
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
      if (type === 'TABLE_WATCH') table(ws, 'TABLE_WATCH_STATE', requestId)
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
        board[y]![x] = 1
        lastMove = { x, y, stone: 'BLACK' }
        turn = '102'
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
    confirmStart: () => {
      started = true
      gameDeadline = new Date(Date.now() + 30_000).toISOString()
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
    finishGame: () => {
      finished = true
      gameVersion++
      game(sockets.at(-1)!)
      start(sockets.at(-1)!, 'SETTLING')
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
    players: (count: number) => { options.players = count; world(sockets.at(-1)!) },
    pose: (patch: Partial<typeof position>) => { Object.assign(position, patch); world(sockets.at(-1)!) },
    remotePose: (patch: Partial<typeof position>) => { remotePosition = { ...remotePosition, ...patch }; world(sockets.at(-1)!) },
  }
}
