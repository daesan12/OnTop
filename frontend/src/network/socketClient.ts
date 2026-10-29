import { parseEnvelope, type Envelope } from './protocol'

export interface SocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(code?: number): void
}
export class ServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
interface Dependencies {
  ticket(signal: AbortSignal): Promise<string | { ticket: string; expiresIn: number }>
  socket(ticket: string): SocketLike
  message(message: Envelope): void
  closed(code: number): void
  error(message: string): void
  timeoutMs?: number
}
interface Pending {
  expected: readonly string[]
  resolve: (value: Envelope) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One transport shared by channel, movement, chat and tables. Never logs credentials. */
export class SharedSocket {
  private socket: SocketLike | undefined
  private opening: Promise<void> | undefined
  private closing: Promise<void> = Promise.resolve()
  private abort: AbortController | undefined
  private generation = 0
  private sequence = 0
  private pending = new Map<string, Pending>()
  constructor(private readonly deps: Dependencies) {}
  get connected() {
    return this.socket?.readyState === 1
  }
  connect(ready: Promise<unknown> = Promise.resolve()): Promise<void> {
    if (this.opening) return this.opening
    if (this.connected) return Promise.resolve()
    const generation = ++this.generation
    const abort = (this.abort = new AbortController())
    const task = (async () => {
      await this.closing
      if (generation !== this.generation)
        throw new Error('연결 요청이 취소되었습니다.')
      // Fetch the single-use ticket alongside park configuration. Do not open
      // the socket (or receive CONNECTED) until its profile/bindings are ready.
      const requestedAt = performance.now()
      const [prepared] = await Promise.all([
        this.deps.ticket(abort.signal),
        ready,
      ])
      if (generation !== this.generation || abort.signal.aborted)
        throw new Error('연결 요청이 취소되었습니다.')
      let grant = prepared
      if (typeof grant !== 'string'
        && performance.now() - requestedAt >= Math.max(0, grant.expiresIn * 1000 - 1000)) {
        grant = await this.deps.ticket(abort.signal)
      }
      if (generation !== this.generation || abort.signal.aborted)
        throw new Error('연결 요청이 취소되었습니다.')
      const ticket = typeof grant === 'string' ? grant : grant.ticket
      await new Promise<void>((resolve, reject) => {
        const socket = this.deps.socket(ticket)
        this.socket = socket
        let closeDone!: () => void
        this.closing = new Promise<void>((done) => {
          closeDone = done
        })
        const timer = setTimeout(() => {
          socket.close(1000)
          reject(new Error('연결 응답 시간이 초과되었습니다.'))
        }, this.deps.timeoutMs ?? 8000)
        socket.onopen = () => {
          clearTimeout(timer)
          resolve()
        }
        socket.onerror = () => {
          clearTimeout(timer)
          socket.close()
          reject(new Error('실시간 서버에 연결하지 못했습니다.'))
        }
        socket.onmessage = (event) => {
          if (generation !== this.generation) return
          try {
            const message = parseEnvelope(event.data)
            this.deps.message(message)
            const pending = message.requestId
              ? this.pending.get(message.requestId)
              : undefined
            if (!pending) return
            if (message.type === 'ERROR') {
              this.finish(message.requestId!)
              pending.reject(
                new ServerError(
                  String(message.payload.code ?? 'SERVER_ERROR'),
                  String(message.payload.message ?? '요청이 거절되었습니다.'),
                ),
              )
            } else if (pending.expected.includes(message.type)) {
              this.finish(message.requestId!)
              pending.resolve(message)
            }
          } catch {
            this.deps.error('서버 메시지 형식을 확인할 수 없습니다.')
          }
        }
        socket.onclose = (event) => {
          clearTimeout(timer)
          if (this.socket === socket) this.socket = undefined
          closeDone()
          reject(new Error('실시간 연결이 종료되었습니다.'))
          if (generation !== this.generation) return
          this.rejectPending('연결이 종료되어 요청을 완료하지 못했습니다.')
          this.deps.closed(event.code)
        }
      })
    })()
    this.opening = task
    void task.then(
      () => {
        if (this.opening === task) this.opening = undefined
      },
      () => {
        if (this.opening === task) this.opening = undefined
      },
    )
    return task
  }
  send(type: string, payload: Record<string, unknown> = {}): string {
    if (!this.connected) throw new Error('실시간 서버 연결을 확인해주세요.')
    const requestId = `fe-${++this.sequence}`
    this.socket!.send(JSON.stringify({ requestId, type, payload }))
    return requestId
  }
  request(
    type: string,
    payload: Record<string, unknown>,
    expected: readonly string[],
    onRequestId?: (requestId: string) => void,
  ): Promise<Envelope> {
    if (!this.connected)
      return Promise.reject(new Error('실시간 서버 연결을 확인해주세요.'))
    const requestId = `fe-${++this.sequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(
          new Error(
            '응답 시간이 초과되었습니다. 상태를 확인한 뒤 다시 시도해주세요.',
          ),
        )
      }, this.deps.timeoutMs ?? 8000)
      this.pending.set(requestId, { expected, resolve, reject, timer })
      try {
        onRequestId?.(requestId)
        this.socket!.send(JSON.stringify({ requestId, type, payload }))
      } catch {
        this.finish(requestId)
        reject(new Error('요청을 전송하지 못했습니다.'))
      }
    })
  }
  async disconnect(): Promise<void> {
    ++this.generation
    this.abort?.abort()
    this.rejectPending('공원 연결이 종료되었습니다.')
    if (this.socket && this.socket.readyState < 2) this.socket.close(1000)
    // A subsequent connect waits for onclose; it cannot race a closing account socket.
    if (this.socket) await this.closing
  }
  private finish(id: string) {
    const p = this.pending.get(id)
    if (p) clearTimeout(p.timer)
    this.pending.delete(id)
  }
  private rejectPending(message: string) {
    for (const [id, p] of this.pending) {
      this.finish(id)
      p.reject(new Error(message))
    }
  }
}
