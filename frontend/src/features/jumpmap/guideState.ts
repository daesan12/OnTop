import { create } from 'zustand'
import { clearRoamingInput } from '../../world/inputOwnership'
import { GUIDE } from './activeCourse'

export const JUMPMAP_GUIDE_RADIUS = GUIDE.radius
export const jumpmapGuideScope = (s: { sessionId: string; roomId: string; mapVersion: string }) =>
  JSON.stringify([s.sessionId, s.roomId, s.mapVersion])
export function canReachJumpmapGuide(p: { x: number; y: number; z: number }) {
  return [p.x,p.y,p.z].every(Number.isFinite)
    && Math.hypot(p.x-GUIDE.x,p.z-GUIDE.z) <= JUMPMAP_GUIDE_RADIUS
    && Math.abs(p.y-.8-GUIDE.y) <= 1
}
// 안내만 열고 닫는다. 시작 요청·입장 비용·순간 이동·다음 도전 잠금은 없다.
export const useJumpmapGuide = create(() => ({ scope: '' }))
export function openJumpmapGuide(scope: string) {
  clearRoamingInput()
  useJumpmapGuide.setState({ scope })
}
export function closeJumpmapGuide() { useJumpmapGuide.setState({ scope: '' }) }
