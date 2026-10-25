import type { Bridge, Resolution } from './protocol'
import { pawnPose, type Pose } from './presentation'
export interface PresentedPawn { id: number; userId: string; playerIndex: number; pose: Pose }
export interface Motion { kind: 'move' | 'score' | 'spawn' | 'fall' | 'remove' | 'forfeit'; from: Pose; to: Pose }
export interface Cursor { gameId: string; version: number; resolutionTurnId: number }
export const presentedPawns = (b: Bridge): PresentedPawn[] => b.players.flatMap((p, playerIndex) => p.pawns.map(pawn => ({ id: pawn.id, userId: p.userId, playerIndex, pose: pawnPose(pawn, playerIndex) })))
export function shouldAnimate(previous: Cursor | null, current: Cursor, resolution: Resolution | null, now: number) {
  return !!previous && !!resolution && previous.gameId === current.gameId && current.version > previous.version
    && resolution.turnId > previous.resolutionTurnId && now >= Date.parse(resolution.startedAt) && now - Date.parse(resolution.startedAt) < 1500
}
export function createMotions(previous: PresentedPawn[], next: PresentedPawn[], resolution: Resolution) {
  const old = new Map(previous.map(p => [p.id, p])), targets = new Map(next.map(p => [p.id, p])), motions = new Map<number, Motion>()
  for (const op of resolution.operations) {
    if (op.type === 'FORFEIT_PLAYER') {
      for (const p of next) { const before = old.get(p.id)
        if (p.userId === op.userId && p.pose.scale === 0 && before && before.pose.scale > 0 && !motions.has(p.id)) motions.set(p.id, { kind: 'forfeit', from: before.pose, to: p.pose }) }
      continue
    }
    const before = old.get(op.pawnId!), after = targets.get(op.pawnId!)
    if (!before || !after) continue
    const kind = ({ FALL_PAWN: 'fall', MOVE_PAWN: 'move', SCORE_PAWN: 'score', VACATE_GOAL_SLOT: 'remove', SPAWN_PAWN: 'spawn' } as const)[op.type]
    if (!motions.has(after.id) || op.type === 'SCORE_PAWN') motions.set(after.id, { kind, from: before.pose, to: after.pose })
  }
  return motions
}
/** Presentation only. Completion never mutates the authoritative snapshot. */
export function sampleMotion(m: Motion, elapsed: number, out: Pose) {
  const falling = ['fall', 'remove', 'forfeit'].includes(m.kind), shake = m.kind === 'remove' ? 400 : 0
  const duration = falling ? shake + 600 : m.kind === 'spawn' ? 450 : 650
  if (elapsed >= duration) { Object.assign(out, m.to); return }
  if (shake && elapsed < shake) { Object.assign(out, m.from); out.x += Math.sin(elapsed * .045) * .012; out.roll = Math.sin(elapsed * .045) * .13; return }
  const p = Math.min(1, Math.max(0, (elapsed - shake) / (duration - shake))), t = 1 - (1 - p) ** 3
  if (falling) { out.x = m.from.x + p * .05; out.y = m.from.y - .34 * p * p; out.z = m.from.z; out.scale = m.from.scale * (1 - p); out.roll = p * .8; return }
  out.x = m.from.x + (m.to.x - m.from.x) * t; out.y = m.from.y + (m.to.y - m.from.y) * t + Math.sin(p * Math.PI) * (m.kind === 'score' ? .1 : .055)
  out.z = m.from.z + (m.to.z - m.from.z) * t; out.scale = m.from.scale + (m.to.scale - m.from.scale) * t; out.roll = 0
}
