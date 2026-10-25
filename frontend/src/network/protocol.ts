import { validPublicEquipment, type PublicEquipment } from './equipment'

/** Existing Spring Raw WebSocket contracts; UI models live in worldClient. */
export interface Envelope {
  requestId: string | null
  type: string
  payload: Record<string, unknown>
}
export interface Channel {
  channelId: string
  name: string
  currentUsers: number
  capacity: number
  joinable: boolean
}
export interface ChannelState extends Omit<Channel, 'joinable'> {
  version: number
  userIds: string[]
}
export interface Position {
  lastInputSeq: number
  x: number
  y: number
  z: number
  yaw: number
  moving: boolean
  running: boolean
  swimming: boolean
}
export interface WorldState {
  channelId: string
  version: number
  mapVersion: string
  avatars: {
    userId: string
    position: Position
    nickname?: string | null
    characterGender?: 'MALE' | 'FEMALE' | null
    equipment?: PublicEquipment[] | null
  }[]
}
export interface TableSummary {
  tableId: string
  capacity: number
  occupiedSeats: number
  availableSeats: number
  joinable: boolean
  gameCode: string | null
  status: string
  gameId?: string | null
}
export interface TableState {
  tableId: string
  version: number
  capacity: number
  minimumPlayers: number
  seats: { seatNumber: number; userId: string | null; ready: boolean }[]
  allReady: boolean
  selectorUserId: string | null
  gameCode: string | null
  targetScore: number | null
  gameId?: string | null
}
// Older servers omit the field. Missing never grants a watch; malformed IDs are rejected.
const publicGameId = (v: unknown) => v == null || typeof v === 'string' && !!v.trim() && v.length <= 120
export const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x)
export const integer = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) >= 0
/** GET /api/v1/users/me — docs/user-me.md on dev. */
export function userProfile(value: unknown) {
  if (
    !record(value) ||
    !integer(value.userId) ||
    value.userId < 1 ||
    typeof value.nickname !== 'string' ||
    !value.nickname.trim() ||
    !['MALE', 'FEMALE'].includes(String(value.characterGender))
  )
    throw new Error('내 정보 응답을 확인할 수 없습니다.')
  return {
    userId: String(value.userId),
    nickname: value.nickname,
    character:
      value.characterGender === 'FEMALE' ? ('girl' as const) : ('man' as const),
  }
}
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0
export function parseEnvelope(data: unknown): Envelope {
  // A full 174-seat facility snapshot exceeds 64 KiB; other message limits stay unchanged.
  if (typeof data !== 'string' || data.length > 262_144)
    throw new Error('서버 메시지 형식을 확인할 수 없습니다.')
  const value: unknown = JSON.parse(data)
  if (
    !record(value) ||
    (data.length > 65_536 && value.type !== 'WORLD_FACILITY_STATE') ||
    !(
      value.requestId === null ||
      (text(value.requestId) && value.requestId.length <= 64)
    ) ||
    !text(value.type) ||
    !/^[A-Z_]+$/.test(value.type) ||
    !record(value.payload)
  )
    throw new Error('서버 메시지 형식을 확인할 수 없습니다.')
  return value as unknown as Envelope
}
export function channel(value: unknown): Channel {
  if (
    !record(value) ||
    !text(value.channelId) ||
    !text(value.name) ||
    !integer(value.capacity) ||
    value.capacity < 1 ||
    !integer(value.currentUsers) ||
    value.currentUsers > value.capacity ||
    typeof value.joinable !== 'boolean'
  )
    throw new Error('채널 목록 형식이 올바르지 않습니다.')
  return value as unknown as Channel
}
export function channelState(value: Record<string, unknown>): ChannelState {
  channel({ ...value, joinable: false })
  if (
    !integer(value.version) ||
    !Array.isArray(value.userIds) ||
    !value.userIds.every(text) ||
    new Set(value.userIds).size !== value.userIds.length ||
    value.userIds.length !== value.currentUsers
  )
    throw new Error('채널 상태 형식이 올바르지 않습니다.')
  return value as unknown as ChannelState
}
export function worldState(value: Record<string, unknown>): WorldState {
  const position = (p: unknown) =>
    record(p) &&
    integer(p.lastInputSeq) &&
    ['x', 'y', 'z', 'yaw'].every(
      (k) => typeof p[k] === 'number' && Number.isFinite(p[k]),
    ) &&
    ['moving', 'running', 'swimming'].every((k) => typeof p[k] === 'boolean')
  if (
    !text(value.channelId) ||
    !integer(value.version) ||
    !text(value.mapVersion) ||
    !Array.isArray(value.avatars) ||
    !value.avatars.every(
      (a) => record(a) && text(a.userId) && position(a.position)
        && (a.nickname == null || (typeof a.nickname === 'string' && !!a.nickname.trim()))
        && (a.characterGender == null || a.characterGender === 'MALE' || a.characterGender === 'FEMALE')
        && (a.equipment == null || validPublicEquipment(a.equipment)),
    )
  )
    throw new Error('월드 상태 형식이 올바르지 않습니다.')
  if (new Set(value.avatars.map((a) => a.userId)).size !== value.avatars.length)
    throw new Error('중복 아바타 상태입니다.')
  return value as unknown as WorldState
}
export function tableSummary(value: unknown): TableSummary {
  if (
    !record(value) ||
    !text(value.tableId) ||
    !integer(value.capacity) ||
    value.capacity < 1 ||
    !integer(value.occupiedSeats) ||
    !integer(value.availableSeats) ||
    value.occupiedSeats + value.availableSeats !== value.capacity ||
    typeof value.joinable !== 'boolean' ||
    !(value.gameCode === null || text(value.gameCode)) ||
    !text(value.status) || !publicGameId(value.gameId)
  )
    throw new Error('테이블 목록 형식이 올바르지 않습니다.')
  return { ...value, gameId: value.gameId ?? null } as unknown as TableSummary
}
export function tableState(value: Record<string, unknown>): TableState {
  if (
    !text(value.tableId) ||
    !integer(value.version) ||
    !integer(value.capacity) ||
    value.capacity < 1 ||
    value.capacity > 4 ||
    !integer(value.minimumPlayers) ||
    !Array.isArray(value.seats) ||
    value.seats.length !== value.capacity ||
    !value.seats.every(
      (s, i) =>
        record(s) &&
        s.seatNumber === i + 1 &&
        (s.userId === null || text(s.userId)) &&
        typeof s.ready === 'boolean' &&
        (s.userId !== null || s.ready === false),
    ) ||
    typeof value.allReady !== 'boolean' || !publicGameId(value.gameId) ||
    !(value.selectorUserId === null || text(value.selectorUserId)) ||
    !(value.gameCode === null || text(value.gameCode)) ||
    !(
      value.targetScore === null ||
      value.targetScore === undefined ||
      integer(value.targetScore)
    )
  )
    throw new Error('테이블 상태 형식이 올바르지 않습니다.')
  const ids = value.seats.flatMap((s) => (s.userId === null ? [] : [s.userId]))
  if (
    new Set(ids).size !== ids.length ||
    (value.selectorUserId !== null && !ids.includes(value.selectorUserId))
  )
    throw new Error('테이블 참가자 상태가 올바르지 않습니다.')
  return {
    ...value,
    targetScore: value.targetScore ?? null,
    gameId: value.gameId ?? null,
  } as unknown as TableState
}
