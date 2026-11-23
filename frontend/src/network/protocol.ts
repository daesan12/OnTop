import { validPublicEquipment, type PublicEquipment } from './equipment'
import { parseDavinci } from '../game/davinci/protocol'
import { isAvatarActivity, type AvatarActivity } from './avatarActivity'
import type { MotionSnapshot } from './localMovementPrediction'

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
  interiorExitReady?: boolean
}
/** Public WORLD_STATE seating contract; seatNumber is 1-based, like TABLE_STATE. */
export interface PublicTableSeat {
  tableId: string
  seatNumber: number
}
export type ChairCount = 2 | 3 | 4 | 5 | 6 | 7 | 8
/** Public, full-channel chair projection; never grants a seat or a game subscription. */
export interface PublicTable {
  secretTiles?: { gameId: string; state: import('../game/davinci/protocol').DavinciState } | null
  tableId: string
  anchorId: string | null
  chairCount: ChairCount
  gameCode?: string | null
}
export const validChairCount = (value: unknown): value is ChairCount => typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 8
export interface WorldState {
  channelId: string
  version: number
  mapVersion: string
  secretDoorsOpen?: boolean
  tables?: PublicTable[]
  gameWatches?: Record<string, { gameId: string; tableId: string }>
  vehicles?: Record<string, import('../features/mobility/state').Vehicle>
  avatars: {
    userId: string
    position: Position
    nickname?: string | null
    characterGender?: 'MALE' | 'FEMALE' | null
    gameMaster?: boolean
    equipment?: PublicEquipment[] | null
    tableSeat?: PublicTableSeat | null
    activity?: AvatarActivity | null
    motion?: MotionSnapshot | null
    carry?: CarryState | null
    interactionBusy?: boolean
    vrActive?: boolean
    myRoomOpen?: boolean
  }[]
}
export interface CarryState { carryId: string; partnerId: string; role: 'CARRIER' | 'CARRIED' | 'THROWN' }
export interface TableSummary {
  tableId: string
  capacity: number
  occupiedSeats: number
  availableSeats: number
  joinable: boolean
  gameCode: string | null
  betAmountPerPlayer: number | null
  status: string
  gameId?: string | null
  selectedPlayers?: number | null
  startMode?: 'AUTO' | 'MANUAL'
  chairCount?: ChairCount
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
  betAmountPerPlayer: number | null
  gameId?: string | null
  selectedPlayers?: number | null
  startMode?: 'AUTO' | 'MANUAL'
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
const publicBet = (x: unknown) => x == null || integer(x) && Number(x) >= 0
function validTableMode(value: Record<string, unknown>) {
  return (value.startMode === undefined || value.startMode === 'AUTO' || value.startMode === 'MANUAL')
    && (value.startMode === 'MANUAL'
      ? integer(value.selectedPlayers) && value.selectedPlayers >= 2 && value.selectedPlayers <= tableMaximum(value.gameCode) && value.selectedPlayers === value.capacity
      : value.selectedPlayers == null)
}
const tableMaximum = (gameCode: unknown) => gameCode === 'STONE_RUMBLE' ? 8 : 4
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
  const steering = (s: unknown) => s === undefined || record(s)
    && ['dx','dz','targetX','targetZ'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k]))
    && Math.hypot(Number(s.dx),Number(s.dz)) <= 1.00001 && typeof s.run === 'boolean'
  const motion = (m: unknown) => m == null || record(m)
    && integer(m.epoch) && integer(m.tick) && integer(m.appliedInputSeq)
    && typeof m.inputAgeMs === 'number' && Number.isFinite(m.inputAgeMs) && m.inputAgeMs >= 0 && m.inputAgeMs <= 250
    && typeof m.velocityY === 'number' && Number.isFinite(m.velocityY)
    && typeof m.grounded === 'boolean' && typeof m.inputActive === 'boolean'
      && (m.authority === undefined || m.authority === 'CLIENT_VALIDATED')
      && (m.profile === undefined || m.profile === 'PARK_V1')
      && (m.correctionReason === undefined || text(m.correctionReason) && m.correctionReason.length <= 64)
      && steering(m.steering)
      && (m.movingPad === undefined || record(m.movingPad) && integer(m.movingPad.block)
        && (m.movingPad.dipStartedAt === undefined
          || typeof m.movingPad.dipStartedAt === 'number' && Number.isFinite(m.movingPad.dipStartedAt)))
      && (m.jumpGrace === undefined || record(m.jumpGrace) && integer(m.jumpGrace.coyoteTicks) && m.jumpGrace.coyoteTicks <= 3
        && integer(m.jumpGrace.jumpBufferTicks) && m.jumpGrace.jumpBufferTicks <= 4)
  const tableSeat = (s: unknown) => s == null || record(s)
    && text(s.tableId) && s.tableId.length <= 120
    && integer(s.seatNumber) && s.seatNumber >= 1 && s.seatNumber <= 8
  const position = (p: unknown) =>
    record(p) &&
    integer(p.lastInputSeq) &&
    ['x', 'y', 'z', 'yaw'].every(
      (k) => typeof p[k] === 'number' && Number.isFinite(p[k]),
    ) &&
    ['moving', 'running', 'swimming'].every((k) => typeof p[k] === 'boolean') &&
    (p.interiorExitReady === undefined || typeof p.interiorExitReady === 'boolean')
  if (
    !text(value.channelId) ||
    !integer(value.version) ||
    !text(value.mapVersion) ||
    (value.secretDoorsOpen !== undefined && typeof value.secretDoorsOpen !== 'boolean') ||
    !Array.isArray(value.avatars) ||
    !value.avatars.every(
      (a) => record(a) && text(a.userId) && position(a.position)
        && (a.nickname == null || (typeof a.nickname === 'string' && !!a.nickname.trim()))
        && (a.characterGender == null || a.characterGender === 'MALE' || a.characterGender === 'FEMALE')
        && (a.gameMaster === undefined || typeof a.gameMaster === 'boolean')
        && (a.equipment == null || validPublicEquipment(a.equipment))
        && tableSeat(a.tableSeat)
        && (a.interactionBusy === undefined || typeof a.interactionBusy === 'boolean')
        && (a.vrActive === undefined || typeof a.vrActive === 'boolean')
        && (a.myRoomOpen === undefined || typeof a.myRoomOpen === 'boolean')
        && (a.carry == null || record(a.carry) && text(a.carry.carryId) && a.carry.carryId.length === 36
          && text(a.carry.partnerId) && a.carry.partnerId !== a.userId
          && ['CARRIER', 'CARRIED', 'THROWN'].includes(String(a.carry.role)))
        && (a.activity == null || isAvatarActivity(a.activity)) && motion(a.motion),
    )
  )
    throw new Error('월드 상태 형식이 올바르지 않습니다.')
  if (new Set(value.avatars.map((a) => a.userId)).size !== value.avatars.length)
    throw new Error('중복 아바타 상태입니다.')
  const avatarIds = new Set(value.avatars.map(avatar => avatar.userId))
  if (value.gameWatches !== undefined && (!record(value.gameWatches) || Object.entries(value.gameWatches).some(([id, watch]) =>
    !avatarIds.has(id) || !record(watch) || !text(watch.gameId) || !text(watch.tableId))))
    throw new Error('관전자 공개 상태가 올바르지 않습니다.')
  if (value.vehicles !== undefined && (!record(value.vehicles) || Object.entries(value.vehicles).some(([id, kind]) =>
    !avatarIds.has(id) || kind !== 'BICYCLE' && kind !== 'SCOOTER')))
    throw new Error('공개 탈것 상태가 올바르지 않습니다.')
  const seats = value.avatars.flatMap(a => a.tableSeat ? [`${a.tableSeat.tableId}\0${a.tableSeat.seatNumber}`] : [])
  if (new Set(seats).size !== seats.length) throw new Error('중복 테이블 착석 상태입니다.')
  if (value.tables !== undefined) {
    const publicId = (id: unknown): id is string => text(id) && !!id.trim() && id.length <= 120
    if (!Array.isArray(value.tables) || !value.tables.every(table => record(table)
      && publicId(table.tableId) && (table.anchorId == null || publicId(table.anchorId)) && validChairCount(table.chairCount)
      && table.chairCount <= tableMaximum(table.gameCode)
      && (table.gameCode == null || text(table.gameCode) && !!table.gameCode.trim() && table.gameCode.length <= 64)))
      throw new Error('공개 의자 상태 형식이 올바르지 않습니다.')
    const anchors = value.tables.flatMap(table => table.anchorId == null ? [] : [table.anchorId])
    if (new Set(value.tables.map(table => table.tableId)).size !== value.tables.length || new Set(anchors).size !== anchors.length)
      throw new Error('중복 공개 테이블 상태입니다.')
  }
  const publicTables = value.tables as PublicTable[] | undefined
  for (const table of publicTables ?? []) {
    if (table.secretTiles == null) continue
    const view = table.secretTiles
    if (table.gameCode !== 'DAVINCI_CODE' || !record(view) || !text(view.gameId) || !view.gameId.trim()
      || Object.keys(view).some(key => !['gameId', 'state'].includes(key))) throw new Error('공개 흑백수사 상태가 올바르지 않습니다.')
    table.secretTiles = { gameId: view.gameId, state: parseDavinci(view.state) }
  }
  if (value.avatars.some(a => a.tableSeat && a.tableSeat.seatNumber > 4
    && !publicTables?.some(table => table.tableId === a.tableSeat.tableId && table.gameCode === 'STONE_RUMBLE'
      && table.chairCount >= a.tableSeat.seatNumber))) throw new Error('돌탑 좌석 공개 상태가 일치하지 않습니다.')
  return value as unknown as WorldState
}
export function tableSummary(value: unknown): TableSummary {
  if (
    !record(value) ||
    !text(value.tableId) ||
    !integer(value.capacity) ||
    value.capacity < 1 || value.capacity > tableMaximum(value.gameCode) ||
    !integer(value.occupiedSeats) ||
    !integer(value.availableSeats) ||
    value.occupiedSeats + value.availableSeats !== value.capacity ||
    typeof value.joinable !== 'boolean' ||
    !(value.gameCode === null || text(value.gameCode)) ||
    !text(value.status) || !publicGameId(value.gameId) || !publicBet(value.betAmountPerPlayer) || !validTableMode(value)
    || (value.chairCount !== undefined && (!validChairCount(value.chairCount) || value.chairCount > tableMaximum(value.gameCode)))
  )
    throw new Error('테이블 목록 형식이 올바르지 않습니다.')
  return { ...value, gameId: value.gameId ?? null, betAmountPerPlayer: value.betAmountPerPlayer ?? null } as unknown as TableSummary
}
export function tableState(value: Record<string, unknown>): TableState {
  if (
    !text(value.tableId) ||
    !integer(value.version) ||
    !integer(value.capacity) ||
    value.capacity < 1 ||
    value.capacity > tableMaximum(value.gameCode) ||
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
    typeof value.allReady !== 'boolean' || !publicGameId(value.gameId) || !publicBet(value.betAmountPerPlayer) || !validTableMode(value) ||
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
    betAmountPerPlayer: value.betAmountPerPlayer ?? null,
    gameId: value.gameId ?? null,
  } as unknown as TableState
}
