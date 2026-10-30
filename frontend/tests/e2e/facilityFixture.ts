import type { FacilityLease } from '../../src/features/facilities/protocol'
import { facilityCatalog as defaultCatalog, facilityPage } from '../fixtures/facilityCatalog'

/** Test-only wire peer. Production uses neither this fixture nor fake authentication. */
export function facilityFixture(deps: {
  emit(type: string, payload: object, id?: string | null): void
  world(): void
  position: { x: number; y: number; z: number; yaw: number; moving: boolean; running: boolean; swimming: boolean }
  remotePosition(pose: { x: number; y: number; z: number; yaw: number }): void
  userId: string
  catalog?: typeof defaultCatalog
}) {
  const facilityCatalog = deps.catalog ?? defaultCatalog
  let leases: FacilityLease[] = [], version = 0, counter = 0
  let holdWorld = false, blockedExit = false, badMap = false
  let rejectAim = false
  const aimAt = new Map<string, number>()
  const start = { ...deps.position }
  const startedAt = new Date(Date.now() - 1200).toISOString()
  const state = (id: string | null = null, patch = {}) => deps.emit('WORLD_FACILITY_STATE', {
    channelId: 'fixture-channel', version, mapVersion: facilityCatalog.mapVersion, occupancies: structuredClone(leases), ...patch,
  }, id)
  const error = (id: string, code: string) => deps.emit('ERROR', { code, message: code }, id)
  const lease = (id: string, userId: string, seatIndex = 0): FacilityLease => {
    const d = facilityCatalog.facilities.find(d => d.facilityId === id)!
    return { leaseId: 'fixture-lease-' + ++counter, channelId: 'fixture-channel', userId, facilityId: id, kind: d.kind, seatIndex,
      startedAt, pose: { ...d.seats[seatIndex]! }, exit: { ...d.exit }, yaw: d.seats[seatIndex]!.yaw,
      pitch: d.kind === 'TELESCOPE' ? facilityCatalog.initialPitch : 0, lastAimSeq: 0 }
  }
  return {
    handle(type: string, payload: Record<string, unknown>, requestId: string) {
      if (!type.startsWith('WORLD_FACILITY_')) return false
      if (type === 'WORLD_FACILITY_CATALOG') {
        const page = facilityPage(Number(payload.offset ?? 0), facilityCatalog)
        deps.emit(type, { ...page, ...(badMap ? { mapVersion: 'mismatched-facility-map' } : {}) }, requestId)
      } else if (type === 'WORLD_FACILITY_CHECK') state(requestId)
      else if (type === 'WORLD_FACILITY_USE') {
        const d = facilityCatalog.facilities.find(d => d.facilityId === payload.facilityId)
        if (Object.keys(payload).sort().join() !== 'facilityId,seatIndex') error(requestId, 'INVALID_PAYLOAD')
        else if (!d) error(requestId, 'FACILITY_NOT_FOUND')
        else if (!Number.isInteger(payload.seatIndex) || Number(payload.seatIndex) < 0 || Number(payload.seatIndex) >= d.seats.length) error(requestId, 'FACILITY_SEAT_INVALID')
        else if (leases.some(l => l.userId === deps.userId)) error(requestId, 'FACILITY_BUSY')
        else if (Math.hypot(deps.position.x - d.center.x, deps.position.z - d.center.z) > d.radius) error(requestId, 'FACILITY_OUT_OF_RANGE')
        else if (Math.abs(deps.position.y - d.center.y) > d.heightTolerance) error(requestId, 'FACILITY_HEIGHT_MISMATCH')
        else if (leases.some(l => l.facilityId === d.facilityId && l.seatIndex === payload.seatIndex)) error(requestId, 'FACILITY_OCCUPIED')
        else {
          const item = lease(d.facilityId, deps.userId, Number(payload.seatIndex))
          leases.push(item); version++
          Object.assign(deps.position, item.pose, { moving: false, running: false })
          state(requestId); if (!holdWorld) deps.world()
        }
      } else if (type === 'WORLD_FACILITY_RELEASE') {
        const item = leases.find(l => l.userId === deps.userId && l.leaseId === payload.leaseId)
        if (Object.keys(payload).join() !== 'leaseId') error(requestId, 'INVALID_PAYLOAD')
        else if (!item) error(requestId, 'FACILITY_LEASE_MISMATCH')
        else if (blockedExit) error(requestId, 'FACILITY_EXIT_BLOCKED')
        else {
          leases = leases.filter(l => l !== item); version++; aimAt.delete(item.leaseId)
          Object.assign(deps.position, item.exit, { moving: false, running: false })
          state(requestId); if (!holdWorld) deps.world()
        }
      } else if (type === 'WORLD_FACILITY_AIM') {
        const item = leases.find(l => l.userId === deps.userId && l.leaseId === payload.leaseId)
        if (Object.keys(payload).sort().join() !== 'leaseId,pitch,seq,yaw') error(requestId, 'INVALID_PAYLOAD')
        else if (!item || item.kind !== 'TELESCOPE') error(requestId, 'FACILITY_LEASE_MISMATCH')
        else if (rejectAim) error(requestId, 'FACILITY_AIM_TOO_FREQUENT')
        else if (Number(payload.seq) <= item.lastAimSeq) state(requestId)
        else if (Date.now() - (aimAt.get(item.leaseId) ?? -Infinity) < facilityCatalog.aimIntervalMs) error(requestId, 'FACILITY_AIM_TOO_FREQUENT')
        else {
          Object.assign(item, { yaw: payload.yaw, pitch: payload.pitch, lastAimSeq: payload.seq }); version++
          aimAt.set(item.leaseId, Date.now()); state(requestId)
        }
      }
      return true
    },
    holdWorld(value = true) { holdWorld = value },
    flushWorld() { holdWorld = false; deps.world() },
    blockedExit(value: boolean) { blockedExit = value },
    rejectAim(value: boolean) { rejectAim = value },
    badMap(value = true) { badMap = value },
    startedAt,
    remote(id: string, seatIndex = 0) {
      const item = lease(id, '102', seatIndex)
      leases = [...leases.filter(l => l.userId !== '102'), item]; version++
      deps.remotePosition(item.pose); state(); deps.world()
      return item
    },
    clearRemote() {
      leases = leases.filter(l => l.userId !== '102'); version++; state(); deps.world()
    },
    stale(patch: object, requestId: string | null = null) { state(requestId, patch) },
    disconnect() {
      leases = leases.filter(l => l.userId !== deps.userId); version++
      Object.assign(deps.position, start)
    },
  }
}
