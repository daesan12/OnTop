import { describe, it, expect, vi, afterEach } from 'vitest'
import { SharedSocket, type SocketLike } from '../../src/network/socketClient'

class FakeSocket implements SocketLike {
  readyState = 0
  onopen: SocketLike['onopen'] = null
  onmessage: SocketLike['onmessage'] = null
  onerror: SocketLike['onerror'] = null
  onclose: SocketLike['onclose'] = null
  sent: string[] = []
  autoClose = true
  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 2
    if (this.autoClose) queueMicrotask(() => this.finishClose())
  }
  finishClose(code = 1000) {
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }
  message(
    type: string,
    payload: Record<string, unknown>,
    requestId: string | null = null,
  ) {
    this.onmessage?.({
      data: JSON.stringify({ type, payload, requestId }),
    } as MessageEvent)
  }
}
function setup() {
  const sockets: FakeSocket[] = [],
    message = vi.fn(),
    closed = vi.fn(),
    error = vi.fn(),
    ticket = vi.fn(async () => 'test-ticket')
  const client = new SharedSocket({
    ticket,
    socket: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    message,
    closed,
    error,
    timeoutMs: 100,
  })
  return { client, sockets, message, closed, error, ticket }
}
async function connect(s: ReturnType<typeof setup>) {
  const task = s.client.connect()
  await vi.waitFor(() => expect(s.sockets).toHaveLength(1))
  s.sockets[0]!.open()
  await task
  return s.sockets[0]!
}
afterEach(() => vi.useRealTimers())
describe('one shared account socket', () => {
  it('refreshes a prefetched ticket near expiry after slow preparation', async () => {
    vi.useFakeTimers()
    let ready!: () => void
    const socket = new FakeSocket()
    const ticket = vi.fn().mockResolvedValueOnce({ ticket: 'old', expiresIn: 30 })
      .mockResolvedValueOnce({ ticket: 'fresh', expiresIn: 30 })
    const factory = vi.fn(() => socket)
    const client = new SharedSocket({ ticket, socket: factory, message: vi.fn(), closed: vi.fn(), error: vi.fn() })
    const opening = client.connect(new Promise<void>(resolve => { ready = resolve }))
    await vi.advanceTimersByTimeAsync(30000)
    ready()
    await vi.advanceTimersByTimeAsync(0)
    expect(factory).toHaveBeenCalledWith('fresh')
    expect(ticket).toHaveBeenCalledTimes(2)
    socket.open()
    await opening
    await client.disconnect()
  })
  it('fetches the ticket during preparation but waits for validated configuration before opening', async () => {
    const s = setup()
    let ready!: () => void
    const opening = s.client.connect(new Promise<void>(resolve => { ready = resolve }))
    await vi.waitFor(() => expect(s.ticket).toHaveBeenCalledTimes(1))
    expect(s.sockets).toHaveLength(0)
    ready()
    await vi.waitFor(() => expect(s.sockets).toHaveLength(1))
    s.sockets[0]!.open()
    await opening
    await s.client.disconnect()
  })
  it('does not open a socket if configuration validation fails', async () => {
    const s = setup()
    await expect(s.client.connect(Promise.reject(new Error('invalid bindings')))).rejects.toThrow('invalid bindings')
    expect(s.sockets).toHaveLength(0)
    await s.client.disconnect()
  })
  it('does not open a cancelled connection after preparation completes', async () => {
    const s = setup()
    let ready!: () => void
    const opening = s.client.connect(new Promise<void>(resolve => { ready = resolve }))
    const rejected = expect(opening).rejects.toThrow('취소')
    await vi.waitFor(() => expect(s.ticket).toHaveBeenCalledTimes(1))
    await s.client.disconnect()
    ready()
    await rejected
    expect(s.sockets).toHaveLength(0)
  })
  it('deduplicates concurrent connection attempts', async () => {
    const s = setup()
    const a = s.client.connect(),
      b = s.client.connect()
    expect(a).toBe(b)
    await vi.waitFor(() => expect(s.sockets).toHaveLength(1))
    s.sockets[0]!.open()
    await Promise.all([a, b])
    expect(s.ticket).toHaveBeenCalledTimes(1)
    await s.client.disconnect()
  })
  it('waits for the old socket close before creating another', async () => {
    const s = setup(),
      socket = await connect(s)
    socket.autoClose = false
    const closing = s.client.disconnect(),
      opening = s.client.connect()
    await Promise.resolve()
    expect(s.sockets).toHaveLength(1)
    socket.finishClose()
    await closing
    await vi.waitFor(() => expect(s.sockets).toHaveLength(2))
    s.sockets[1]!.open()
    await opening
    await s.client.disconnect()
  })
  it('never opens a socket from a cancelled ticket response', async () => {
    let resolve!: (s: string) => void
    const factory = vi.fn()
    const client = new SharedSocket({
      ticket: () =>
        new Promise((r) => {
          resolve = r
        }),
      socket: factory,
      message: vi.fn(),
      closed: vi.fn(),
      error: vi.fn(),
    })
    const task = client.connect()
    const rejected = expect(task).rejects.toThrow('취소')
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    await client.disconnect()
    resolve('late-ticket')
    await rejected
    expect(factory).not.toHaveBeenCalled()
  })
  it('shares the transport for chat and table requests and correlates responses', async () => {
    const s = setup(),
      socket = await connect(s)
    const chat = s.client.request('WORLD_CHAT_SEND', { text: '안녕' }, [
      'WORLD_CHAT_MESSAGE',
    ])
    const table = s.client.request('TABLE_JOIN', { tableId: 't' }, [
      'TABLE_STATE',
    ])
    const [a, b] = socket.sent.map((x) => JSON.parse(x))
    socket.message('WORLD_CHAT_MESSAGE', { text: '안녕' }, a.requestId)
    socket.message('TABLE_STATE', { tableId: 't' }, b.requestId)
    await Promise.all([chat, table])
    expect(s.sockets).toHaveLength(1)
    await s.client.disconnect()
  })
  it('does not confuse unsolicited events with a request acknowledgement', async () => {
    const s = setup(),
      socket = await connect(s)
    const done = vi.fn()
    const request = s.client
      .request('TABLE_JOIN', { tableId: 't' }, ['TABLE_STATE'])
      .then(done)
    socket.message('TABLE_STATE', { tableId: 'other' })
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    socket.message(
      'TABLE_STATE',
      { tableId: 't' },
      JSON.parse(socket.sent[0]!).requestId,
    )
    await request
    await s.client.disconnect()
  })
  it('rejects a server error without replaying the request', async () => {
    const s = setup(),
      socket = await connect(s)
    const request = s.client.request('TABLE_JOIN', { tableId: 't' }, [
      'TABLE_STATE',
    ])
    const rejected = expect(request).rejects.toMatchObject({
      code: 'TABLE_FULL',
    })
    socket.message(
      'ERROR',
      { code: 'TABLE_FULL', message: '만석' },
      JSON.parse(socket.sent[0]!).requestId,
    )
    await rejected
    expect(socket.sent).toHaveLength(1)
    await s.client.disconnect()
  })
  it('rejects pending work on disconnect and ignores old-generation frames', async () => {
    const s = setup(),
      socket = await connect(s)
    const pending = s.client.request('WORLD_CHAT_SEND', { text: '안녕' }, [
      'WORLD_CHAT_MESSAGE',
    ])
    const rejected = expect(pending).rejects.toThrow('종료')
    await s.client.disconnect()
    socket.message('WORLD_CHAT_MESSAGE', { text: 'stale' })
    await rejected
    expect(s.message).not.toHaveBeenCalled()
  })
  it('times out without automatically retrying chat or seat requests', async () => {
    const s = setup(),
      socket = await connect(s)
    vi.useFakeTimers()
    const pending = s.client.request('WORLD_CHAT_SEND', { text: 'once' }, [
      'WORLD_CHAT_MESSAGE',
    ])
    const rejected = expect(pending).rejects.toThrow('초과')
    await vi.advanceTimersByTimeAsync(101)
    await rejected
    expect(socket.sent).toHaveLength(1)
    vi.useRealTimers()
    await s.client.disconnect()
  })
  it('reports malformed frames without exposing their contents', async () => {
    const s = setup(),
      socket = await connect(s)
    socket.onmessage?.({ data: 'secret-not-json' } as MessageEvent)
    expect(s.message).not.toHaveBeenCalled()
    expect(JSON.stringify(s.error.mock.calls)).not.toContain('secret')
    await s.client.disconnect()
  })
})
