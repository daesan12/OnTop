import { create } from 'zustand'
import { avatars, useSession } from '../../../network/worldClient'
import { clearRoamingInput, inputState } from '../../../world/inputOwnership'
import { SNOW_BUILD_ZONES } from '../plan'
import { renewalGroundHeight } from '../../../park/renewalMap'
import { endSnowPress } from './rollInput'
import { useWinterCommunity, type RollingBall } from './state'

export type Workshop = { ids: string[]; base: number; middle: number; head: number; points: { x: number; z: number }[] }
export type SnowPreview = { x: number; z: number; yaw: number; name: string; hat: 'TOP_HAT' | 'BEANIE' | 'NONE'; scarf: 'RED' | 'GREEN' | 'BLUE' | 'GOLD'; face: 'SMILE' | 'WINK' }
export const useWinterCommunityPanel = create<{ kind: 'tree' | 'snowman' | null; scope: string; workshop: Workshop | null; preview: SnowPreview | null }>(() => ({ kind: null, scope: '', workshop: null, preview: null }))

export function nearbyAssembly(): Workshop | null {
  const s = useSession.getState(), own = avatars.get(s.sessionId), building = useWinterCommunity.getState().building
  if (!own || !building) return null
  const available = building.balls.filter(ball => !ball.reserved && !ball.pushing.length
    && Math.hypot(ball.x - own.current.x, ball.z - own.current.z) <= 7).sort((a, b) => b.radius - a.radius).slice(0, 3)
  if (available.length !== 3) return null
  const [base, middle, head] = snowmanSizes(available)
  if (base < .65 || middle < .4 || head < .25) return null
  const points: { x: number; z: number }[] = []
  for (let i = 0; i < 8; i++) {
    const angle = own.current.yaw + i * Math.PI / 4, distance = base + 1.3
    const x = own.current.x + Math.sin(angle) * distance, z = own.current.z + Math.cos(angle) * distance
    if (!SNOW_BUILD_ZONES.some(zone => Math.hypot(x - zone.x, z - zone.z) + base + .35 <= zone.radius)) continue
    if (building.snowmen.some(man => Math.hypot(x - man.x, z - man.z) < base + man.baseRadius + .5)) continue
    if ([...avatars.values()].some(avatar => avatar.connected && Math.abs(avatar.current.y - renewalGroundHeight(x, z)) < 7
      && Math.hypot(x - avatar.current.x, z - avatar.current.z) < base + .5)) continue
    if (building.balls.some(ball => !available.some(chosen => chosen.id === ball.id)
      && Math.hypot(x - ball.x, z - ball.z) < base + ball.radius + .1)) continue
    points.push({ x, z })
  }
  return points.length ? { ids: available.map(ball => ball.id), base, middle, head, points } : null
}

function snowmanSizes(balls: RollingBall[]) {
  const base = Math.floor(balls[0]!.radius * 1000) / 1000
  const middle = Math.floor(Math.min(balls[1]!.radius, base * .78) * 1000) / 1000
  const head = Math.floor(Math.min(balls[2]!.radius, middle * .72) * 1000) / 1000
  return [base, middle, head]
}

export function openWinterCommunity(kind: 'tree' | 'snowman') {
  const s = useSession.getState(), workshop = kind === 'snowman' ? nearbyAssembly() : null
  if (kind === 'snowman' && !workshop) return false
  endSnowPress(true); clearRoamingInput(); inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useWinterCommunityPanel.setState({ kind, workshop, scope: `${s.sessionId}:${s.roomId}` })
  return true
}

export function closeWinterCommunity() {
  if (useWinterCommunityPanel.getState().kind) inputState.minigameOpen = false
  useWinterCommunityPanel.setState({ kind: null, workshop: null, scope: '', preview: null })
}
