import { winterFrozen } from '../winter/state'
import { characterGestureDuration, NETWORK } from '../../park/mapConfig'
import { avatars, estimatedServerTime, sampleAvatar, useSession, type AvatarSnapshot } from '../../network/worldClient'
import { useFollow } from '../follow/state'
import { useJumpmap } from '../jumpmap/state'
import { useEmoteState } from '../emotes/state'
import { interactionAim, interactionScore } from '../interactions/interactionAim'
import { parkRuntime } from '../../park/runtime/runtime'

const throwPose = { x: 0, y: 0, z: 0, yaw: 0 }

export function carryPlayerAvailable(id: string, avatar: AvatarSnapshot, now = estimatedServerTime()) {
  const session = useSession.getState()
  const age = now - avatar.emoteAt
  const emoting = !!avatar.emote && age >= 0 && age < (characterGestureDuration(avatar.emote) || NETWORK.emoteDurationMs)
  return avatar.connected && !winterFrozen(id, now) && !avatar.interactionBusy && !avatar.tableId && avatar.seatIndex < 0 && !avatar.benchId && !avatar.fitnessId
    && !avatar.telescopeId && !avatar.swimming && !session.activities[id] && !session.gameWatches[id]
    && !emoting && !useFollow.getState().links.some(link => link.followerId === id || link.targetId === id)
    && (id !== session.sessionId || !useJumpmap.getState().run && !useEmoteState.getState().pending)
}

export function carryInteraction() {
  const session = useSession.getState(), own = avatars.get(session.sessionId)
  if (!session.carrySupported || !own || !carryPlayerAvailable(session.sessionId, own) || session.pending) return null
  if (own.carry?.role === 'CARRIER') return {
    kind: 'avatar-throw' as const, id: own.carry.partnerId, label: '캐릭터 방향으로 던지기',
    occupied: false, available: !!parkRuntime.throwAvatar, score: -1, distance: 0,
  }
  if (own.carry || !parkRuntime.pickupAvatar || !interactionAim.ready) return null
  let target: { id: string; distance: number; score: number } | null = null
  for (const [id, avatar] of avatars) {
    if (id === session.sessionId || avatar.carry || !carryPlayerAvailable(id, avatar)) continue
    const distance = Math.hypot(own.current.x - avatar.current.x, own.current.z - avatar.current.z)
    if (distance > 2.6 || Math.abs(own.current.y - avatar.current.y) > 2) continue
    const score = interactionScore(distance, avatar.current)
    if (!Number.isFinite(score) || target && target.score <= score) continue
    target = { id, distance, score }
  }
  return target && { ...target, kind: 'avatar-pickup' as const,
    label: `${avatars.get(target.id)!.nickname} 님 들기`, occupied: false, available: true }
}

export function interactWithAvatar(kind: 'avatar-pickup' | 'avatar-throw', targetId: string) {
  if (kind === 'avatar-pickup') { void parkRuntime.pickupAvatar?.(targetId); return }
  const own = avatars.get(useSession.getState().sessionId), carry = own?.carry
  if (!own || carry?.role !== 'CARRIER') return
  // 서버 방송 사이에도 화면에 보이는 캐릭터 정면(로컬 예측 포함)을 따른다.
  const yaw = sampleAvatar(own, performance.now(), throwPose).yaw
  if (!Number.isFinite(yaw)) return
  void parkRuntime.throwAvatar?.(carry.carryId, {
    dx: Math.sin(yaw), dy: 0, dz: Math.cos(yaw),
  })
}
