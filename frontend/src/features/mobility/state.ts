import { create } from 'zustand'

export type Vehicle = 'BICYCLE' | 'SCOOTER'
export const HOLD_MS = 700
export const rentalCapability = { available: false }
export const vehicles = {
  BICYCLE: { label: '전기자전거', rate: 1, side: -1, speed: 11 },
  SCOOTER: { label: '킥보드', rate: 2, side: 1, speed: 14 },
} as const

export const isVehicle = (value: unknown): value is Vehicle => value === 'BICYCLE' || value === 'SCOOTER'

export type RentalTarget = {
  stationId: string
  vehicle: Vehicle
  reach: { x: number; y: number; z: number }
  center: { x: number; y: number; z: number }
  radius: number
  heightTolerance: number
}

export const sameTarget = (a: RentalTarget | null, b: RentalTarget | null) =>
  a?.stationId === b?.stationId && a?.vehicle === b?.vehicle

type RentalState = {
  target: RentalTarget | null
  holdAt: number | null
  leaseId: string
  vehicle: Vehicle | null
  phase: 'idle' | 'starting' | 'riding' | 'ending'
  total: number
  notice: string
}

const empty: RentalState = {
  target: null, holdAt: null, leaseId: '', vehicle: null, phase: 'idle', total: 0, notice: '',
}
export const useMobility = create<RentalState>(() => empty)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
export function resetMobility() {
  clearTimeout(noticeTimer)
  useMobility.setState(empty)
}

export function rentalNotice(notice: string) {
  clearTimeout(noticeTimer)
  useMobility.setState({ notice })
  noticeTimer = setTimeout(() => useMobility.setState({ notice: '' }), 3400)
}

export function acceptRental(payload: Record<string, unknown>) {
  const { leaseId, status, vehicle, total } = payload
  const current = useMobility.getState()
  if (!current.leaseId || leaseId !== current.leaseId || typeof total !== 'number'
    || !Number.isSafeInteger(total) || total < 0) return false
  if (status === 'RIDING' && isVehicle(vehicle)) {
    useMobility.setState({ phase: current.phase === 'ending' ? 'ending' : 'riding', vehicle,
      total: Math.max(total, current.total) })
    return true
  }
  if (status !== 'ENDED' && status !== 'INSUFFICIENT' && status !== 'FAILED') return false
  resetMobility()
  if (status === 'INSUFFICIENT') {
    rentalNotice(total ? `엽전이 부족해 하차했어요 · 이용 요금 ${total}냥`
      : `엽전이 부족해요 · 탑승에 ${isVehicle(vehicle) ? vehicles[vehicle].rate : 1}냥 필요`)
  } else if (status === 'FAILED') {
    rentalNotice(`결제에 실패해 하차했어요 · 이용 요금 ${total}냥`)
  } else if (total) {
    rentalNotice(`하차 완료 · 이용 요금 ${total}냥`)
  } else if (current.phase === 'starting') {
    rentalNotice('탑승 요청을 확인할 수 없어요. 다시 시도해 주세요.')
  }
  return true
}
