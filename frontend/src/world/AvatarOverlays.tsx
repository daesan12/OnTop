import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Object3D } from 'three'
import { OverlayProjection, OverlayView } from './overlayProjection'
import { OVERHEAD } from '../park/mapConfig'
import { avatars, useSession } from '../network/worldClient'
import { useGathering } from '../features/tableLobby/gathering'
import { OMOK_FOCUS_LAYER } from './omokCamera'
import { OneCardOverhead } from '../game/onecard/OneCardOverhead'
import { useGame } from '../game/store'
import { useShop } from '../features/shop/controller'
import { AVATAR_ACTIVITY_LABELS } from '../network/avatarActivity'
import { ownGameActivity } from './avatarActivity'
import { useOmokEvents } from '../game/omok/spectatorEvents'
import { gameChatScope } from '../features/chat/gameChat'
import { displayNickname } from '../features/gameMaster/displayName'
import { TypingIndicator } from '../features/chat/TypingIndicator'
import '../features/vrSession/presence.css'

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
  const worldBubble = useSession((state) => state.bubbles[id]), gameId = useGame(gameChatScope)
  const chat = useOmokEvents(state => gameId ? state.chats.filter(message => message.gameId === gameId && message.senderUserId === id).at(-1) : undefined)
  const bubble = useMemo(() => gameId ? chat && { id: chat.eventId, text: chat.text, expiresAt: chat.until }
    : worldBubble, [gameId, chat, worldBubble])
  const own = useSession((state) => state.sessionId === id)
  const vrActive = useSession(state => state.status === 'connected' && state.mapCompatible && !!state.vrPlayers[id])
  const activity = useSession(state => state.activities[id])
  const local = useSession(state => state.sessionId === id && state.status === 'connected' && state.mapCompatible)
  const playing = useGame(state => local && ownGameActivity(id, state))
  const shopping = useShop(state => local && state.open && state.owner === id)
  const activityLabel = activity ? AVATAR_ACTIVITY_LABELS[activity]
    : playing ? AVATAR_ACTIVITY_LABELS.GAME : shopping ? AVATAR_ACTIVITY_LABELS.SHOP : null
  const nickname = useSession(state => displayNickname(state.profiles[id],
    state.sessionId === id ? '나' : '산책자 ' + id.slice(-6)))
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
      <div className="avatar-nickname">{nickname}{vrActive ? <span className="avatar-vr-badge" aria-label="VR 플레이 중">VR</span> : null}</div>
      <TypingIndicator userId={id} />
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
      {ids.map((id) => (
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
  const view = useMemo(() => new OverlayView(), [])
  const projections = useMemo(() => new WeakMap<HTMLDivElement, OverlayProjection>(), [])
  const lastTransforms = useRef(new Map<string, string>())
  useFrame(({ camera, size }) => {
    const session = useSession.getState()
    const local = avatars.get(session.sessionId)
    const maxDistance = session.telescopeId
      ? OVERHEAD.telescopeMaxDistance
      : OVERHEAD.maxDistance
    const topdown = camera.layers.mask === 1 << OMOK_FOCUS_LAYER
    camera.updateMatrixWorld()
    view.update(camera, size.width, size.height)
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
        let projection = projections.get(element)
        if (!projection) {
          projection = new OverlayProjection(); projections.set(element, projection)
          lastTransforms.current.delete(id)
        }
        const bounds = overlaySizes.get(element)
        const result = projection.project(rig.head.matrixWorld, camera, view,
          bounds?.width ?? 260, bounds?.height ?? 40, OVERHEAD.headOffset)
        visible = result.visible
        if (visible) {
          // An on-screen head can still have its multi-line speech above the
          // viewport. Keep that bubble whole without revealing off-screen players.
          const previous = avatarScreenPositions.get(id)
          if (!previous || previous.x !== result.x || previous.y !== result.y)
            avatarScreenPositions.set(id, { x: result.x, y: result.y })
          const transform = result.transform
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
