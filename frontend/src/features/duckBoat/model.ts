import { create } from 'zustand'
import { DUCK_BOAT } from '../../park/mapConfig'
import { duckBoatRidePose, duckBoatSeatPose, type RidePose } from '../../../park-renewal-preview/duckBoatRidePath'
import type { DuckBoatTeam, DuckBoatView, FacilityLease } from '../facilities/protocol'
import type { Pose } from '../../network/worldClient'

/** Server lease seat layout: 0-3 dock queue spots (team*2 + spot), then two seats per ride boat. */
export const QUEUE_SPOTS = 4
export const TEAM_SLOTS = 2
export type BoatPlacement =
  | { phase: 'queue'; team: DuckBoatTeam | null; spot: number }
  | { phase: 'riding'; boat: number; seat: number; departedAt: number }

export function boatPlacement(lease: FacilityLease | undefined, boats: DuckBoatView | null): BoatPlacement | null {
  if (!lease || lease.kind !== 'BOAT') return null
  if (lease.seatIndex < QUEUE_SPOTS) {
    const slot = Math.floor(lease.seatIndex / 2)
    return { phase: 'queue', team: boats?.teams.find(t => t.slot === slot) ?? null, spot: lease.seatIndex % 2 }
  }
  const index = lease.seatIndex - QUEUE_SPOTS, boat = Math.floor(index / 2), trip = boats?.trips.find(t => t.boat === boat)
  return trip ? { phase: 'riding', boat, seat: index % 2, departedAt: trip.departedAt } : null
}

const scratch: RidePose = { x: 0, y: 0, z: 0, boatYaw: 0, riderYaw: 0 }
/** Render-only rider pose from the shared route and server trip time. */
export function sampleBoatRider(departedAt: number, seat: number, now: number, target: Pose): boolean {
  if (!DUCK_BOAT || !Number.isFinite(departedAt)) return false
  duckBoatRidePose(DUCK_BOAT.route, (now - departedAt) / 1000, scratch)
  const pose = duckBoatSeatPose(DUCK_BOAT.route, scratch, seat)
  target.x = pose.x; target.y = pose.y; target.z = pose.z; target.yaw = pose.yaw
  return true
}

export const BOAT_NOTICES: Record<string, string> = {
  PAID: '요금을 내고 출발했어요.',
  ARRIVED: '오리배 한 바퀴를 마치고 선착장에 도착했어요.',
  INSUFFICIENT: '냥이 부족해서 오리배에 타지 못했어요.',
  FAILED: '요금을 처리하지 못해 선착장으로 돌아왔어요. 잠시 후 다시 시도해주세요.',
  ACCEPTED: '초대를 수락했어요. 함께 출발해요.',
  DECLINED: '초대를 거절했어요. 혼자 타거나 다른 사람을 초대해주세요.',
  EXPIRED: '초대에 답이 없어요. 혼자 타거나 다른 사람을 초대해주세요.',
  CANCELLED: '고르지 않아 대기를 마쳤어요.',
}

export interface BoatInvite { inviterId: string; expiresAt: number; fare: number }
/** chooser: dock menu (solo or pair). picking: partner list for a new or repeated invite. */
export const useDuckBoat = create(() => ({
  pending: false, error: '', notice: '',
  chooser: false, picking: false, invites: [] as BoatInvite[],
}))

let noticeTimer: ReturnType<typeof setTimeout> | undefined
export function showBoatNotice(status: unknown, fare: unknown) {
  const text = typeof status === 'string' ? BOAT_NOTICES[status] : undefined
  if (!text) return
  clearTimeout(noticeTimer)
  useDuckBoat.setState({ notice: status === 'PAID' && typeof fare === 'number' ? `${fare}냥을 내고 출발했어요.` : text })
  noticeTimer = setTimeout(() => useDuckBoat.setState({ notice: '' }), 4000)
}

export function receiveBoatInvite(payload: Record<string, unknown>) {
  const { inviterId, expiresAt, fare } = payload
  if (typeof inviterId !== 'string' || typeof expiresAt !== 'number' || typeof fare !== 'number') return
  useDuckBoat.setState(s => ({ invites: [...s.invites.filter(i => i.inviterId !== inviterId), { inviterId, expiresAt, fare }] }))
}
export function closeBoatInvite(inviterId: unknown) {
  useDuckBoat.setState(s => ({ invites: s.invites.filter(i => i.inviterId !== inviterId) }))
}
export function openBoatChooser() { useDuckBoat.setState({ chooser: true, picking: false, error: '' }) }
export function closeBoatChooser() { useDuckBoat.setState({ chooser: false, picking: false }) }
