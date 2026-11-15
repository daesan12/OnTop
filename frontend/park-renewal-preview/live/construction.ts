import type { ParkMapData } from '../../src/map/park'
import { facilityBase, facilityYaw, frontOfApproach } from '../facilityPlacement'
import { groundSurfaceHeight } from '../groundSurface'
import { DOCK_ACCESS, FISHING_ACCESS, SITES, STATION_STAIRS, heightAt, site, type Point } from '../plan'

type ConstructionSite = ParkMapData['interactions']['construction'][number]

function notice(id: string, [x, z]: Point, label = site(id).name, floor = groundSurfaceHeight(x, z)): ConstructionSite {
  const facility = site(id)
  return {
    id, kind: 'CONSTRUCTION', status: 'construction', label,
    position: [facility.x, facilityBase(id), facility.z],
    reachPosition: [x, floor + .8, z],
    yaw: facilityYaw(facility), radius: 3, heightTolerance: .7,
    message: '현재 공사 중입니다. 준비가 끝나면 이용할 수 있어요.',
  }
}

function buildingFront(id: string, distance: number): Point {
  const p = site(id), yaw = facilityYaw(p)
  return [p.x + Math.sin(yaw) * distance, p.z + Math.cos(yaw) * distance]
}

export function buildRenewalConstructionSites(): ConstructionSite[] {
  const balloon = site('balloon')
  return [
    { ...notice('cafe', buildingFront('cafe', -4.25)), radius: 2.1 },
    notice('folk', frontOfApproach('folk'), '전통놀이존'),
    notice('balloon', [balloon.x, balloon.z + STATION_STAIRS.zTop - 2], '열기구 승강장',
      heightAt(balloon.x, balloon.z) + STATION_STAIRS.top),
    notice('dock', DOCK_ACCESS.points.at(-1)!, '오리배 선착장', DOCK_ACCESS.top),
    notice('fishing', FISHING_ACCESS.points.at(-1)!, '호숫가 낚시터', FISHING_ACCESS.top),
    ...SITES.filter(facility => facility.asset === 'pair')
      .map(facility => notice(facility.id, frontOfApproach(facility.id))),
  ]
}
