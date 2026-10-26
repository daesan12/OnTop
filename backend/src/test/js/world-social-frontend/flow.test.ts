import { writeFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { SharedSocket } from '../../../../../frontend/src/network/socketClient'
import { tableSummary, type Envelope } from '../../../../../frontend/src/network/protocol'
import { applyFacilityOccupancies, avatars, receive, resetWorld, useSession } from '../../../../../frontend/src/network/worldClient'
import { FollowClient } from '../../../../../frontend/src/features/follow/serverClient'
import { resetFollow, useFollow } from '../../../../../frontend/src/features/follow/state'
import { useEmoteState } from '../../../../../frontend/src/features/emotes/state'
import { emoteUnavailable } from '../../../../../frontend/src/features/emotes/availability'
import { parseEmoteBindings } from '../../../../../frontend/src/features/emotes/catalog'
import { parseFacilitySnapshot } from '../../../../../frontend/src/features/facilities/protocol'

const base = process.env.TEST_SOCIAL_BASE ?? ''
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Loopback Spring server required')
const clients: SharedSocket[] = []
const sent: { userId: string; type: string; payload: Record<string, unknown> }[] = []
const errors: string[] = []
let ticketCount = 0

afterEach(async () => {
  await Promise.all(clients.map(client => client.disconnect()))
  resetFollow(); resetWorld(); vi.unstubAllGlobals()
})

async function peer(userId: string, channelId: string, apply = false) {
  const messages: Envelope[] = []
  const scope = { userId, channelId, generation: 1, connected: false }
  let follow: FollowClient
  const client = new SharedSocket({
    ticket: async signal => {
      const response = await fetch(base + '/api/v1/auth/websocket-ticket', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${process.env['TEST_SOCIAL_TOKEN_' + userId]}` },
      })
      if (!response.ok) throw new Error('Ticket HTTP status ' + response.status)
      ticketCount++
      return (await response.json()).ticket
    },
    socket: ticket => {
      const url = new URL(base.replace('http:', 'ws:') + '/ws/tables')
      url.searchParams.set('ticket', ticket)
      return new class extends WebSocket {
        constructor() { super(url) }
        override send(text: string) {
          const { type, payload } = JSON.parse(text)
          sent.push({ userId, type, payload }); super.send(text)
        }
      }()
    },
    message: message => {
      messages.push(message)
      if (apply) { receive(message); follow.accept(message) }
    },
    closed: () => { scope.connected = false; if (apply) follow.reset() },
    error: message => { errors.push(message) },
  })
  follow = new FollowClient({ scope: () => scope,
    request: (type, payload, expected, onId) => client.request(type, payload, expected, onId) })
  clients.push(client)
  await client.connect()
  scope.connected = true
  await vi.waitFor(() => expect(messages.some(message => message.type === 'CONNECTED')).toBe(true))
  await client.request('CHANNEL_JOIN', { channelId }, ['CHANNEL_STATE'])
  if (apply) await follow.begin()
  return { client, messages, follow, scope }
}

it('actual HTTP tickets and WS responses update FE follow/emote state, isolate channels and reset on reconnect', async () => {
  vi.stubGlobal('window', { location: new URL(base + '/park') })
  resetWorld(); resetFollow()
  const otherChannel = await peer('505', 'b')
  const target = await peer('202', 'a')
  const owner = await peer('101', 'a', true)
  const signal = new AbortController().signal
  await vi.waitFor(() => expect(avatars.get('202')?.connected).toBe(true))
  expect(useSession.getState().mapCompatible).toBe(true)
  expect(useFollow.getState()).toMatchObject({ ready: true, links: [] })
  await owner.follow.start(owner.scope, '202', signal)
  const first = useFollow.getState().links[0]!
  expect(first).toMatchObject({ followerId: '101', targetId: '202' })
  expect(first.followId).toMatch(/^[0-9a-f-]{36}$/)
  await owner.client.request('WORLD_MOVE', { seq: 1, dx: 0, dz: 0, run: false }, ['WORLD_STATE'])
  expect(useFollow.getState().links).toEqual([first])
  await owner.client.request('WORLD_MOVE', { seq: 2, dx: 1, dz: 0, run: false }, ['WORLD_STATE'])
  await vi.waitFor(() => expect(useFollow.getState().links).toEqual([]))
  expect(sent.filter(message => message.type === 'WORLD_FOLLOW_STOP')).toHaveLength(0)
  await owner.client.request('WORLD_MOVE', { seq: 3, dx: 0, dz: 0, run: false }, ['WORLD_STATE'])

  // Browser rendering is not simulated: these are the real FE presentation stores and parser.
  useEmoteState.setState({ bindings: parseEmoteBindings([{ motion: 'EMOTE_WAVE', code: 'WAVE' }]) })
  expect(emoteUnavailable('EMOTE_WAVE')).toBe('')
  const approval = await owner.client.request('WORLD_EMOTE_SEND', { emoteCode: 'WAVE' }, ['WORLD_EMOTE_EVENT'],
    requestId => useEmoteState.setState({ pending: true, requested: 'EMOTE_WAVE', requestId, cancelled: false }))
  expect(avatars.get('101')?.emote).toBe('EMOTE_WAVE')
  const cooldown = useEmoteState.getState().readyAt
  useEmoteState.setState({ pending: false })
  await owner.follow.start(owner.scope, '202', signal)
  await vi.waitFor(() => expect(owner.messages.some(message => message.type === 'WORLD_EMOTE_CANCELLED'
    && message.payload.emoteEventId === approval.payload.eventId && message.payload.reason === 'ACTIVITY_STARTED')).toBe(true))
  expect(avatars.get('101')?.emote).toBe('')
  expect(useEmoteState.getState().readyAt).toBe(cooldown)
  const cancellationApplied = avatars.get('101')?.emote === '' && useEmoteState.getState().readyAt === cooldown
  useEmoteState.setState({ pending: true, requestId: approval.requestId!, requested: 'EMOTE_WAVE' })
  receive(approval) // Even a pending request cannot replay its real, already-cancelled approval.
  expect(avatars.get('101')?.emote).toBe('')
  useEmoteState.setState({ pending: false })

  // Populate the table list from the actual HTTP contract, not an invented table snapshot.
  const tablesResponse = await fetch(base + '/api/v1/tables?channelId=a', {
    headers: { Authorization: `Bearer ${process.env.TEST_SOCIAL_TOKEN_101}` },
  })
  expect(tablesResponse.status).toBe(200)
  const tables = (await tablesResponse.json()).tables.map(tableSummary)
  useSession.setState({ tables })
  const tableId = tables[0]!.tableId
  await target.client.request('TABLE_JOIN', { tableId }, ['TABLE_STATE'])
  await vi.waitFor(() => expect(useFollow.getState().links).toEqual([]))
  await owner.client.request('TABLE_JOIN', { tableId }, ['TABLE_STATE'])
  expect(useSession.getState().tableId).toBe(tableId)
  expect(emoteUnavailable('EMOTE_WAVE', cooldown + 1)).toContain('시설 이용')
  await expect(owner.client.request('WORLD_EMOTE_SEND', { emoteCode: 'WAVE' }, ['WORLD_EMOTE_EVENT']))
    .rejects.toMatchObject({ code: 'EMOTE_ACTIVITY_CONFLICT' })
  await owner.client.request('TABLE_LEAVE', {}, ['TABLE_LEFT'])
  await target.client.request('TABLE_LEAVE', {}, ['TABLE_LEFT'])

  const occupied = await owner.client.request('WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 0 }, ['WORLD_FACILITY_STATE'])
  const occupancy = parseFacilitySnapshot(occupied.payload)
  applyFacilityOccupancies(occupancy.occupancies)
  expect(useSession.getState().benchId).toBe('bench-0')
  expect(emoteUnavailable('EMOTE_WAVE', cooldown + 1)).toContain('시설 이용')
  await expect(owner.client.request('WORLD_EMOTE_SEND', { emoteCode: 'WAVE' }, ['WORLD_EMOTE_EVENT']))
    .rejects.toMatchObject({ code: 'EMOTE_ACTIVITY_CONFLICT' })
  const released = await owner.client.request('WORLD_FACILITY_RELEASE', { leaseId: occupancy.occupancies[0]!.leaseId }, ['WORLD_FACILITY_STATE'])
  applyFacilityOccupancies(parseFacilitySnapshot(released.payload).occupancies)
  expect(useSession.getState().benchId).toBe('')

  await owner.follow.start(owner.scope, '202', signal)
  const secondId = useFollow.getState().links[0]!.followId
  await owner.follow.stop(owner.scope, signal)
  expect(sent.filter(message => message.type === 'WORLD_FOLLOW_STOP').at(-1)?.payload).toEqual({ followId: secondId })
  expect(useFollow.getState().links).toEqual([])
  await owner.follow.start(owner.scope, '202', signal)
  await target.client.disconnect()
  await vi.waitFor(() => expect(useFollow.getState().links).toEqual([]))
  const returnedTarget = await peer('202', 'a')
  await vi.waitFor(() => expect(avatars.get('202')?.connected).toBe(true))
  expect(useFollow.getState().links).toEqual([])
  await owner.follow.start(owner.scope, '202', signal)
  expect(useFollow.getState().links).toHaveLength(1)
  await vi.waitFor(() => expect(returnedTarget.messages.some(message => message.type === 'WORLD_FOLLOW_STATE'
    && (message.payload.links as { followerId: string }[]).some(link => link.followerId === '101'))).toBe(true))
  const starts = sent.filter(message => message.type === 'WORLD_FOLLOW_START').length
  const beforeDisconnect = returnedTarget.messages.length
  await owner.client.disconnect()
  await vi.waitFor(() => expect(returnedTarget.messages.slice(beforeDisconnect).some(message => message.type === 'WORLD_FOLLOW_STATE'
    && (message.payload.links as unknown[]).length === 0)).toBe(true))
  resetWorld(); resetFollow()
  const returned = await peer('101', 'a', true)
  expect(useFollow.getState()).toMatchObject({ ready: true, links: [] })
  expect(sent.filter(message => message.type === 'WORLD_FOLLOW_START')).toHaveLength(starts)
  expect(returned.messages.some(message => message.type === 'WORLD_FOLLOW_STATE')).toBe(true)
  // A final ACK fences observation on the other channel's ordered connection.
  await otherChannel.client.request('WORLD_FOLLOW_CHECK', {}, ['WORLD_FOLLOW_STATE'])
  expect(otherChannel.messages.filter(message => ['WORLD_EMOTE_EVENT', 'WORLD_EMOTE_CANCELLED'].includes(message.type))).toEqual([])
  expect(otherChannel.messages.filter(message => message.type === 'WORLD_FOLLOW_STATE')
    .every(message => message.payload.channelId === 'b' && (message.payload.links as unknown[]).length === 0)).toBe(true)
  expect(ticketCount).toBe(5)
  expect(errors).toEqual([])
  writeFileSync(process.env.TEST_SOCIAL_DIAGNOSTICS!, JSON.stringify({
    ticketCount,
    followStarts: sent.filter(message => message.type === 'WORLD_FOLLOW_START').length,
    explicitStops: sent.filter(message => message.type === 'WORLD_FOLLOW_STOP').length,
    serverCancellations: owner.messages.filter(message => message.type === 'WORLD_EMOTE_CANCELLED').length,
    cancellationApplied,
    restoredLinks: useFollow.getState().links.length,
    otherChannelEmotes: otherChannel.messages.filter(message => ['WORLD_EMOTE_EVENT', 'WORLD_EMOTE_CANCELLED'].includes(message.type)).length,
    transportErrors: errors.length,
  }, null, 2))
  console.log('[SOCIAL_FLOW] real JWT/ticket/WS + FE SharedSocket/FollowClient/worldClient: approval, zero input, direct release, matching emote cancellation, cooldown retention, table/bench restriction, channel isolation, fresh reconnect; Node browser adapter, member lookup/placement fixtures; no DB/3D/deployment')
})
