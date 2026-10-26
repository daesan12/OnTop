import { beforeEach, describe, it, expect } from 'vitest'
import {
  receive,
  resetWorld,
  useSession,
  avatars,
} from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { tableState, worldState } from '../../src/network/protocol'
const position = {
  x: 0,
  y: 0.8,
  z: 34,
  yaw: 0,
  moving: false,
  running: false,
  swimming: false,
  lastInputSeq: 0,
}
function emit(type: string, payload: Record<string, unknown>) {
  receive({ type, payload, requestId: null })
}
function channel() {
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', {
    channelId: 'a',
    name: '공원',
    version: 1,
    currentUsers: 2,
    capacity: 4,
    userIds: ['101', '102'],
  })
}
beforeEach(() => resetWorld())
describe('server snapshots and visibility', () => {
  it('keeps 100 approved masked messages and one ten-second bubble without accepting a duplicate or foreign channel', () => {
    channel()
    const before = performance.now()
    for (let i = 0; i < 105; i++) emit('WORLD_CHAT_MESSAGE', {
      messageId: 'chat-' + i, channelId: 'a', userId: '102', text: '씨.발 ' + i, sentAt: '2026-10-25T00:00:00Z',
    })
    emit('WORLD_CHAT_MESSAGE', { messageId: 'chat-104', channelId: 'a', userId: '102', text: 'duplicate', sentAt: '2026-10-25T00:00:00Z' })
    emit('WORLD_CHAT_MESSAGE', { messageId: 'foreign', channelId: 'b', userId: '102', text: 'foreign', sentAt: '2026-10-25T00:00:00Z' })
    const state = useSession.getState()
    expect(state.messages).toHaveLength(100)
    expect(state.messages[0]?.id).toBe('chat-5')
    expect(state.messages.at(-1)?.text).toBe('** 104')
    expect(state.bubbles['102']?.text).toBe('** 104')
    expect(state.bubbles['102']?.expiresAt).toBeGreaterThanOrEqual(before + 10_000)
    expect(state.bubbles['102']?.expiresAt).toBeLessThanOrEqual(performance.now() + 10_000)
  })
  it('applies channel snapshots and ignores lower versions', () => {
    channel()
    emit('CHANNEL_STATE', {
      channelId: 'a',
      name: 'old',
      version: 0,
      currentUsers: 0,
      capacity: 4,
      userIds: [],
    })
    expect(useSession.getState().playerCount).toBe(2)
  })
  it('ignores another channel and out-of-order movement snapshots', () => {
    channel()
    emit('WORLD_STATE', {
      channelId: 'a',
      version: 2,
      mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: '101', position }],
    })
    emit('WORLD_STATE', {
      channelId: 'b',
      version: 9,
      mapVersion: EXPECTED_MAP_VERSION,
      avatars: [],
    })
    emit('WORLD_STATE', {
      channelId: 'a',
      version: 1,
      mapVersion: EXPECTED_MAP_VERSION,
      avatars: [],
    })
    expect([...avatars.keys()]).toEqual(['101'])
  })
  it('blocks map mismatch and removes all world data on channel leave', () => {
    channel()
    emit('WORLD_STATE', {
      channelId: 'a',
      version: 2,
      mapVersion: 'different',
      avatars: [{ userId: '101', position }],
    })
    expect(useSession.getState().mapCompatible).toBe(false)
    emit('CHANNEL_LEFT', { channelId: 'a' })
    expect(avatars.size).toBe(0)
    expect(useSession.getState().roomId).toBe('')
  })
  it('uses the server echo once without timestamp reordering', () => {
    channel()
    const chat = {
      messageId: 'm1',
      channelId: 'a',
      userId: '101',
      text: '안녕',
      sentAt: '2026-10-22T00:00:00Z',
    }
    emit('WORLD_CHAT_MESSAGE', chat)
    emit('WORLD_CHAT_MESSAGE', chat)
    emit('WORLD_CHAT_MESSAGE', {
      ...chat,
      messageId: 'm2',
      sentAt: '2026-10-21T00:00:00Z',
    })
    emit('WORLD_CHAT_MESSAGE', { ...chat, messageId: 'm3', channelId: 'b' })
    expect(useSession.getState().messages.map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ])
  })
  it('clears chat, identities, table versions and private state at disconnect', () => {
    channel()
    emit('WORLD_CHAT_MESSAGE', {
      messageId: 'm',
      channelId: 'a',
      userId: '101',
      text: 'x',
      sentAt: '2026-10-22T00:00:00Z',
    })
    emit('GAME_STATE', { privateState: { cards: ['private-secret'] } })
    expect(JSON.stringify(useSession.getState())).not.toContain(
      'private-secret',
    )
    resetWorld('reconnecting')
    expect(useSession.getState().messages).toEqual([])
    expect(useSession.getState().sessionId).toBe('')
    expect(useSession.getState().tableStates).toEqual({})
  })
  it('rejects non-finite positions and malformed or duplicate seats', () => {
    expect(() =>
      worldState({
        channelId: 'a',
        version: 1,
        mapVersion: EXPECTED_MAP_VERSION,
        avatars: [{ userId: '101', position: { ...position, x: Infinity } }],
      }),
    ).toThrow()
    expect(() =>
      tableState({
        tableId: 't',
        version: 1,
        capacity: 2,
        minimumPlayers: 2,
        seats: [
          { seatNumber: 1, userId: '101', ready: false },
          { seatNumber: 2, userId: '101', ready: false },
        ],
        allReady: false,
        selectorUserId: '101',
        gameCode: null,
        targetScore: null,
      }),
    ).toThrow()
  })
})
