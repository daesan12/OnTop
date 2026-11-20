import { integer, record } from '../../network/protocol'
import type { Pose } from '../../network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../park/mapConfig'

export type FacilityKind = 'BENCH' | 'FITNESS' | 'TELESCOPE' | 'BOAT' | 'SLEIGH'
export interface FacilityDefinition {
  facilityId: string; kind: FacilityKind; center: Pose; radius: number
  heightTolerance: number; seats: Pose[]; exit: Pose
}
export interface FacilityCatalogPage {
  fitnessRewardsEnabled?: boolean
  mapVersion: string; offset: number; total: number; nextOffset: number
  aimIntervalMs: number; minPitch: number; maxPitch: number; initialPitch: number
  facilities: FacilityDefinition[]
}
export interface FacilityLease {
  leaseId: string; channelId: string; userId: string; facilityId: string; kind: FacilityKind
  seatIndex: number; startedAt: string; pose: Pose; exit: Pose; yaw: number; pitch: number; lastAimSeq: number
}
/** Duck-boat queue/trips. departAt and departedAt are server epoch milliseconds. */
/** A waiting team: members by queue spot (0 = inviter). deadline: invite/choice cut-off; departAt: ready teams only. */
export interface DuckBoatTeam {
  slot: number; members: (string | null)[]; phase: 'READY' | 'INVITING' | 'CHOOSING'
  partnerId: string | null; deadline: number | null; departAt: number | null
}
export interface DuckBoatView { fare: number; lapMillis: number; teams: DuckBoatTeam[]; trips: { boat: number; departedAt: number }[] }
export interface FacilitySnapshot { channelId: string; version: number; mapVersion: string; occupancies: FacilityLease[]; boats: DuckBoatView | null }
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const kind = (v: unknown): v is FacilityKind => ['BENCH', 'FITNESS', 'TELESCOPE', 'BOAT', 'SLEIGH'].includes(String(v))
/** BOAT: two dock queue spots, then two seats on each of the four ride boats. */
/** BOAT: four dock queue spots (two teams of two), then two seats on each of the four ride boats. */
export const facilitySeatCount = (k: FacilityKind) => k === 'BENCH' ? 2 : k === 'BOAT' ? 12 : 1
function invalid(): never { throw new Error('시설 서버 응답 형식을 확인할 수 없습니다. 상태를 다시 확인해주세요.') }
function pose(value: unknown): Pose {
  if (!record(value) || ![value.x, value.y, value.z, value.yaw].every(finite)) return invalid()
  return { x: value.x as number, y: value.y as number, z: value.z as number, yaw: value.yaw as number }
}
function map(value: unknown, expected: string) {
  if (value !== expected) throw new Error('시설과 공원의 맵 버전이 다릅니다. 배치 정보를 확인해주세요.')
  return expected
}
export function parseFacilityDefinition(value: unknown): FacilityDefinition {
  if (!record(value) || !text(value.facilityId) || !kind(value.kind)
    || !finite(value.radius) || value.radius <= 0 || !finite(value.heightTolerance) || value.heightTolerance < 0
    || !Array.isArray(value.seats) || value.seats.length !== facilitySeatCount(value.kind)) return invalid()
  return { facilityId: value.facilityId, kind: value.kind, center: pose(value.center), radius: value.radius,
    heightTolerance: value.heightTolerance, seats: value.seats.map(pose), exit: pose(value.exit) }
}
export function parseFacilityCatalogPage(value: unknown, expectedMapVersion: string = EXPECTED_MAP_VERSION): FacilityCatalogPage {
  if (!record(value) || !integer(value.offset) || !integer(value.total) || value.total > 1000
    || !Number.isInteger(value.nextOffset) || (value.nextOffset as number) < -1
    || !integer(value.aimIntervalMs) || value.aimIntervalMs < 100
    || !finite(value.minPitch) || !finite(value.maxPitch) || !finite(value.initialPitch)
    || value.minPitch > value.maxPitch || value.initialPitch < value.minPitch || value.initialPitch > value.maxPitch
    || !Array.isArray(value.facilities) || value.facilities.length > 10) return invalid()
  return { mapVersion: map(value.mapVersion,expectedMapVersion), offset: value.offset, total: value.total, nextOffset: value.nextOffset as number,
    aimIntervalMs: value.aimIntervalMs, minPitch: value.minPitch, maxPitch: value.maxPitch, initialPitch: value.initialPitch,
    fitnessRewardsEnabled: value.fitnessRewardsEnabled === true,
    facilities: value.facilities.map(parseFacilityDefinition) }
}
const optionalTime = (v: unknown) => v === null || v === undefined ? null : finite(v) ? v : invalid()
function boatView(value: unknown): DuckBoatView {
  if (!record(value) || !integer(value.fare) || !integer(value.lapMillis) || value.lapMillis <= 0
    || !Array.isArray(value.trips) || value.trips.length > 4 || !Array.isArray(value.teams) || value.teams.length > 2) return invalid()
  const trips = value.trips.map(t => {
    if (!record(t) || !integer(t.boat) || t.boat > 3 || !finite(t.departedAt)) return invalid()
    return { boat: t.boat, departedAt: t.departedAt }
  })
  const teams = value.teams.map((t): DuckBoatTeam => {
    if (!record(t) || !integer(t.slot) || t.slot > 1 || !Array.isArray(t.members) || t.members.length !== 2
      || !t.members.every(m => m === null || text(m)) || !['READY', 'INVITING', 'CHOOSING'].includes(String(t.phase))
      || !(t.partnerId == null || text(t.partnerId))) return invalid()
    return { slot: t.slot, members: t.members as (string | null)[], phase: t.phase as DuckBoatTeam['phase'],
      partnerId: (t.partnerId as string | undefined) ?? null, deadline: optionalTime(t.deadline), departAt: optionalTime(t.departAt) }
  })
  return { fare: value.fare, lapMillis: value.lapMillis, teams, trips }
}
export function parseFacilitySnapshot(value: unknown, expectedMapVersion: string = EXPECTED_MAP_VERSION): FacilitySnapshot {
  if (!record(value) || !text(value.channelId) || !integer(value.version)
    || !Array.isArray(value.occupancies) || value.occupancies.length > 2000) return invalid()
  const users = new Set<string>(), leases = new Set<string>(), seats = new Set<string>()
  const occupancies = value.occupancies.map((v): FacilityLease => {
    if (!record(v) || !text(v.leaseId) || !text(v.userId) || v.channelId !== value.channelId
      || !text(v.facilityId) || !kind(v.kind) || !integer(v.seatIndex) || v.seatIndex >= facilitySeatCount(v.kind)
      || typeof v.startedAt !== 'string' || !Number.isFinite(Date.parse(v.startedAt)) || !v.startedAt.endsWith('Z')
      || !finite(v.yaw) || !finite(v.pitch) || !integer(v.lastAimSeq) || v.lastAimSeq > 4294967295) return invalid()
    const seat = `${v.facilityId}:${v.seatIndex}`
    if (users.has(v.userId) || leases.has(v.leaseId) || seats.has(seat)) return invalid()
    users.add(v.userId); leases.add(v.leaseId); seats.add(seat)
    return { leaseId: v.leaseId, userId: v.userId, channelId: v.channelId as string, facilityId: v.facilityId,
      kind: v.kind, seatIndex: v.seatIndex, startedAt: v.startedAt, pose: pose(v.pose), exit: pose(v.exit),
      yaw: v.yaw, pitch: v.pitch, lastAimSeq: v.lastAimSeq }
  })
  return { channelId: value.channelId, version: value.version, mapVersion: map(value.mapVersion,expectedMapVersion), occupancies,
    boats: value.boats == null ? null : boatView(value.boats) }
}
