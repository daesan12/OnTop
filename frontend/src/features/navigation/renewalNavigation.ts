import { inLake, insidePark, onRoad } from '../../../park-renewal-preview/plan'
import { renewalGroundHeight, renewalMap } from '../../park/renewalMap'
import type { NavPoint } from './parkNavigation'

// The 2D guide uses outdoor walkable surfaces. The tower marker leads to its entrance.
const surfaceIds = /^(main-pavilion-|rest-pavilion-|pagoda-|monument-stairs$|balloon-boarding-|island-bridge|dock-access-|duck-dock-rear-deck$|fishing-|tower-entrance$)/
type Triangle = readonly [number, number, number, number, number, number, number, number, number]
const buckets = new Map<string, Triangle[]>()
const cell = 4
const key = (x: number, z: number) => x + ',' + z
for (const mesh of renewalMap?.data.physics.meshes ?? []) {
  if (mesh.role !== 'surface' || !surfaceIds.test(mesh.id)) continue
  const vertices = mesh.vertices
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index]! * 3, b = mesh.indices[index + 1]! * 3, c = mesh.indices[index + 2]! * 3
    const triangle: Triangle = [
      vertices[a]!, vertices[a+1]!, vertices[a+2]!, vertices[b]!, vertices[b+1]!, vertices[b+2]!,
      vertices[c]!, vertices[c+1]!, vertices[c+2]!,
    ]
    const [ax, , az, bx, , bz, cx, , cz] = triangle
    for (let x = Math.floor(Math.min(ax,bx,cx)/cell); x <= Math.floor(Math.max(ax,bx,cx)/cell); x++) {
      for (let z = Math.floor(Math.min(az,bz,cz)/cell); z <= Math.floor(Math.max(az,bz,cz)/cell); z++) {
        const bucket = key(x,z)
        const entries = buckets.get(bucket)
        if (entries) entries.push(triangle)
        else buckets.set(bucket, [triangle])
      }
    }
  }
}

function deckHeight({ x, z }: NavPoint) {
  let floor = -Infinity
  const triangles = buckets.get(key(Math.floor(x/cell), Math.floor(z/cell)))
  if (!triangles) return floor
  for (const [ax,ay,az,bx,by,bz,cx,cy,cz] of triangles) {
    const d = (bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
    if (Math.abs(d) < 1e-9) continue
    const a = ((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d
    const b = ((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d
    const c = 1-a-b
    if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) floor = Math.max(floor, a*ay+b*by+c*cy)
  }
  return floor
}

export const renewalNavigationHeight = (point: NavPoint) =>
  Math.max(renewalGroundHeight(point.x, point.z), deckHeight(point))
export const renewalNavigationLand = (point: NavPoint) =>
  insidePark(point.x, point.z, .45) && (!inLake(point.x, point.z) || Number.isFinite(deckHeight(point)))
export const renewalNavigationRoad = ({ x, z }: NavPoint) => onRoad(x, z)
