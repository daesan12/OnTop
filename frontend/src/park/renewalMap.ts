import type { ParkMapData } from '../map/park'
import { RENEWAL_PARK_ENABLED } from './mapSelection'
import type { TableAnchor } from './tablePlacement'
import type { Point3 } from '../map/park/interactionData'
import type { VrEntrance } from '../features/vrZone/anchors'
import type { buildRenewalJumpCourse } from '../../park-renewal-preview/live/jumpCourseData'

export type RenewalRecreationId = 'fish-bread' | 'rps-roulette-cabinet' | 'plus-minus-cabinet' | 'mole-shop'
export interface RenewalRecreationAnchor {
  id: RenewalRecreationId
  position: Point3
  reachPosition: Point3
  radius: number
}
type RenewalData = Omit<ParkMapData, 'tables' | 'interactions' | 'pavilions' | 'physics'> & {
  physics: ParkMapData['physics'] & { secretTerrainCuts?: readonly number[] }
  jumpCourse?: ReturnType<typeof buildRenewalJumpCourse>
  tables: readonly Omit<TableAnchor, 'spectatorRadius'>[]
  pavilions: readonly (ParkMapData['pavilions'][number] & { spectatorBenchTop?: number })[]
  interactions: Omit<ParkMapData['interactions'], 'benches'> & {
    benches: readonly (ParkMapData['interactions']['benches'][number] & { seatHeight?: number; pavilionId?: string })[]
    recreation?: readonly RenewalRecreationAnchor[]
    vrEntrance?: VrEntrance
    jokeJudge?: Point3
  }
}
type RenewalMap = { mapId: 'park'; mapVersion: string; schemaVersion: 2; data: RenewalData }

async function loadRenewalMap(): Promise<RenewalMap> {
  const response = await fetch('/generated/park-renewal/server-map.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('220m 공원 맵을 읽을 수 없습니다. generate-renewal-park.mjs를 실행해주세요.')
  const map = await response.json() as RenewalMap
  if (map.mapId !== 'park' || map.schemaVersion !== 2 || !/^[a-f0-9]{64}$/.test(map.mapVersion)
    || map.data?.world.half !== 110 || map.data.physics.meshes[0]?.id !== map.data.physics.terrain.meshId) {
    throw new Error('220m 공원 생성물이 올바르지 않습니다.')
  }
  return map
}

// Read the same artifact as Java before the runtime constructs its map admission and prediction.
export const renewalMap = RENEWAL_PARK_ENABLED ? await loadRenewalMap() : null

export function canReachRenewalRecreation(position: { x: number; y: number; z: number }, anchor: RenewalRecreationAnchor) {
  const [x, y, z] = anchor.reachPosition
  return [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - x, position.z - z) <= anchor.radius && Math.abs(position.y - y) <= .9
}

export function renewalGroundHeight(x: number, z: number): number {
  const { terrain, meshes } = renewalMap!.data.physics
  const { halfSize, step, columns } = terrain
  const gx = Math.max(0, Math.min(columns - 1, (x + halfSize) / step))
  const gz = Math.max(0, Math.min(columns - 1, (z + halfSize) / step))
  const col = Math.min(columns - 2, Math.floor(gx)), row = Math.min(columns - 2, Math.floor(gz))
  const u = gx - col, v = gz - row, i = row * columns + col
  const heights = meshes[0]!.vertices
  const a = heights[i * 3 + 1]!, b = heights[(i + 1) * 3 + 1]!
  const c = heights[(i + columns) * 3 + 1]!, d = heights[(i + columns + 1) * 3 + 1]!
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v)
}
