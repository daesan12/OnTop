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
import {
  avatars,
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
export class ParkRuntime {
  private active = false
  private generation = 0
  private inputSequence = 0
  private retryCount = 0
  private preferredChannel = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  private bootAbort: AbortController | undefined
  private authListeners = new Set<AuthEnded>()
  private actionBusy = false
  private ownProfile: ReturnType<typeof userProfile> | null = null
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
        fetch('/park-bindings.json', {
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
    receive(message)
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
      if (state.tableId) throw new Error('먼저 테이블에서 일어나주세요.')
      if (state.roomId === channelId) return
      if (!state.channels.some((c) => c.channelId === channelId))
        throw new Error('서버 채널 목록을 확인해주세요.')
      if (state.roomId)
        await this.socket.request('CHANNEL_LEAVE', {}, ['CHANNEL_LEFT'])
      clearChannel()
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
    const s = useSession.getState()
    if (
      !s.roomId ||
      !s.mapCompatible ||
      s.tableId ||
      !this.socket.connected ||
      ![dx, dz].every(Number.isFinite)
    )
      return
    try {
      this.socket.send('WORLD_MOVE', {
        seq: ++this.inputSequence,
        dx,
        dz,
        run,
        jump,
      })
    } catch {
      /* Disconnect handler owns the visible state. */
    }
  }
  inspectTable = (anchorId: string) => {
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
    if (s.tableId) return
    void this.action(async () => {
      if (s.watchedTableId && s.watchedTableId !== tableId)
        await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
      await this.socket.request('TABLE_WATCH', { tableId }, [
        'TABLE_WATCH_STATE',
      ])
    })
  }
  joinTable = () =>
    this.action(async () => {
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
      await this.socket.request('TABLE_LEAVE', {}, ['TABLE_LEFT'])
    })
  closeTable = () => {
    if (useSession.getState().watchedTableId)
      void this.action(async () => {
        await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
      })
    useSession.setState({ focusedAnchorId: '' })
  }
}

export const parkRuntime = new ParkRuntime()
let leases = 0,
  cleanup: ReturnType<typeof setTimeout> | undefined
export function acquireRuntime(onAuthEnded: AuthEnded) {
  clearTimeout(cleanup)
  ++leases
  const unlisten = parkRuntime.addAuthListener(onAuthEnded)
  parkRuntime.start()
  return () => {
    unlisten()
    if (--leases === 0)
      cleanup = setTimeout(() => {
        if (!leases) void parkRuntime.stop()
      }, 0)
  }
}
export { ServerError, avatars }
