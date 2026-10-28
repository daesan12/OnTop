import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Object3D } from 'three'
import { OVERHEAD } from '../config'
import { avatars, useSession } from '../network/worldClient'
import { useGathering } from '../features/tableLobby/gathering'
import { OMOK_FOCUS_LAYER } from './omokCamera'
import { OneCardOverhead } from '../game/onecard/OneCardOverhead'
import { useGame } from '../game/store'
import { useShop } from '../features/shop/controller'
import { AVATAR_ACTIVITY_LABELS } from '../network/avatarActivity'
import { ownGameActivity } from './avatarActivity'

export interface AvatarAnchors {
  root: Object3D
  head: Object3D
}

export type OverlayTargets = Map<string, HTMLDivElement>
const overlaySizes = new WeakMap<
  HTMLDivElement,
  { width: number; height: number }
>()
/** Latest visible screen-space head positions, reused by the avatar context menu. */
export const avatarScreenPositions = new Map<string, { x: number; y: number }>()

const AvatarOverlay = memo(function AvatarOverlay({
  id,
  targets,
}: {
  id: string
  targets: OverlayTargets
}) {
  const bubble = useSession((state) => state.bubbles[id])
  const own = useSession((state) => state.sessionId === id)
  const activity = useSession(state => state.activities[id])
  const local = useSession(state => state.sessionId === id && state.status === 'connected' && state.mapCompatible)
  const playing = useGame(state => local && ownGameActivity(id, state))
  const shopping = useShop(state => local && state.open && state.owner === id)
  const activityLabel = activity ? AVATAR_ACTIVITY_LABELS[activity]
    : playing ? AVATAR_ACTIVITY_LABELS.GAME : shopping ? AVATAR_ACTIVITY_LABELS.SHOP : null
  const nickname = useSession(state => state.profiles[id]?.nickname
    ?? (state.sessionId === id ? '나' : '산책자 ' + id.slice(-6)))
  const gathering = useGathering(), participant = gathering?.rows.find(row => row.playerId === id)
  const [expiredId, setExpiredId] = useState('')
  const elementRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      overlaySizes.set(element, {
        width: element.offsetWidth,
        height: element.offsetHeight,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!bubble) return
    const timer = setTimeout(
      () => setExpiredId(bubble.id),
      Math.max(0, bubble.expiresAt - performance.now()),
    )
    return () => clearTimeout(timer)
  }, [bubble])
  const speaking =
    bubble && bubble.id !== expiredId && bubble.expiresAt > performance.now()
  return (
    <div
      ref={(element) => {
        elementRef.current = element
        if (element) targets.set(id, element)
        else targets.delete(id)
      }}
      className={`avatar-overhead${own ? ' avatar-overhead-own' : ''}`}
      data-player-id={id}
    >
      {speaking && <div className="avatar-speech">{bubble.text}</div>}
      {activityLabel && <div className="avatar-speech avatar-activity">{activityLabel}</div>}
      <div className="avatar-nickname">{nickname}</div>
      <OneCardOverhead userId={id} />
      {participant && <div className={`gathering-role${participant.ready ? ' is-ready' : ''}`} style={{ display: 'block' }}>{participant.label}</div>}
    </div>
  )
})

/** One DOM layer; chat updates do not reconcile the 3D world. */
export function AvatarOverlays({ targets }: { targets: OverlayTargets }) {
  const ids = useSession((state) => state.ids)
  return (
    <div className="avatar-overlays" aria-hidden="true">
      {ids.slice(0, OVERHEAD.maxVisible).map((id) => (
        <AvatarOverlay key={id} id={id} targets={targets} />
      ))}
    </div>
  )
}

/** Project the animated head after the avatar and camera have moved. No frame state updates. */
export function AvatarOverlayPositions({
  rigs,
  targets,
}: {
  rigs: Map<string, AvatarAnchors>
  targets: OverlayTargets
}) {
  const point = useMemo(() => new Vector3(), [])
  const lastTransforms = useRef(new Map<string, string>())
  useFrame(({ camera, size }) => {
    const session = useSession.getState()
    const local = avatars.get(session.sessionId)
    const maxDistance = session.telescopeId
      ? OVERHEAD.telescopeMaxDistance
      : OVERHEAD.maxDistance
    const topdown = camera.layers.mask === 1 << OMOK_FOCUS_LAYER
    camera.updateMatrixWorld()
    for (const [id, element] of targets) {
      const avatar = avatars.get(id)
      const rig = rigs.get(id)
      let visible = !!(
        local &&
        avatar &&
        rig?.root.visible &&
        !topdown &&
        Math.hypot(
          avatar.current.x - local.current.x,
          avatar.current.z - local.current.z,
        ) <= maxDistance
      )
      if (visible && rig) {
        rig.head.updateWorldMatrix(true, false)
        point.set(0, OVERHEAD.headOffset, 0).applyMatrix4(rig.head.matrixWorld)
        point.project(camera)
        visible =
          point.z >= -1 &&
          point.z <= 1 &&
          Math.abs(point.x) <= 1 &&
          Math.abs(point.y) <= 1
        if (visible) {
          const projectedX = ((point.x + 1) * size.width) / 2
          const projectedY = ((1 - point.y) * size.height) / 2
          // An on-screen head can still have its multi-line speech above the
          // viewport. Keep that bubble whole without revealing off-screen players.
          const bounds = overlaySizes.get(element)
          const halfWidth = (bounds?.width ?? 260) / 2
          const screenX = Math.max(
            halfWidth + 8,
            Math.min(size.width - halfWidth - 8, projectedX),
          )
          const screenY = Math.max((bounds?.height ?? 40) + 8, projectedY)
          avatarScreenPositions.set(id, { x: screenX, y: screenY })
          const x = screenX.toFixed(1)
          const y = screenY.toFixed(1)
          const transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`
          if (lastTransforms.current.get(id) !== transform) {
            element.style.transform = transform
            lastTransforms.current.set(id, transform)
          }
        }
      }
      const visibility = visible ? 'visible' : 'hidden'
      const opacity = String(rig?.root.userData.appearanceOpacity ?? 1)
      if (element.style.opacity !== opacity) element.style.opacity = opacity
      if (!visible) avatarScreenPositions.delete(id)
      if (element.style.visibility !== visibility)
        element.style.visibility = visibility
    }
    for (const id of lastTransforms.current.keys())
      if (!targets.has(id)) {
        lastTransforms.current.delete(id)
        avatarScreenPositions.delete(id)
      }
  })
  return null
}
