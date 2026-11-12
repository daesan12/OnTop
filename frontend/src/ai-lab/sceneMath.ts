/** Shared lab dimensions. This is a reviewed rectangle, not the production park collision mesh. */
export const LAB_PARK = { width: 32, depth: 22, left: 4, right: 28, top: 4, bottom: 18, pathHalfWidth: 1.1 } as const
export type ModelRole = 'GUIDE' | 'POLICE' | 'VISITOR'
export type CameraMode = 'overview' | 'follow' | 'board' | 'free'
export function modelRole(role: string | undefined, id: string): ModelRole {
  return role === 'POLICE' || !role && id === 'police' ? 'POLICE' : 'GUIDE'
}
export function headingToward(dx: number, dz: number, fallback: number): number {
  return Math.hypot(dx, dz) < .015 ? fallback : Math.atan2(dx, dz)
}
export function approachAngle(current: number, target: number, amount: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + difference * Math.max(0, Math.min(1, amount))
}
export function smoothFactor(delta: number, rate = 10): number {
  return 1 - Math.exp(-Math.max(0, Math.min(delta, .1)) * rate)
}
