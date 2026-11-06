import { characterGestureDuration, NETWORK } from '../../park/mapConfig'
import { avatars, estimatedServerTime, useSession, type AvatarSnapshot } from '../../network/worldClient'
import { useFollow } from '../follow/state'
import { useJumpmap } from '../jumpmap/state'
import { useEmoteState } from '../emotes/state'
import { interactionAim, interactionScore, readInteractionDirection } from '../interactions/interactionAim'
import { parkRuntime } from '../../park/runtime/runtime'

export function carryPlayerAvailable(id: string, avatar: AvatarSnapshot, now = estimatedServerTime()) {
  const session = useSession.getState()
  const age = now - avatar.emoteAt
  const emoting = !!avatar.emote && age >= 0 && age < (characterGestureDuration(avatar.emote) || NETWORK.emoteDurationMs)
  return avatar.connected && !avatar.interactionBusy && !avatar.tableId && avatar.seatIndex < 0 && !avatar.benchId && !avatar.fitnessId
    && !avatar.telescopeId && !avatar.swimming && !session.activities[id] && !session.gameWatches[id]
    && !emoting && !useFollow.getState().links.some(link => link.followerId === id || link.targetId === id)
    && (id !== session.sessionId || !useJumpmap.getState().run && !useEmoteState.getState().pending)
}

export function carryInteraction() {
  const session = useSession.getState(), own = avatars.get(session.sessionId)
  if (!session.carrySupported || !own || !carryPlayerAvailable(session.sessionId, own) || session.pending) return null
  if (own.carry?.role === 'CARRIER') return {
    kind: 'avatar-throw' as const, id: own.carry.partnerId, label: '바라보는 방향으로 던지기',
    occupied: false, available: !!parkRuntime.throwAvatar, score: -1, distance: 0,
  }
  if (own.carry || !parkRuntime.pickupAvatar || !interactionAim.ready) return null
  let target: { id: string; distance: number; score: number } | null = null
  for (const [id, avatar] of avatars) {
    if (id === session.sessionId || avatar.carry || avatar.moving || !carryPlayerAvailable(id, avatar)) continue
    const distance = Math.hypot(own.current.x - avatar.current.x, own.current.z - avatar.current.z)
    if (distance > 2 || Math.abs(own.current.y - avatar.current.y) > .8) continue
    const score = interactionScore(distance, avatar.current)
    if (!Number.isFinite(score) || target && target.score <= score) continue
    target = { id, distance, score }
  }
  return target && { ...target, kind: 'avatar-pickup' as const,
    label: `${avatars.get(target.id)!.nickname} 님 들기`, occupied: false, available: true }
}

export function interactWithAvatar(kind: 'avatar-pickup' | 'avatar-throw', targetId: string) {
  if (kind === 'avatar-pickup') { void parkRuntime.pickupAvatar?.(targetId); return }
  const carry = avatars.get(useSession.getState().sessionId)?.carry
  if (carry?.role !== 'CARRIER') return
  const direction = readInteractionDirection()
  if (!direction) return
  const length = Math.hypot(direction.dx, direction.dy, direction.dz)
  if (!Number.isFinite(length) || length < .001) return
  void parkRuntime.throwAvatar?.(carry.carryId, {
    dx: direction.dx / length, dy: direction.dy / length, dz: direction.dz / length,
  })
}
