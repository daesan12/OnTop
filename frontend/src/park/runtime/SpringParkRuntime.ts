import {
  clearAuthSession,
  getAuthSession,
  restoreAuthSession,
} from '../../auth/authFlow'
import { SharedSocket, ServerError } from '../../network/socketClient'
import {
  channel,
  record,
  tableSummary,
  userProfile,
  type Envelope,
} from '../../network/protocol'
import { bindAnchor, parseBindings } from '../../network/tableBindings'
import { setDisplayProfiles } from '../../network/profileBridge'
import { canPlace, canPlayDice, receiveGame, tableBusy, useGame } from '../../game/store'
import { gameState } from '../../game/protocol'
import { validDiceAction } from '../../game/farkle/scoring'
import { canActOneCard } from '../../game/onecard/actions'
import type { OneCardInput } from '../../game/onecard/protocol'
import { canActBridge } from '../../game/bridge/actions'
import type { BridgeInput } from '../../game/bridge/protocol'
import { parkBindingsUrl } from './deployment'
import type { ParkRuntimePort } from './contracts'
import { benchBusy } from '../../features/interactions/benchState'
import { fitnessBusy } from '../../features/fitness/state'
import { telescopeBusy } from '../../features/telescopes/state'
import { resetFeedbackState, useFeedbackState } from '../../features/feedback/state'
import { resetNotesState, useNotesState } from '../../features/notes/state'
import { MovementInputBuffer, normalizedMove, stoppedIntent, type MovementIntent } from '../../network/movementInput'
import { emoteSource, emoteUnavailable } from '../../features/emotes/availability'
import { parseEmoteBindings, previewEmoteBindings, type EmoteId } from '../../features/emotes/catalog'
import { emoteSignal, useEmoteState } from '../../features/emotes/state'
import { mockEmote } from '../../features/emotes/mock/MockEmoteService'
import { gameSelection, type TableGameCode } from '../../features/tableLobby/model'
import { publicMatchService } from '../../features/tableLobby/publicMatch'
import { useTableLobby, resetSeatedLook } from '../../features/tableLobby/state'
import {
  avatars,
  cancelAvatarEmote,
  presentEmote,
  clearChannel,
  receive,
  resetWorld,
  useSession,
} from '../../network/worldClient'

export function validateChat(value: string): string {
  const text = value.trim()
  if (
    !text ||
    [...text].length > 200 ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029\uD800-\uDFFF]/u.test(text)
  )
    throw new Error('채팅은 줄바꿈 없이 1~200자로 입력해주세요.')
  return text
}
type AuthEnded = () => void
/** One instance per app, including StrictMode's mount → cleanup → mount probe. */
export class ParkRuntime implements ParkRuntimePort {
  private active = false
  private generation = 0
  private inputSequence = 0
  private retryCount = 0
  private preferredChannel = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  private bootAbort: AbortController | undefined
  private authListeners = new Set<AuthEnded>()
  private actionBusy = false
  private inspection = 0
  private tableWatchRequestId = ''
  private obsoleteWatchRequests = new Set<string>()
  private ownProfile: ReturnType<typeof userProfile> | null = null
  private movement = new MovementInputBuffer((intent, scope) => this.sendMovement(intent, scope))
  private socket = new SharedSocket({
    ticket: async (signal) => {
      const body = await this.getJSON('/api/v1/auth/websocket-ticket', {
        method: 'POST',
        signal,
      })
      if (!record(body) || typeof body.ticket !== 'string' || !body.ticket)
        throw new Error('접속권 응답을 확인할 수 없습니다.')
      return body.ticket
    },
    socket: (ticket) => {
      const url = new URL('/ws/tables', window.location.href)
      if (url.hostname === 'www.on-top.world') url.hostname = 'api.on-top.world'
      if (url.hostname === 'dev.on-top.world') url.hostname = 'dev-api.on-top.world'
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('ticket', ticket)
      return new WebSocket(url) // Sole production WebSocket constructor in frontend/src.
    },
    message: (message) => this.message(message),
    closed: (code) => this.closed(code),
    error: (message) => this.report(message),
  })
  addAuthListener(listener: AuthEnded) {
    this.authListeners.add(listener)
    return () => {
      this.authListeners.delete(listener)
    }
  }
  private report(error: unknown) {
    if (this.active)
      useSession.setState({
        error: error instanceof Error ? error.message : String(error),
      })
  }
  private authEnded() {
    resetNotesState()
    resetFeedbackState()
    this.movement.clear()
    this.active = false
    clearTimeout(this.timer)
    this.bootAbort?.abort()
    clearAuthSession()
    void this.socket.disconnect()
    resetWorld('error', '로그인이 종료되었습니다. 다시 로그인해주세요.')
    this.authListeners.forEach((listener) => listener())
  }
  private async getJSON(url: string, init: RequestInit = {}): Promise<unknown> {
    const fetchOnce = () => {
      const session = getAuthSession()
      if (session?.status !== 'AUTHENTICATED')
        throw new Error('로그인이 필요합니다.')
      return fetch(url, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          ...init.headers,
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    }
    let response = await fetchOnce()
    if (response.status === 401 && !init.signal?.aborted) {
      if (!(await restoreAuthSession(true))) {
        this.authEnded()
        throw new Error('로그인이 만료되었습니다.')
      }
      if (init.signal?.aborted) throw new Error('연결 요청이 취소되었습니다.')
      response = await fetchOnce()
    }
    if (response.status === 401 || response.status === 403) this.authEnded()
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? '로그인을 다시 확인해주세요.'
          : `서버 요청에 실패했습니다. (${response.status})`,
      )
    return response.json()
  }
  start() {
    if (this.active) return
    this.active = true
    this.retryCount = 0
    void this.boot()
  }
  private async boot() {
    this.movement.clear()
    const generation = ++this.generation
    this.actionBusy = false
    this.bootAbort?.abort()
    const abort = (this.bootAbort = new AbortController())
    resetWorld(this.retryCount ? 'reconnecting' : 'joining')
    this.ownProfile = null
    try {
      await this.socket.disconnect()
      if (!this.active || generation !== this.generation) return
      const [body, config, profile] = await Promise.all([
        this.getJSON('/api/v1/channels', { signal: abort.signal }),
        fetch(parkBindingsUrl(), {
          signal: abort.signal,
          cache: 'no-store',
        }).then((r) => {
          if (!r.ok) throw new Error('공원 배치 설정 파일을 읽을 수 없습니다.')
          return r.json() as Promise<unknown>
        }),
        this.getJSON('/api/v1/users/me', { signal: abort.signal }).then(
          userProfile,
        ),
      ])
      if (!this.active || generation !== this.generation) return
      if (!record(body) || !Array.isArray(body.items) || !record(config))
        throw new Error('공원 설정 응답을 확인할 수 없습니다.')
      const channels = body.items.map(channel),
        bindings = parseBindings(config.bindings)
      useSession.setState({ channels, bindings })
      useEmoteState.setState({ bindings: config.emotes === undefined && import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
        ? { ...previewEmoteBindings } : parseEmoteBindings(config.emotes) })
      this.ownProfile = profile
      if (!channels.length)
        this.report('서버에 등록된 채널이 없습니다. 채널 설정을 확인해주세요.')
      await this.socket.connect()
    } catch (error) {
      if (!this.active || generation !== this.generation) return
      useSession.setState({ status: 'error' })
      this.report(error)
    }
  }
  async stop() {
    this.movement.clear()
    this.active = false
    ++this.generation
    this.actionBusy = false
    clearTimeout(this.timer)
    this.bootAbort?.abort()
    const closing = this.socket.disconnect()
    resetWorld()
    await closing
  }
  private closed(code: number) {
    this.movement.clear()
    if (!this.active) return
    if (code === 4401 || code === 4403) {
      this.authEnded()
      return
    }
    if (code === 1008 || code === 1000) {
      resetWorld(
        'error',
        code === 1008
          ? '같은 계정의 연결이 이미 있거나 서버가 연결을 거절했습니다. 다른 공원 창을 확인해주세요.'
          : '서버가 연결을 종료했습니다.',
      )
      return
    }
    resetWorld('reconnecting', '연결이 끊겨 다시 연결하고 있습니다.')
    if (++this.retryCount > 5) {
      useSession.setState({
        status: 'error',
        error: '자동 재연결을 중지했습니다. 잠시 후 다시 시도해주세요.',
      })
      return
    }
    this.timer = setTimeout(
      () => void this.boot(),
      Math.min(500 * 2 ** this.retryCount, 8000),
    )
  }
  reconnect = () => {
    if (!this.active) return
    clearTimeout(this.timer)
    this.retryCount = 0
    void this.boot()
  }
  private message(message: Envelope) {
    if (!this.active) return
    if (message.type === 'ERROR' && message.requestId && this.obsoleteWatchRequests.has(message.requestId)) return
    if (message.type === 'TABLE_WATCH_STATE') {
      const q = useTableLobby.getState()
      if (!['loading', 'ready'].includes(q.status) || message.payload.tableId !== q.tableId ||
        (message.requestId !== null && message.requestId !== this.tableWatchRequestId)) return
    }
    receive(message)
    const session = useSession.getState()
    try {
      receiveGame(message, session.sessionId, session.tableId)
    } catch (error) {
      useGame.setState({
        uncertain: true,
        error: '경기 응답 형식을 확인하지 못해 입력을 중지했습니다.',
      })
      throw error
    }
    if (!session.roomId || !session.mapCompatible || session.tableId || useGame.getState().watchedGameId || tableBusy() || !avatars.has(session.sessionId))
      this.movement.clear(false)
    if (message.type === 'CONNECTED') {
      const profile = this.ownProfile
      if (!profile || profile.userId !== message.payload.userId) {
        this.authEnded()
        return
      }
      setDisplayProfiles(
        {
          [profile.userId]: {
            nickname: profile.nickname,
            character: profile.character,
          },
        },
        { nickname: profile.nickname, balance: null },
      )
      this.inputSequence = 0
      const channels = useSession.getState().channels
      const selected =
        channels.find((c) => c.channelId === this.preferredChannel) ??
        (channels.length === 1 ? channels[0] : undefined)
      if (selected) void this.selectChannel(selected.channelId)
    }
  }
  private async action(job: () => Promise<unknown>) {
    if (!this.active || this.actionBusy) return false
    this.actionBusy = true
    useSession.setState({ pending: true, error: '' })
    const generation = this.generation
    try {
      await job()
      return true
    } catch (error) {
      if (generation === this.generation) this.report(error)
      return false
    } finally {
      if (generation === this.generation) {
        this.actionBusy = false
        useSession.setState({ pending: false })
      }
    }
  }
  selectChannel = (channelId: string) =>
    this.action(async () => {
      const state = useSession.getState()
      if (benchBusy(state.sessionId)) throw new Error('먼저 벤치에서 일어나주세요.')
      if (fitnessBusy(state.sessionId)) throw new Error('먼저 운동기구에서 내려와주세요.')
      if (telescopeBusy(state.sessionId)) throw new Error('먼저 망원경에서 나와주세요.')
      if (tableBusy())
        throw new Error('경기 진행·복구·정산 중에는 채널을 바꿀 수 없습니다.')
      if (state.tableId) throw new Error('먼저 테이블에서 일어나주세요.')
      if (state.roomId === channelId) return
      this.movement.clear()
      if (!state.channels.some((c) => c.channelId === channelId))
        throw new Error('서버 채널 목록을 확인해주세요.')
      if (state.roomId)
        await this.socket.request('CHANNEL_LEAVE', {}, ['CHANNEL_LEFT'])
      const feedback = useFeedbackState.getState()
      const notes = useNotesState.getState()
      clearChannel(!state.roomId && feedback.ownerId === state.sessionId && feedback.channelId === channelId,
        !state.roomId && notes.ownerId === state.sessionId && notes.channelId === channelId)
      this.inputSequence = 0
      const generation = this.generation
      await this.socket.request('CHANNEL_JOIN', { channelId }, [
        'CHANNEL_STATE',
      ])
      this.preferredChannel = channelId
      this.retryCount = 0
      const body = await this.getJSON(
        `/api/v1/tables?channelId=${encodeURIComponent(channelId)}`,
        { signal: this.bootAbort?.signal },
      )
      if (
        generation !== this.generation ||
        useSession.getState().roomId !== channelId
      )
        return
      if (!record(body) || !Array.isArray(body.tables))
        throw new Error('테이블 목록을 확인할 수 없습니다.')
      useSession.setState({ tables: body.tables.map(tableSummary) })
    })
  sendChat = (value: string) =>
    this.action(async () => {
      const text = validateChat(value)
      if (!useSession.getState().roomId)
        throw new Error('먼저 채널에 입장해주세요.')
      await this.socket.request('WORLD_CHAT_SEND', { text }, [
        'WORLD_CHAT_MESSAGE',
      ])
      // Only server echoes enter the message list. No optimistic duplicate or automatic replay.
    })
  move = (dx: number, dz: number, run: boolean, jump = false) => {
    const intent = normalizedMove(dx, dz, run, jump)
    if (!intent || !this.canSendMovement(intent)) return
    if (!stoppedIntent(intent)) cancelAvatarEmote(useSession.getState().sessionId)
    this.movement.enqueue(intent, this.movementScope())
  }
  sendEmote = async (id: EmoteId): Promise<boolean> => {
    const reason = emoteUnavailable(id)
    if (reason || !this.active || !this.socket.connected) {
      useEmoteState.setState({ error: reason || '공원 연결을 확인해주세요.' })
      return false
    }
    const state = useEmoteState.getState(), session = useSession.getState()
    const epoch = state.epoch, scope = this.movementScope(), source = emoteSource(id)
    const current = () => useEmoteState.getState().epoch === epoch && this.movementScope() === scope && this.active
    useEmoteState.setState({ pending: true, requestId: '', requested: id, cancelled: false, error: '', notice: '' })
    this.move(0, 0, false)
    try {
      if (source === 'server') {
        const response = await this.socket.request('WORLD_EMOTE_SEND', { emoteCode: state.bindings[id]! }, ['WORLD_EMOTE_EVENT'],
          requestId => { if (current()) useEmoteState.setState({ requestId }) })
        if (!current() || useEmoteState.getState().cancelled) return false
        if (response.payload.userId !== session.sessionId || response.payload.channelId !== session.roomId
          || response.payload.emoteCode !== state.bindings[id] || avatars.get(session.sessionId)?.emote !== id
          || avatars.get(session.sessionId)?.emoteAt !== Date.parse(String(response.payload.sentAt)))
          throw new Error('감정표현 승인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
      } else if (import.meta.env.DEV && import.meta.env.MODE === 'facility-preview' && source === 'mock') {
        const event = await mockEmote(id, session.roomId, session.sessionId, emoteSignal())
        if (!current() || useEmoteState.getState().cancelled) return false
        if (!presentEmote({ ...event, emoteCode: 'MOCK' }, id, 'mock')) throw new Error('현재 상태에서는 감정표현을 사용할 수 없습니다.')
      } else throw new Error('감정표현 서버 연결이 아직 준비되지 않았습니다.')
      return true
    } catch (error) {
      if (current() && !useEmoteState.getState().cancelled) useEmoteState.setState({
        error: error instanceof Error ? error.message : '감정표현을 사용하지 못했습니다.',
      })
      return false
    } finally {
      if (current()) useEmoteState.setState({ pending: false, requestId: '', requested: '' })
    }
  }
  private movementScope() {
    const s = useSession.getState()
    return JSON.stringify([this.generation, s.sessionId, s.roomId])
  }
  private canSendMovement(intent: MovementIntent) {
    const s = useSession.getState()
    return this.active && s.status === 'connected' && !!s.roomId && s.mapCompatible && avatars.has(s.sessionId)
      && !tableBusy() && !s.tableId && (!useGame.getState().watchedGameId || stoppedIntent(intent))
      && (!(benchBusy(s.sessionId) || fitnessBusy(s.sessionId) || telescopeBusy(s.sessionId)) || stoppedIntent(intent)) && this.socket.connected
  }
  private sendMovement(intent: MovementIntent, scope: string) {
    if (scope !== this.movementScope() || !this.canSendMovement(intent)) return
    try {
      this.socket.send('WORLD_MOVE', {
        seq: ++this.inputSequence,
        ...intent,
      })
    } catch {
      /* Disconnect handler owns the visible state. */
    }
  }
  inspectTable = (anchorId: string) => {
    if (this.actionBusy || useSession.getState().pending) return
    if (benchBusy(useSession.getState().sessionId) || fitnessBusy(useSession.getState().sessionId) || telescopeBusy(useSession.getState().sessionId)) return
    useSession.setState({ focusedAnchorId: anchorId })
    const s = useSession.getState(),
      tableId = bindAnchor(
        s.bindings,
        s.roomId,
        anchorId,
        s.tables.map((t) => t.tableId),
      )
    if (!tableId) {
      this.report('이 테이블의 서버 배치 연결이 아직 설정되지 않았습니다.')
      return
    }
    if (s.tableId || tableBusy()) return
    const inspection = ++this.inspection, generation = this.generation, channelId = s.roomId
    const current = () => this.active && this.generation === generation && this.inspection === inspection
      && useSession.getState().roomId === channelId && useSession.getState().focusedAnchorId === anchorId
    useTableLobby.setState({ tableId, status: 'loading', error: '', requestId: '' })
    void this.action(async () => {
      try {
        const list = await this.getJSON(`/api/v1/tables?channelId=${encodeURIComponent(channelId)}`, { signal: this.bootAbort?.signal })
        if (!current()) return
        if (!record(list) || !Array.isArray(list.tables)) throw new Error('테이블 목록을 확인할 수 없습니다.')
        const tables = list.tables.map(tableSummary)
        if (!tables.some(table => table.tableId === tableId)) throw new Error('현재 채널의 테이블 목록을 다시 확인해주세요.')
        useSession.setState({ tables })
        if (s.watchedTableId && s.watchedTableId !== tableId)
          await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
        if (!current()) return
        await this.socket.request('TABLE_WATCH', { tableId }, ['TABLE_WATCH_STATE'], requestId => {
          this.tableWatchRequestId = requestId
          useTableLobby.setState({ requestId })
        })
        if (current()) useTableLobby.setState({ status: 'ready' })
        else if (this.active && this.generation === generation && useSession.getState().roomId === channelId)
          await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
      } catch (error) {
        if (!current()) return
        useTableLobby.setState({ status: 'error', error: error instanceof Error ? error.message : '테이블 조회에 실패했습니다.' })
        throw error
      }
    })
  }
  joinTable = () =>
    this.action(async () => {
      if (benchBusy(useSession.getState().sessionId)) throw new Error('먼저 벤치에서 일어나주세요.')
      if (fitnessBusy(useSession.getState().sessionId)) throw new Error('먼저 운동기구에서 내려와주세요.')
      if (telescopeBusy(useSession.getState().sessionId)) throw new Error('먼저 망원경에서 나와주세요.')
      if (tableBusy())
        throw new Error('먼저 진행 중인 경기 상태를 확인해주세요.')
      const s = useSession.getState()
      if (!s.mapCompatible) throw new Error('서버 맵 버전을 먼저 확인해주세요.')
      const tableId = bindAnchor(
        s.bindings,
        s.roomId,
        s.focusedAnchorId,
        s.tables.map((t) => t.tableId),
      )
      if (!tableId)
        throw new Error('서버 테이블과 공원 배치 연결이 필요합니다.')
      this.move(0, 0, false)
      await this.socket.request('TABLE_JOIN', { tableId }, ['TABLE_STATE'])
      // Only TABLE_STATE assigns a seat. Never send a userId, seatNumber or final position.
    })
  leaveTable = () =>
    this.action(async () => {
      if (tableBusy())
        throw new Error('경기 진행·복구·정산 중에는 일어날 수 없습니다.')
      await this.socket.request('TABLE_LEAVE', {}, ['TABLE_LEFT'])
    })
  selectOmok = () => this.selectGame('OMOK')
  selectGame = (code: TableGameCode, targetScore?: number) =>
    this.action(async () => {
      const s = useSession.getState(),
        table = s.tableStates[s.tableId]
      if (tableBusy() || !table || table.selectorUserId !== s.sessionId)
        throw new Error(
          '대기 중인 테이블의 게임 선택 담당자만 선택할 수 있습니다.',
        )
      const payload = gameSelection(code, targetScore)
      await this.socket.request('GAME_SELECT', payload, [
        'TABLE_STATE',
      ])
    })
  setReady = (ready: boolean) =>
    this.action(async () => {
      const s = useSession.getState()
      if (tableBusy() || !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'].includes(s.tableStates[s.tableId]?.gameCode ?? ''))
        throw new Error('플레이 가능한 게임을 선택한 대기 테이블에서 준비해주세요.')
      await this.socket.request('READY_SET', { ready }, ['TABLE_STATE'])
    })
  checkStart = () =>
    this.action(() =>
      this.socket.request('GAME_START_CHECK', {}, ['GAME_START_STATE']),
    )
  checkRecovery = () =>
    this.action(() =>
      this.socket.request('GAME_RECONNECT_CHECK', {}, [
        'GAME_CONNECTION_STATE',
      ]),
    )
  checkGame = () =>
    this.action(async () => {
      const s = useGame.getState(),
        gameId = s.game?.gameId ?? s.permittedGameId
      if (!gameId) throw new Error('서버에서 확인한 경기 ID가 없습니다.')
      await this.socket.request('GAME_STATE_CHECK', { gameId }, ['GAME_STATE'])
    })
  checkResult = () =>
    this.action(async () => {
      const s = useGame.getState()
      if (
        !s.permittedGameId ||
        s.game?.role !== 'PLAYER' ||
        gameState(s.game).status !== 'FINISHED'
      )
        throw new Error('본인이 참가한 종료 경기만 확인할 수 있습니다.')
      await this.socket.request(
        'GAME_RESULT_CHECK',
        { gameSessionId: s.permittedGameId },
        ['GAME_RESULT'],
      )
    })
  placeOmok = (x: number, y: number) =>
    this.action(async () => {
      const own = useSession.getState(),
        s = useGame.getState()
      if (own.status !== 'connected' || !canPlace(own.sessionId, x, y))
        throw new Error('본인 차례와 최신 경기 상태를 확인해주세요.')
      const game = s.game!
      const generation = this.generation
      useGame.setState({ pending: true, error: '' })
      try {
        await this.socket.request(
          'GAME_ACTION_SEND',
          {
            gameId: game.gameId,
            actionId: crypto.randomUUID(),
            expectedVersion: game.version,
            input: { x, y },
          },
          ['GAME_ACTION_RESULT'],
        )
      } catch (error) {
        const explicitRejection =
          error instanceof ServerError &&
          [
            'GAME_ACTION_FORBIDDEN_MOVE',
            'GAME_ACTION_INVALID_ACTION',
            'GAME_ACTION_NOT_YOUR_TURN',
          ].includes(error.code)
        if (
          generation === this.generation &&
          useGame.getState().permittedGameId === game.gameId
        )
          useGame.setState({
            uncertain: !explicitRejection,
            error:
              error instanceof Error
                ? error.message
                : '착수 결과를 확인해주세요.',
          })
        throw error
      } finally {
        if (generation === this.generation) useGame.setState({ pending: false })
      }
    })
  actDice = (kind: 'roll' | 'bank', selectedIds: readonly number[]) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.dice || !canPlayDice(own.sessionId) || !validDiceAction(g.dice, kind, selectedIds))
      throw new Error('본인 차례·득점 선택·최신 주사위 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(),
        expectedVersion: g.version, input: { kind, selectedIds: [...selectedIds] } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '주사위 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  actOneCard = (input: OneCardInput) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.onecard || !canActOneCard(own.sessionId, input))
      throw new Error('본인 손패·차례·반응 시간·최신 경기 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(),
        expectedVersion: g.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '원카드 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  actBridge = (input: BridgeInput) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.bridge || !canActBridge(own.sessionId, input))
      throw new Error('본인 차례·현재 판단자·비공개 눈·최신 경기 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(), expectedVersion: g.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '다리 경기 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  /** gameId must come from an approved public game reference; no guessed table→game IDs. */
  watchGame = (gameId: string) =>
    this.action(async () => {
      const session = useSession.getState()
      const reference = publicMatchService.find({ channelId: session.roomId, tableId: session.watchedTableId })
      if (
        !gameId.trim() ||
        gameId.length > 120 ||
        tableBusy() ||
        useGame.getState().watchedGameId || session.tableId || !session.watchedTableId ||
        !reference || reference.gameId !== gameId || reference.tableId !== session.watchedTableId || reference.channelId !== session.roomId
      )
        throw new Error('관전 가능한 경기 정보를 확인해주세요.')
      const generation = this.generation
      this.movement.clear()
      useGame.setState({ watchedGameId: gameId })
      try {
        await this.socket.request('GAME_WATCH', { gameId }, ['GAME_STATE'])
      } catch (error) {
        if (generation === this.generation && useGame.getState().watchedGameId === gameId)
          useGame.setState({ watchedGameId: '', game: null })
        throw error
      }
    })
  unwatchGame = () =>
    this.action(() =>
      this.socket.request('GAME_UNWATCH', {}, ['GAME_WATCH_LEFT']),
    )
  closeTable = () => {
    ++this.inspection
    if (this.tableWatchRequestId) this.obsoleteWatchRequests.add(this.tableWatchRequestId)
    if (this.obsoleteWatchRequests.size > 64) this.obsoleteWatchRequests.delete(this.obsoleteWatchRequests.values().next().value!)
    this.tableWatchRequestId = ''
    useTableLobby.setState({ tableId: '', status: 'idle', error: '', requestId: '' })
    resetSeatedLook()
    if (useSession.getState().watchedTableId)
      void this.action(async () => {
        await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
      })
    useSession.setState({ focusedAnchorId: '' })
  }
}

export { ServerError, avatars }
