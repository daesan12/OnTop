import { create } from 'zustand'
import { avatars, estimatedServerTime, useSession } from '../../../network/worldClient'
import { panelOwnsKeys } from '../../../world/inputOwnership'
import { winterFrozen } from '../state'
import { holdSnow } from './api'
import { useWinterCommunity, type RollingBall } from './state'

export const useSnowRollInput = create<{ phase: 'idle' | 'pressing' | 'starting' | 'rolling'; error: string }>(() => ({ phase: 'idle', error: '' }))
type Gesture = { scope: string; operation: string; desired: boolean; long: boolean; short: () => void
  timer: ReturnType<typeof setTimeout>; heartbeat?: ReturnType<typeof setInterval>; ball?: Pick<RollingBall, 'id'>; released?: boolean }
let gesture: Gesture | undefined
let ordered: Promise<unknown> = Promise.resolve()
const scope = () => { const s = useSession.getState(); return `${s.sessionId}:${s.roomId}` }

function nearestBall() {
  const s = useSession.getState(), own = avatars.get(s.sessionId)
  if (!own) return undefined
  return useWinterCommunity.getState().building?.balls.filter(ball => {
    const dx = ball.x - own.current.x, dz = ball.z - own.current.z, distance = Math.hypot(dx, dz)
    return !ball.reserved && distance <= ball.radius + 2.2
      && (distance < .2 || (dx * Math.sin(own.current.yaw) + dz * Math.cos(own.current.yaw)) / distance > .25)
  }).sort((a, b) => Math.hypot(a.x - own.current.x, a.z - own.current.z) - Math.hypot(b.x - own.current.x, b.z - own.current.z))[0]
}

async function release(g: Gesture) {
  if (g.heartbeat) clearInterval(g.heartbeat)
  if (g.ball && g.scope === scope() && !g.released) {
    g.released = true
    try { await holdSnow('RELEASE', g.operation, g.ball) }
    catch (error) {
      if (!gesture) useSnowRollInput.setState({ error: error instanceof Error ? error.message : '눈을 놓는 중 연결이 지연됐어요.' })
    }
  }
}

export function beginSnowPress(short: () => void) {
  if (gesture) return
  const g: Gesture = { scope: scope(), operation: crypto.randomUUID(), desired: true, long: false, short,
    timer: setTimeout(() => {}, 0) }
  clearTimeout(g.timer)
  gesture = g
  useSnowRollInput.setState({ phase: 'pressing', error: '' })
  g.timer = setTimeout(() => {
    g.long = true
    if (gesture === g) useSnowRollInput.setState({ phase: 'starting' })
    ordered = ordered.catch(() => {}).then(async () => {
      if (!g.desired || g.scope !== scope()) return
      try {
        await holdSnow('BEGIN', g.operation, nearestBall())
        const self = useSession.getState().sessionId
        g.ball = useWinterCommunity.getState().building?.balls.find(ball => ball.pushing.includes(self))
        if (!g.desired || g.scope !== scope() || gesture !== g) { await release(g); return }
        if (!g.ball) throw Error('눈을 굴릴 자리를 다시 확인해주세요.')
        useSnowRollInput.setState({ phase: 'rolling' })
        let pending = false
        g.heartbeat = setInterval(() => {
          if (g.scope !== scope() || document.hidden || panelOwnsKeys() || winterFrozen(self, estimatedServerTime())) { endSnowPress(true); return }
          if (pending) return
          pending = true
          void holdSnow('KEEP', g.operation, g.ball).catch(error => {
            if (gesture === g) { endSnowPress(true); useSnowRollInput.setState({ error: error instanceof Error ? error.message : '눈 굴리기를 다시 시작해주세요.' }) }
          }).finally(() => { pending = false })
        }, 600)
      } catch (error) {
        if (gesture === g) {
          gesture = undefined
          useSnowRollInput.setState({ phase: 'idle', error: error instanceof Error ? error.message : '눈 굴리기를 시작하지 못했어요.' })
        }
      }
    })
  }, 450)
}

export function endSnowPress(cancel = false) {
  const g = gesture
  if (!g) return
  gesture = undefined; g.desired = false
  clearTimeout(g.timer)
  if (g.heartbeat) clearInterval(g.heartbeat)
  useSnowRollInput.setState({ phase: 'idle' })
  if (!g.long && !cancel && g.scope === scope()) g.short()
  else ordered = ordered.catch(() => {}).then(() => release(g))
}

export function clearSnowRollInput() { endSnowPress(true); useSnowRollInput.setState({ phase: 'idle', error: '' }) }
