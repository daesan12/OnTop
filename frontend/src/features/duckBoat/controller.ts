import { DUCK_BOAT } from '../../park/mapConfig'
import { parkRuntime } from '../../park/runtime/runtime'
import { avatars, useSession } from '../../network/worldClient'
import type { BoatCommand } from '../../network/facilityClient'
import { clearRoamingInput } from '../../world/inputOwnership'
import { facilityAvailable, useFacilityState } from '../facilities/state'
import { closeBoatChooser, closeBoatInvite, TEAM_SLOTS, useDuckBoat } from './model'

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

/** The dock accepts another team while fewer than two teams wait. The server still decides. */
export function boatQueueOpen() {
  return (useFacilityState.getState().boats?.teams.length ?? 0) < TEAM_SLOTS
}

/** Same-channel players who can be invited, nearest first. */
export function boatPartners(limit = 8) {
  const { sessionId } = useSession.getState(), own = avatars.get(sessionId)
  if (!own) return []
  const busy = useFacilityState.getState().occupancies
  return [...avatars.values()]
    .filter(a => a.userId && a.userId !== sessionId && a.connected && !busy[a.userId] && !a.tableId
      && a.seatIndex < 0 && !a.vehicle && !a.carry)
    .map(a => ({ userId: a.userId as string, distance: Math.hypot(a.current.x - own.current.x, a.current.z - own.current.z) }))
    .filter(p => Number.isFinite(p.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
}

async function command(type: BoatCommand, payload: Record<string, unknown>, fallback: string) {
  if (!DUCK_BOAT || !parkRuntime.boatCommand || useDuckBoat.getState().pending) return false
  clearRoamingInput()
  useDuckBoat.setState({ pending: true, error: '' })
  try {
    await parkRuntime.boatCommand(type, payload, new AbortController().signal)
    return true
  } catch (error) {
    useDuckBoat.setState({ error: message(error, fallback) })
    return false
  } finally {
    useDuckBoat.setState({ pending: false })
  }
}

/** Joins the queue alone, or inviting one partner who joins beside this player on accepting. */
export async function joinDuckBoat(partnerId?: string) {
  if (!DUCK_BOAT || !facilityAvailable(DUCK_BOAT.id) || !boatQueueOpen()) return false
  parkRuntime.stopMovement()
  const joined = await command('WORLD_BOAT_JOIN', partnerId ? { partnerId } : {}, '오리배 대기열에 들어가지 못했어요.')
  if (joined) closeBoatChooser()
  return joined
}

export async function replyBoatInvite(inviterId: string, accept: boolean) {
  if (accept) parkRuntime.stopMovement()
  const done = await command('WORLD_BOAT_REPLY', { inviterId, accept }, accept ? '초대를 수락하지 못했어요.' : '초대를 거절하지 못했어요.')
  // A closed or answered invite disappears either way; the server reports a stale one as an error.
  closeBoatInvite(inviterId)
  return done
}

export async function rideBoatAlone() {
  return command('WORLD_BOAT_TEAM', { action: 'SOLO' }, '혼자 타기로 바꾸지 못했어요.')
}

export async function inviteBoatPartner(partnerId: string) {
  const done = await command('WORLD_BOAT_TEAM', { action: 'INVITE', partnerId }, '다시 초대하지 못했어요.')
  if (done) useDuckBoat.setState({ picking: false })
  return done
}

/** Cancels waiting or gets off mid-ride; the server returns this player alone to the dock. */
export async function leaveDuckBoat(): Promise<boolean> {
  const { sessionId } = useSession.getState(), lease = useFacilityState.getState().occupancies[sessionId]
  if (!lease || lease.kind !== 'BOAT' || useDuckBoat.getState().pending) return false
  clearRoamingInput()
  useDuckBoat.setState({ pending: true, error: '' })
  try {
    await parkRuntime.releaseFacility(lease.leaseId, new AbortController().signal)
    return true
  } catch (error) {
    useDuckBoat.setState({ error: message(error, '오리배에서 내리지 못했어요.') })
    return false
  } finally {
    useDuckBoat.setState({ pending: false })
  }
}
