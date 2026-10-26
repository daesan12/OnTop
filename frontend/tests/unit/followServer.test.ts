import { beforeEach, expect, it, vi } from 'vitest'
import { FollowClient, parseFollowState } from '../../src/features/follow/serverClient'
import { resetFollow, useFollow } from '../../src/features/follow/state'
import { ServerError } from '../../src/network/socketClient'
import type { Envelope } from '../../src/network/protocol'

const scope = { userId: '101', channelId: 'a' }
const link = { followId: '00000000-0000-4000-8000-000000000001', followerId: '101', targetId: '102' }
const snapshot = (version: number, links: object[] = [], channelId = 'a', requestId: string | null = null): Envelope =>
  ({ requestId, type: 'WORLD_FOLLOW_STATE', payload: { channelId, version, links } })
function setup() {
  const connection = { ...scope, generation: 1, connected: true }
  const calls: { type: string; payload: Record<string, unknown>; id: string; resolve: (e: Envelope) => void; reject: (e: Error) => void }[] = []
  const client = new FollowClient({ scope: () => connection, request: (type, payload, _, onId) => new Promise((resolve, reject) => {
    const id = `test-${calls.length}`; onId(id); calls.push({ type, payload, id, resolve, reject })
  }) })
  const reply = (version: number, links: object[] = [], index = calls.length - 1) => {
    const call = calls[index]!, message = snapshot(version, links, 'a', call.id)
    client.accept(message); call.resolve(message)
  }
  return { connection, calls, client, reply }
}
beforeEach(resetFollow)
it('queries on entry, accepts version zero and uses the latest server follow UUID when stopping', async () => {
  const { client, calls, reply } = setup(), beginning = client.begin()
  expect(calls[0]).toMatchObject({ type: 'WORLD_FOLLOW_CHECK', payload: {} })
  reply(0); await beginning
  const start = client.start(scope, '102', new AbortController().signal)
  expect(calls[1]).toMatchObject({ type: 'WORLD_FOLLOW_START', payload: { targetId: '102' } })
  expect(useFollow.getState().links).toEqual([])
  reply(1, [link]); await start
  const newLink = { ...link, followId: '00000000-0000-4000-8000-000000000002', targetId: '103' }
  client.accept(snapshot(2, [newLink]))
  const stop = client.stop(scope, new AbortController().signal)
  expect(calls[2]).toMatchObject({ type: 'WORLD_FOLLOW_STOP', payload: { followId: newLink.followId } })
  reply(3); await stop; expect(useFollow.getState().links).toEqual([])
})
it('resolves same-version acknowledgements and never restores a relationship from an older ACK', async () => {
  const { client, reply } = setup(), beginning = client.begin(); reply(1, [link]); await beginning
  const repeat = client.start(scope, '102', new AbortController().signal); reply(1, [link]); await repeat
  const pending = client.start(scope, '102', new AbortController().signal)
  client.accept(snapshot(3)) // Auto-release push can precede an old START acknowledgement.
  reply(2, [link]); expect(await pending).toEqual([])
  expect(useFollow.getState()).toMatchObject({ version: 3, ready: true, links: [] })
  client.accept(snapshot(2, [link])); client.accept(snapshot(99, [link], 'other'))
  client.accept(snapshot(99, [link], 'a', 'unowned'))
  expect(useFollow.getState().links).toEqual([])
})
it('keeps a valid relationship after an explicit denial and contains its error in the follow feature', async () => {
  const { client, calls, reply } = setup(), beginning = client.begin(); reply(1, [link]); await beginning
  const pending = client.start(scope, '103', new AbortController().signal)
  expect(client.ownsError({ type: 'ERROR', requestId: calls[1]!.id, payload: {} })).toBe(true)
  calls[1]!.reject(new ServerError('FOLLOW_OUT_OF_RANGE', '거리를 확인해주세요.'))
  await expect(pending).rejects.toThrow('거리를')
  expect(calls).toHaveLength(2); expect(useFollow.getState().links).toEqual([link])
})
it('queries after a lost command response without replaying START or STOP', async () => {
  const { client, calls, reply } = setup(), beginning = client.begin(); reply(0); await beginning
  const pending = client.start(scope, '102', new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('timeout')
  calls[1]!.reject(new Error('timeout'))
  await vi.waitFor(() => expect(calls).toHaveLength(3))
  expect(calls.map(c => c.type)).toEqual(['WORLD_FOLLOW_CHECK', 'WORLD_FOLLOW_START', 'WORLD_FOLLOW_CHECK'])
  expect(useFollow.getState()).toMatchObject({ checking: true, ready: false })
  reply(1, [link]); await rejected
  expect(useFollow.getState()).toMatchObject({ ready: true, checking: false, links: [link] })
})
it('allows an explicit retry after CHECK failure and blocks commands until the state is known', async () => {
  const { client, calls, reply } = setup(), beginning = client.begin()
  calls[0]!.reject(new Error('offline')); await expect(beginning).rejects.toThrow()
  await expect(client.start(scope, '102', new AbortController().signal)).rejects.toThrow('조회')
  expect(useFollow.getState()).toMatchObject({ ready: false, checking: false })
  const retry = client.check(); reply(0); await retry
  expect(useFollow.getState()).toMatchObject({ ready: true, error: '' })
})
it('drops old connection/channel ACKs and checks again on reconnect without restoring an old intent', async () => {
  const { client, calls, connection, reply } = setup(), beginning = client.begin(); reply(0); await beginning
  const pending = client.start(scope, '102', new AbortController().signal)
  const rejection = expect(pending).rejects.toThrow('변경')
  client.reset(); connection.connected = false
  reply(1, [link]); await rejection
  expect(useFollow.getState().links).toEqual([])
  connection.connected = true; connection.generation++
  const rejoin = client.begin(); reply(0); await rejoin
  client.accept(snapshot(2, [link], 'a', calls[1]!.id))
  expect(useFollow.getState().links).toEqual([])
  expect(calls.map(c => c.type)).toEqual(['WORLD_FOLLOW_CHECK', 'WORLD_FOLLOW_START', 'WORLD_FOLLOW_CHECK'])
})
it('rejects malformed or partial wire snapshots atomically', async () => {
  for (const payload of [{ channelId: 'a', version: -1, links: [] }, { channelId: 'a', version: 1, links: [{ ...link, followId: 'bad' }] },
    { channelId: 'a', version: 1, links: [link, { ...link, followId: crypto.randomUUID() }] }]) expect(() => parseFollowState(payload)).toThrow()
  const { client, reply } = setup(), beginning = client.begin(); reply(0); await beginning
  client.accept(snapshot(1, [link, { ...link, followId: 'bad' }]))
  expect(useFollow.getState()).toMatchObject({ ready: false, links: [], version: 0 })
})
