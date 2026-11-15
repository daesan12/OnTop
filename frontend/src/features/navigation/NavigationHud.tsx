import { useEffect, useState } from 'react'
import { avatars, useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { viewControls } from '../../world/input'
import { useGame } from '../../game/store'
import { useNavigation, cancelNavigation } from './navigationState'
import { navDistance, navigationHeight, navigationSegmentClear } from './parkNavigation'
import { createRoutePlanner } from './routePlanner'

const ARRIVAL_RADIUS = 3
/** A jump stays up about 0.7 s (jumpSpeed 6.2, gravity 18). Only staying raised longer, on a tower or a deck, pauses the ground route. */
const RAISED_PAUSE_MS = 1200

export function ParkNavigation() {
  const target = useNavigation(s => s.target)
  const status = useNavigation(s => s.status)
  const [display, setDisplay] = useState({ distance: 0, angle: 0, hidden: true })
  useEffect(() => cancelNavigation, [])
  useEffect(() => {
    if (!target) return
    let lastPlan = -Infinity, arrivalAt = 0, pending = false, disposed = false, raisedSince = 0
    const planner = createRoutePlanner()
    let lastOrigin: { x: number; z: number } | undefined
    const tick = () => {
      const session = useSession.getState()
      let state = useNavigation.getState()
      if (state.owner !== session.sessionId || state.channel !== session.roomId) { cancelNavigation(); return }
      const game = useGame.getState()
      const hidden = session.status !== 'connected' || !session.mapCompatible || inputState.manualOpen || inputState.blocked
        || !!(session.tableId || session.benchId || session.fitnessId || session.telescopeId || game.watchedGameId || game.game)
        || inputState.minigameOpen || inputState.feedbackOpen || inputState.notesOpen
      const avatar = avatars.get(session.sessionId), pose = avatar?.current, swimming = !!avatar?.swimming
      setDisplay(old => old.hidden === hidden ? old : { ...old, hidden })
      if (!pose || hidden) return
      const now = performance.now()
      if (arrivalAt) { if (now - arrivalAt > 3000) cancelNavigation(); return }
      if (!swimming && Math.abs(pose.y - 0.8 - navigationHeight(pose)) > 0.9) {
        raisedSince ||= now
        // The path is kept, so the same route resumes the moment the player is back on the ground.
        if (now - raisedSince >= RAISED_PAUSE_MS && state.status !== 'paused') useNavigation.setState({ status: 'paused' })
        return
      }
      raisedSince = 0
      if (state.status === 'paused') {
        useNavigation.setState({ status: state.path.length ? 'guiding' : 'planning' })
        state = useNavigation.getState()
      }
      // A nearby reachable approach is enough, even when search is pending or the
      // player has left the planned line.
      const end = target.arrivalRadius === undefined ? state.path.at(-1) ?? target : target
      if (navDistance(pose, end) <= (target.arrivalRadius ?? ARRIVAL_RADIUS) && navigationSegmentClear(pose, end)) {
        arrivalAt = now; useNavigation.setState({ status: 'arrived', path: [] }); return
      }
      if (pending) return
      let path = state.path, nearest = 0, distance = Infinity
      for (let i = 0; i < path.length; i++) { const d = navDistance(pose, path[i]!); if (d < distance) { distance = d; nearest = i } }
      const offRoute = !path.length || distance > 2.5 || !navigationSegmentClear(pose, path[nearest]!)
      // Water is not walkable, so a swimmer keeps the land route on screen instead of failing to plan from the lake.
      if (offRoute && swimming && !path.length) return
      if (offRoute && !swimming) {
        if ((state.status === 'unreachable' || state.status === 'unavailable') && lastOrigin && navDistance(pose, lastOrigin) < 2) return
        if (now - lastPlan < 2000) return
        lastPlan = now; lastOrigin = { x: pose.x, z: pose.z }
        pending = true
        // The previous arrows stay until the new route replaces them.
        useNavigation.setState({ status: 'planning' })
        const ownsReply = () => !disposed && !arrivalAt && useNavigation.getState().target === target
          && useSession.getState().sessionId === session.sessionId && useSession.getState().roomId === session.roomId
          && useSession.getState().status === 'connected' && useSession.getState().mapCompatible
        void planner.plan(pose, target).then(result => {
          if (!ownsReply()) return
          const path = result.path ?? []
          useNavigation.setState({ path, status: path.length ? 'guiding' : 'unreachable' })
        }).catch(() => {
          if (ownsReply()) useNavigation.setState({ path: [], status: 'unavailable' })
        }).finally(() => { pending = false })
        return
      }
      let remaining = navDistance(pose, path[nearest]!)
      for (let i = nearest + 1; i < path.length; i++) remaining += navDistance(path[i - 1]!, path[i]!)
      let next = path[Math.min(nearest + 1, path.length - 1)]!
      for (let i = nearest + 2; i < path.length && navDistance(pose, path[i]!) < 5; i++) {
        if (!navigationSegmentClear(pose, path[i]!)) break
        next = path[i]!
      }
      setDisplay({ distance: Math.ceil(remaining), angle: (Math.atan2(next.x - pose.x, -(next.z - pose.z)) + viewControls.yaw) * 180 / Math.PI, hidden })
    }
    const first = setTimeout(tick, 0), timer = setInterval(tick, 200)
    return () => { disposed = true; clearTimeout(first); clearInterval(timer); planner.dispose() }
  }, [target])
  if (!target || display.hidden) return null
  const message = status === 'arrived' ? '목적지에 도착했어요' : status === 'unreachable' ? '이 위치에서 걸어갈 길을 찾지 못했어요. 다른 지점을 선택해 주세요.'
    : status === 'unavailable' ? '길 안내를 준비하지 못했어요. 지도에서 목적지를 다시 선택해 주세요.'
    : status === 'paused' ? '지상 산책로로 내려오면 안내를 계속해요' : status === 'planning' ? '가는 길을 찾고 있어요' : `남은 거리 약 ${display.distance} m`
  return <section className="park-navigation" aria-label="내 길 안내" data-status={status}>
    <div className="navigation-compass" aria-hidden="true">{status === 'guiding' ? <svg viewBox="0 0 32 32" style={{ transform: `rotate(${display.angle}deg)` }}><path d="M16 3 28 27 16 22 4 27Z" fill="currentColor" /></svg> : <span>{status === 'arrived' ? '✓' : '⌖'}</span>}</div>
    <div><small>나만의 길 안내 · 직접 이동</small><strong>{target.name}</strong><p role="status">{message}</p></div>
    <button aria-label="길 안내 취소" onClick={() => { cancelNavigation(); document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true }) }}>×</button>
  </section>
}
