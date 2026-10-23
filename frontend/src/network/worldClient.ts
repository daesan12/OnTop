import { create } from 'zustand'
import { NETWORK, TABLES, tableSeats, type CharacterId } from '../config'
import {
  channelState,
  worldState,
  tableState,
  type Envelope,
  type Channel,
  type TableSummary,
  type TableState,
} from './protocol'
import type { TableBinding } from './tableBindings'
import { EXPECTED_MAP_VERSION } from '../config/mapVersion'
import { resetGame } from '../game/store'

export interface Pose {
  x: number
  y: number
  z: number
  yaw: number
}
export interface AvatarSnapshot {
  previous: Pose
  current: Pose
  at: number
  nickname: string
  color: number
  character?: CharacterId
  moving: boolean
  running: boolean
  swimming: boolean
  connected: boolean
  emote: string
  emoteAt: number
  tableId: string
  seatIndex: number
  benchId: string
  fitnessId: string
  fitnessStartedAt: number
  telescopeId: string
  telescopeYaw: number
  telescopePitch: number
  followTargetId: string
}
export interface ChatMessage {
  id: string
  userId: string
  text: string
  sentAt: string
}
/** Frontend display port, not a proposed backend profile response. */
export interface DisplayProfile {
  nickname: string
  character: CharacterId
}
export interface Session {
  status: 'idle' | 'joining' | 'connected' | 'reconnecting' | 'error'
  error: string
  sessionId: string
  roomId: string
  channelName: string
  capacity: number
  playerCount: number
  ids: string[]
  channels: Channel[]
  messages: ChatMessage[]
  bubbles: Record<string, ChatMessage & { expiresAt: number }>
  tableId: string
  seatIndex: number
  focusedAnchorId: string
  tables: TableSummary[]
  tableStates: Record<string, TableState>
  watchedTableId: string
  pending: boolean
  bindings: TableBinding[]
  mapCompatible: boolean
  mapVersion: string
  // Unsupported facility state stays absent; renderers never invent server occupancy.
  telescopeId: string
  benchId: string
  profiles: Record<string, DisplayProfile>
  account: { nickname: string; balance: number | null } | null
}
const initial = (): Session => ({
  status: 'idle',
  error: '',
  sessionId: '',
  roomId: '',
  channelName: '',
  capacity: 0,
  playerCount: 0,
  ids: [],
  channels: [],
  messages: [],
  bubbles: {},
  tableId: '',
  seatIndex: -1,
  focusedAnchorId: '',
  tables: [],
  tableStates: {},
  watchedTableId: '',
  pending: false,
  bindings: [],
  mapCompatible: false,
  mapVersion: '',
  telescopeId: '',
  benchId: '',
  profiles: {},
  account: null,
})
export const useSession = create<Session>(initial)
export const avatars = new Map<string, AvatarSnapshot>()
const worldPoses = new Map<string, Pose>()
export const networkStats = {
  rtt: 0,
  snapshotAt: 0,
  serverTime: 0,
  inputs: 0,
  patches: 0,
  connectedAt: 0,
}
let channelVersion = -1,
  worldVersion = -1
const chatIds = new Set<string>()
const emoteIds = new Set<string>()
export function resetWorld(status: Session['status'] = 'idle', error = '') {
  resetGame()
  avatars.clear()
  worldPoses.clear()
  channelVersion = worldVersion = -1
  chatIds.clear()
  emoteIds.clear()
  useSession.setState({ ...initial(), status, error })
}
export function clearChannel() {
  resetGame()
  avatars.clear()
  worldPoses.clear()
  channelVersion = worldVersion = -1
  chatIds.clear()
  emoteIds.clear()
  useSession.setState({
    roomId: '',
    channelName: '',
    capacity: 0,
    playerCount: 0,
    ids: [],
    messages: [],
    bubbles: {},
    tables: [],
    tableStates: {},
    watchedTableId: '',
    tableId: '',
    seatIndex: -1,
    focusedAnchorId: '',
    mapVersion: '',
    mapCompatible: false,
  })
}
export function sampleAvatar(
  avatar: AvatarSnapshot,
  now: number,
  target: Pose,
): Pose {
  const t = Math.min(
    1,
    Math.max(0, (now - avatar.at) / NETWORK.interpolationMs),
  )
  for (const k of ['x', 'y', 'z'] as const)
    target[k] =
      avatar.previous[k] + (avatar.current[k] - avatar.previous[k]) * t
  target.yaw =
    avatar.previous.yaw +
    Math.atan2(
      Math.sin(avatar.current.yaw - avatar.previous.yaw),
      Math.cos(avatar.current.yaw - avatar.previous.yaw),
    ) *
      t
  return target
}
export const estimatedServerTime = () => Date.now() // Only for events carrying server ISO timestamps; world day clock is separate.
function applySeats() {
  const state = useSession.getState()
  for (const [id, a] of avatars) {
    a.tableId = ''
    a.seatIndex = -1
    const authoritative = worldPoses.get(id)
    if (authoritative) a.current = { ...authoritative }
    for (const table of Object.values(state.tableStates)) {
      const seat = table.seats.find((s) => s.userId === id)
      const binding = state.bindings.find(
        (b) => b.channelId === state.roomId && b.tableId === table.tableId,
      )
      const anchor = TABLES.find((t) => t.id === binding?.anchorId)
      if (!seat || !anchor) continue
      const position = tableSeats(anchor)[seat.seatNumber - 1]
      if (!position) continue
      a.tableId = anchor.id
      a.seatIndex = seat.seatNumber - 1
      a.moving = a.running = false
      a.current = {
        x: anchor.position[0] + position.x,
        y: anchor.position[1] + 0.8,
        z: anchor.position[2] + position.z,
        yaw: position.yaw,
      }
      a.previous = { ...a.current }
    }
  }
}
export function receive(message: Envelope) {
  const p = message.payload,
    state = useSession.getState()
  switch (message.type) {
    case 'CONNECTED':
      if (typeof p.userId !== 'string' || !p.userId)
        throw new Error('사용자 연결 상태를 확인할 수 없습니다.')
      useSession.setState({ status: 'connected', sessionId: p.userId })
      break
    case 'CHANNEL_STATE': {
      const next = channelState(p)
      if (state.roomId && state.roomId !== next.channelId) return
      if (next.version < channelVersion) return
      channelVersion = next.version
      useSession.setState({
        roomId: next.channelId,
        channelName: next.name,
        capacity: next.capacity,
        playerCount: next.currentUsers,
      })
      break
    }
    case 'CHANNEL_LEFT':
      clearChannel()
      break
    case 'WORLD_STATE': {
      const next = worldState(p)
      if (
        !state.roomId ||
        state.roomId !== next.channelId ||
        next.version < worldVersion
      )
        return
      worldVersion = next.version
      const mapCompatible = next.mapVersion === EXPECTED_MAP_VERSION
      const ids = next.avatars.map((a) => a.userId),
        now = performance.now()
      for (const id of avatars.keys())
        if (!ids.includes(id)) {
          avatars.delete(id)
          worldPoses.delete(id)
        }
      for (const { userId, position } of next.avatars) {
        worldPoses.set(userId, {
          x: position.x,
          y: position.y,
          z: position.z,
          yaw: position.yaw,
        })
        const old = avatars.get(userId),
          previous = {
            x: position.x,
            y: position.y,
            z: position.z,
            yaw: position.yaw,
          }
        if (old) sampleAvatar(old, now, previous)
        avatars.set(userId, {
          previous,
          current: { ...position },
          at: now,
          nickname:
            state.profiles[userId]?.nickname ??
            (userId === state.sessionId ? '나' : '산책자 ' + userId.slice(-6)),
          color: 0,
          character: state.profiles[userId]?.character ?? 'man',
          moving: position.moving,
          running: position.running,
          swimming: position.swimming,
          connected: true,
          emote: old?.emote ?? '',
          emoteAt: old?.emoteAt ?? 0,
          tableId: '',
          seatIndex: -1,
          benchId: '',
          fitnessId: '',
          fitnessStartedAt: 0,
          telescopeId: '',
          telescopeYaw: 0,
          telescopePitch: 0,
          followTargetId: '',
        })
      }
      applySeats()
      networkStats.snapshotAt = now
      networkStats.patches++
      useSession.setState({
        ids: ids.join('\0') === state.ids.join('\0') ? state.ids : ids,
        mapCompatible,
        mapVersion: next.mapVersion,
        ...(!mapCompatible
          ? {
              error:
                '서버 맵 버전이 달라 이동·착석을 잠시 중지했습니다. 배치 파일을 확인해주세요.',
            }
          : {}),
      })
      break
    }
    case 'WORLD_CHAT_MESSAGE': {
      if (p.channelId !== state.roomId) return
      if (
        typeof p.messageId !== 'string' ||
        typeof p.userId !== 'string' ||
        typeof p.text !== 'string' ||
        typeof p.sentAt !== 'string' ||
        !Number.isFinite(Date.parse(p.sentAt))
      )
        throw new Error('채팅 형식이 올바르지 않습니다.')
      if (chatIds.has(p.messageId)) return
      const chat = {
        id: p.messageId,
        userId: p.userId,
        text: p.text,
        sentAt: p.sentAt,
      }
      chatIds.add(chat.id)
      const messages = [...state.messages, chat].slice(-200)
      if (chatIds.size > 400) {
        chatIds.clear()
        messages.forEach((m) => chatIds.add(m.id))
      }
      useSession.setState({
        messages,
        bubbles: {
          ...state.bubbles,
          [chat.userId]: { ...chat, expiresAt: performance.now() + 10_000 },
        },
      })
      break
    }
    case 'WORLD_EMOTE_EVENT':
      // Final emote catalog is not supplied yet; receiving an event does not authorize a guessed motion mapping.
      if (typeof p.eventId === 'string') {
        emoteIds.add(p.eventId)
        if (emoteIds.size > 200) emoteIds.clear()
      }
      break
    case 'TABLE_STATE':
    case 'TABLE_WATCH_STATE': {
      const next = tableState(p)
      if (!state.tables.some((t) => t.tableId === next.tableId)) return
      if (next.version < (state.tableStates[next.tableId]?.version ?? -1))
        return
      const own = next.seats.find((s) => s.userId === state.sessionId)
      const participating = message.type === 'TABLE_STATE'
      useSession.setState({
        tableStates: { ...state.tableStates, [next.tableId]: next },
        ...(participating
          ? {
              tableId: own ? next.tableId : '',
              seatIndex: own ? own.seatNumber - 1 : -1,
            }
          : { watchedTableId: next.tableId }),
      })
      applySeats()
      break
    }
    case 'TABLE_LEFT': {
      const tableStates = { ...state.tableStates }
      delete tableStates[state.tableId]
      useSession.setState({ tableId: '', seatIndex: -1, tableStates })
      applySeats()
      break
    }
    case 'TABLE_WATCH_LEFT': {
      const tableStates = { ...state.tableStates }
      delete tableStates[state.watchedTableId]
      useSession.setState({ watchedTableId: '', tableStates })
      applySeats()
      break
    }
    case 'ERROR':
      if (typeof p.message === 'string')
        useSession.setState({ error: p.message })
      break
    // Game messages are validated separately by game/store; no private payload is cached here.
  }
}
