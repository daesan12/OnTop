import { create } from 'zustand'
import { NETWORK, OVERHEAD, TABLES, tableSeats, type CharacterId } from '../config'
import { CHAT } from '../features/chat/settings'
import { filterChat } from '../features/chat/filterChat'
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
import { resetBenchState, useBenchState } from '../features/interactions/benchState'
import { clearRoamingInput } from '../world/inputOwnership'
import { samePose, sampleMovement } from '../world/movementPresentation'
import { EmoteTimeline, parseEmoteEvent, parseEmoteCancellation, type EmoteEvent } from '../features/emotes/timeline'
import { resetEmotes, useEmoteState } from '../features/emotes/state'
import { findEmote, type EmoteId } from '../features/emotes/catalog'
import { releaseFitnessUser, resetFitnessState, useFitnessState } from '../features/fitness/state'
import { releaseTelescopeUser, resetTelescopeState, useTelescopeState } from '../features/telescopes/state'
import { resetTelescopeView, telescopeView } from '../features/telescopeView'
import { resetFeedbackState, useFeedbackState } from '../features/feedback/state'
import { canReachFeedback } from '../features/feedback/validation'
import { resetNotesState, useNotesState } from '../features/notes/state'
import { canReachNotes } from '../features/notes/validation'
import { resetTableLobby } from '../features/tableLobby/state'
import { publicMatchService } from '../features/tableLobby/publicMatch'
import { resetFacilities } from '../features/facilities/state'
import type { FacilityLease } from '../features/facilities/protocol'
import { sameEquipment, type PublicEquipment } from './equipment'
import { resetFollow } from '../features/follow/state'
import { resetBenchSpectator } from '../features/interactions/benchSpectator'

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
/** Display values shared by users/me and approved WORLD_STATE public profiles. */
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
  // Facility display IDs come from explicit development leases, never guessed wire fields.
  telescopeId: string
  benchId: string
  fitnessId: string
  profiles: Record<string, DisplayProfile>
  equipment: Record<string, readonly PublicEquipment[]>
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
  fitnessId: '',
  profiles: {},
  equipment: {},
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
const emoteTimeline = new EmoteTimeline()
export function resetWorld(status: Session['status'] = 'idle', error = '') {
  resetFollow()
  resetBenchSpectator()
  resetFacilities()
  resetNotesState(status !== 'idle')
  resetFeedbackState(status !== 'idle')
  resetFitnessState()
  resetTelescopeState()
  resetEmotes(true)
  emoteTimeline.clearChannel()
  resetGame()
  resetTableLobby()
  publicMatchService.clear()
  resetBenchState()
  clearRoamingInput()
  avatars.clear()
  worldPoses.clear()
  channelVersion = worldVersion = -1
  chatIds.clear()
  useSession.setState({ ...initial(), status, error })
}
export function clearChannel(keepFeedbackDraft = false, keepNotesDraft = false) {
  resetFollow()
  resetBenchSpectator()
  const { sessionId, profiles } = useSession.getState()
  resetFacilities()
  resetNotesState(keepNotesDraft)
  resetFeedbackState(keepFeedbackDraft)
  resetFitnessState()
  resetTelescopeState()
  resetEmotes()
  emoteTimeline.clearChannel()
  resetGame()
  resetTableLobby()
  publicMatchService.clear()
  resetBenchState()
  clearRoamingInput()
  avatars.clear()
  worldPoses.clear()
  channelVersion = worldVersion = -1
  chatIds.clear()
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
    benchId: '',
    fitnessId: '',
    telescopeId: '',
    profiles: profiles[sessionId] ? { [sessionId]: profiles[sessionId] } : {},
    equipment: {},
  })
}
export function sampleAvatar(
  avatar: AvatarSnapshot,
  now: number,
  target: Pose,
): Pose {
  return sampleMovement(avatar, now, NETWORK.interpolationMs, target)
}
export const estimatedServerTime = () => Date.now() // Only for events carrying server ISO timestamps; world day clock is separate.
export function cancelAvatarEmote(userId: string) {
  emoteTimeline.cancel(userId, estimatedServerTime())
  stopAvatarEmote(userId)
}
function stopAvatarEmote(userId: string) {
  const avatar = avatars.get(userId)
  if (avatar) { avatar.emote = ''; avatar.emoteAt = 0 }
  if (userId === useSession.getState().sessionId && useEmoteState.getState().pending)
    useEmoteState.setState({ cancelled: true, notice: '이동이나 이용 상태 변경으로 감정표현이 취소되었습니다.' })
}
export function presentEmote(event: EmoteEvent, motion: EmoteId, source: 'server' | 'mock') {
  const state = useSession.getState(), avatar = avatars.get(event.userId)
  if (state.status !== 'connected' || event.channelId !== state.roomId || !state.mapCompatible
    || !avatar?.connected || avatar.moving || avatar.swimming || avatar.seatIndex >= 0 || avatar.fitnessId || avatar.telescopeId) return false
  const playback = emoteTimeline.accept(event, motion, estimatedServerTime())
  if (!playback) return false
  avatar.emote = playback.motion
  avatar.emoteAt = playback.at
  if (event.userId === state.sessionId) useEmoteState.setState(s => ({
    readyAt: Math.max(s.readyAt, playback.readyAt),
    notice: source === 'mock' ? '목업 감정표현 · 이 화면에서만 표시됩니다.' : '',
  }))
  return true
}
export const authoritativePose = (userId: string): Pose | undefined => {
  const pose = worldPoses.get(userId)
  return pose ? { ...pose } : undefined
}
/** Full server occupancy projection. Wire pose/exit never overwrite WORLD_STATE coordinates. */
export function applyFacilityOccupancies(leases: readonly FacilityLease[]) {
  const benches: Record<string, import('../features/interactions/benchContracts').BenchLease> = {}
  const fitness: Record<string, import('../features/fitness/contracts').FitnessLease> = {}
  const telescopes: Record<string, import('../features/telescopes/contracts').TelescopeLease> = {}
  for (const lease of leases) {
    const common = { leaseId: lease.leaseId, userId: lease.userId, channelId: lease.channelId, pose: lease.pose, exit: lease.exit }
    if (lease.kind === 'BENCH') benches[lease.userId] = { ...common, benchId: lease.facilityId, seat: lease.seatIndex as 0 | 1 }
    if (lease.kind === 'FITNESS') fitness[lease.userId] = { ...common, stationId: lease.facilityId, startedAt: Date.parse(lease.startedAt) }
    if (lease.kind === 'TELESCOPE') telescopes[lease.userId] = { ...common, grantId: lease.leaseId,
      telescopeId: lease.facilityId, yaw: lease.yaw, pitch: lease.pitch }
  }
  useBenchState.setState({ placements: benches })
  useFitnessState.setState({ placements: fitness })
  useTelescopeState.setState({ placements: telescopes })
  refreshActivityPresentation()
}
export function refreshActivityPresentation() {
  const state = useSession.getState()
  for (const table of Object.values(state.tableStates)) for (const seat of table.seats)
    if (seat.userId && useTelescopeState.getState().placements[seat.userId] && !useTelescopeState.getState().placements[seat.userId]!.leaseId) releaseTelescopeUser(seat.userId)
  for (const table of Object.values(state.tableStates)) for (const seat of table.seats)
    if (seat.userId && useFitnessState.getState().placements[seat.userId] && !useFitnessState.getState().placements[seat.userId]!.leaseId) releaseFitnessUser(seat.userId)
  if (Object.values(state.tableStates).some(table => table.seats.some(seat =>
    seat.userId && useBenchState.getState().placements[seat.userId] && !useBenchState.getState().placements[seat.userId]!.leaseId))) resetBenchState()
  for (const [id, a] of avatars) {
    const previousActivity = a.tableId || a.benchId || a.fitnessId || a.telescopeId
    a.tableId = ''
    a.benchId = ''
    a.fitnessId = ''
    a.fitnessStartedAt = 0
    a.telescopeId = ''
    a.telescopeYaw = a.telescopePitch = 0
    a.seatIndex = -1
    const authoritative = worldPoses.get(id)
    if (authoritative) a.current = { ...authoritative }
    for (const table of Object.values(state.tableStates)) {
      if (useBenchState.getState().placements[id]?.leaseId || useFitnessState.getState().placements[id]?.leaseId
        || useTelescopeState.getState().placements[id]?.leaseId) break
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
    const bench = useBenchState.getState().placements[id]
    if (!a.tableId && bench?.channelId === state.roomId) {
      if (useTelescopeState.getState().placements[id]) releaseTelescopeUser(id)
      if (useFitnessState.getState().placements[id]) releaseFitnessUser(id)
      a.benchId = bench.benchId
      a.seatIndex = bench.seat
      a.current = { ...(bench.leaseId ? authoritative ?? a.current : bench.pose) }
      a.previous = { ...a.current }
      a.moving = a.running = false
    }
    const fitness = useFitnessState.getState().placements[id]
    if (!a.tableId && !a.benchId && fitness?.channelId === state.roomId) {
      if (useTelescopeState.getState().placements[id]) releaseTelescopeUser(id)
      a.fitnessId = fitness.stationId
      a.fitnessStartedAt = fitness.startedAt
      a.current = { ...(fitness.leaseId ? authoritative ?? a.current : fitness.pose) }
      a.previous = { ...a.current }
      a.moving = a.running = false
    }
    const telescope = useTelescopeState.getState().placements[id]
    if (!a.tableId && !a.benchId && !a.fitnessId && telescope?.channelId === state.roomId) {
      a.telescopeId = telescope.telescopeId
      a.telescopeYaw = telescope.yaw
      a.telescopePitch = telescope.pitch
      a.current = { ...(telescope.leaseId ? authoritative ?? a.current : telescope.pose), yaw: telescope.yaw }
      a.previous = { ...a.current }
      a.moving = a.running = false
    }
    const activity = a.tableId || a.benchId || a.fitnessId || a.telescopeId
    if (activity && previousActivity !== activity) cancelAvatarEmote(id)
  }
  const own = avatars.get(state.sessionId)
  const benchId = own?.benchId ?? ''
  const fitnessId = own?.fitnessId ?? ''
  const telescopeId = own?.telescopeId ?? ''
  if (telescopeView.id !== telescopeId) {
    resetTelescopeView(telescopeId)
    const lease = useTelescopeState.getState().placements[state.sessionId]
    if (lease?.leaseId) { telescopeView.yaw = lease.yaw; telescopeView.pitch = lease.pitch }
  }
  if (state.benchId !== benchId || state.fitnessId !== fitnessId || state.telescopeId !== telescopeId)
    useSession.setState({ benchId, fitnessId, telescopeId })
  if (useFeedbackState.getState().open && (!own?.connected || own.seatIndex >= 0 || own.fitnessId
    || own.telescopeId || own.swimming || !canReachFeedback(authoritativePose(state.sessionId)))) resetFeedbackState(true)
  if (useNotesState.getState().open && (!own?.connected || own.seatIndex >= 0 || own.fitnessId
    || own.telescopeId || own.swimming || !canReachNotes(authoritativePose(state.sessionId)))) resetNotesState(true)
}
export function receive(message: Envelope) {
  const p = message.payload,
    state = useSession.getState()
  switch (message.type) {
    case 'CONNECTED':
      if (typeof p.userId !== 'string' || !p.userId)
        throw new Error('사용자 연결 상태를 확인할 수 없습니다.')
      if (useFeedbackState.getState().ownerId && useFeedbackState.getState().ownerId !== p.userId) resetFeedbackState()
      if (useNotesState.getState().ownerId && useNotesState.getState().ownerId !== p.userId) resetNotesState()
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
      if (!mapCompatible) { resetBenchState(); resetFitnessState(); resetTelescopeState(); resetFeedbackState(true); resetNotesState(true); clearRoamingInput() }
      const ids = next.avatars.map((a) => a.userId),
        now = performance.now()
      // Preserve the last approved values while the server's async profile read is pending.
      // Copy only on profile changes; movement ticks keep the same store references.
      let profiles = state.profiles
      let equipment = state.equipment
      const present = new Set(ids)
      for (const id of Object.keys(equipment)) {
        if (present.has(id)) continue
        if (equipment === state.equipment) equipment = { ...equipment }
        delete equipment[id]
      }
      for (const avatar of next.avatars) {
        // null/missing is an unfinished or failed DB read, not an unequip command.
        if (avatar.equipment == null || sameEquipment(equipment[avatar.userId], avatar.equipment)) continue
        if (equipment === state.equipment) equipment = { ...equipment }
        equipment[avatar.userId] = avatar.equipment.map(({ itemId, itemCode, equipSlot, imageKey }) => ({ itemId, itemCode, equipSlot, imageKey }))
      }
      for (const id of Object.keys(profiles)) {
        if (id !== state.sessionId && !present.has(id)) {
          if (profiles === state.profiles) profiles = { ...profiles }
          delete profiles[id]
        }
      }
      for (const avatar of next.avatars) {
        if (avatar.nickname == null && avatar.characterGender == null) continue
        const previous = profiles[avatar.userId]
        const profile: DisplayProfile = {
          nickname: avatar.nickname ?? previous?.nickname
            ?? (avatar.userId === state.sessionId ? '나' : '산책자 ' + avatar.userId.slice(-6)),
          character: avatar.characterGender === 'FEMALE' ? 'girl' : avatar.characterGender === 'MALE' ? 'man'
            : previous?.character ?? 'man',
        }
        if (previous?.nickname !== profile.nickname || previous?.character !== profile.character) {
          if (profiles === state.profiles) profiles = { ...profiles }
          profiles[avatar.userId] = profile
        }
      }
      if (!ids.includes(state.sessionId)) {
        cancelAvatarEmote(state.sessionId)
        clearRoamingInput()
      }
      if ((!ids.includes(state.sessionId) && !Object.values(useBenchState.getState().placements).some(lease => lease.leaseId))
        || Object.entries(useBenchState.getState().placements).some(([id, lease]) => !lease.leaseId && !ids.includes(id))) resetBenchState()
      if (!ids.includes(state.sessionId) && !Object.values(useFitnessState.getState().placements).some(lease => lease.leaseId)) resetFitnessState()
      else for (const [id, lease] of Object.entries(useFitnessState.getState().placements)) if (!lease.leaseId && !ids.includes(id)) releaseFitnessUser(id)
      if (!ids.includes(state.sessionId) && !Object.values(useTelescopeState.getState().placements).some(lease => lease.leaseId)) resetTelescopeState()
      else for (const [id, lease] of Object.entries(useTelescopeState.getState().placements)) if (!lease.leaseId && !ids.includes(id)) releaseTelescopeUser(id)
      for (const id of avatars.keys())
        if (!ids.includes(id)) {
          avatars.delete(id)
          worldPoses.delete(id)
          emoteTimeline.forget(id)
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
        const unchanged = old && samePose(old.current, position)
        if (old) {
          if (unchanged) Object.assign(previous, old.previous)
          else sampleAvatar(old, now, previous)
        }
        avatars.set(userId, {
          previous,
          current: { ...position },
          at: unchanged ? old.at : now,
          nickname:
            profiles[userId]?.nickname ??
            (userId === state.sessionId ? '나' : '산책자 ' + userId.slice(-6)),
          color: 0,
          character: profiles[userId]?.character ?? 'man',
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
        if ((old?.emote || (userId === state.sessionId && useEmoteState.getState().pending)) &&
          (position.moving || position.swimming || (old && Math.abs(position.y - old.current.y) > 0.08))) cancelAvatarEmote(userId)
      }
      refreshActivityPresentation()
      networkStats.snapshotAt = now
      networkStats.patches++
      useSession.setState({
        ids: ids.join('\0') === state.ids.join('\0') ? state.ids : ids,
        profiles,
        equipment,
        ...(state.account && profiles[state.sessionId]
          && state.account.nickname !== profiles[state.sessionId]!.nickname
          ? { account: { ...state.account, nickname: profiles[state.sessionId]!.nickname } } : {}),
        mapCompatible,
        mapVersion: next.mapVersion,
        ...(!mapCompatible
          ? {
              error:
                '서버 맵 버전이 달라 이동·착석을 잠시 중지했습니다. 배치 파일을 확인해주세요.',
            }
          : {}),
      })
      if (state.mapCompatible && !mapCompatible) {
        resetEmotes()
        for (const id of avatars.keys()) cancelAvatarEmote(id)
        clearRoamingInput()
      }
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
        text: filterChat(p.text),
        sentAt: p.sentAt,
      }
      chatIds.add(chat.id)
      const messages = [...state.messages, chat].slice(-CHAT.historyLimit)
      if (chatIds.size > 400) {
        chatIds.clear()
        messages.forEach((m) => chatIds.add(m.id))
      }
      useSession.setState({
        messages,
        bubbles: {
          ...state.bubbles,
          [chat.userId]: { ...chat, expiresAt: performance.now() + OVERHEAD.bubbleDurationMs },
        },
      })
      break
    }
    case 'WORLD_EMOTE_CANCELLED': {
      if (state.status !== 'connected' || !state.mapCompatible || p.channelId !== state.roomId) return
      const cancellation = parseEmoteCancellation(p)
      if (emoteTimeline.cancelEvent(cancellation, estimatedServerTime())) stopAvatarEmote(cancellation.userId)
      break
    }
    case 'WORLD_EMOTE_EVENT': {
      if (p.channelId !== state.roomId) return
      const event = parseEmoteEvent(p), emoteState = useEmoteState.getState()
      const motion = (Object.entries(emoteState.bindings) as [EmoteId, string][])
        .find(([, code]) => code === event.emoteCode)?.[0]
      if (!motion) return
      if (event.userId === state.sessionId) {
        if (!emoteState.pending || message.requestId !== emoteState.requestId || motion !== emoteState.requested) return
        const at = Date.parse(event.sentAt)
        if (at > estimatedServerTime() + 5000) return
        useEmoteState.setState(s => ({ readyAt: Math.max(s.readyAt, at + findEmote(motion)!.cooldownMs) }))
        if (emoteState.cancelled) return
      }
      presentEmote(event, motion, 'server')
      break
    }
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
      refreshActivityPresentation()
      break
    }
    case 'TABLE_LEFT': {
      const tableStates = { ...state.tableStates }
      delete tableStates[state.tableId]
      useSession.setState({ tableId: '', seatIndex: -1, tableStates })
      refreshActivityPresentation()
      break
    }
    case 'TABLE_WATCH_LEFT': {
      const tableStates = { ...state.tableStates }
      delete tableStates[state.watchedTableId]
      useSession.setState({ watchedTableId: '', tableStates })
      refreshActivityPresentation()
      break
    }
    case 'ERROR':
      if (message.requestId && message.requestId === useEmoteState.getState().requestId) break
      if (typeof p.message === 'string')
        useSession.setState({ error: p.message })
      break
    // Game messages are validated separately by game/store; no private payload is cached here.
  }
}
