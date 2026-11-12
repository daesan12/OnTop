import { PARK_ZONES } from '../../park/mapConfig'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { PARK_LAYOUT } from '../../map/park'
import { PARK_DESTINATIONS, type Destination } from './parkNavigation'
import { RETURN_TO, START } from '../jumpmap/activeCourse'
import { rpsCabinetPlacement } from '../rpsRoulette/placement'
import { vrEntrance } from '../vrZone/anchors'

export interface MapPlace {
  id: string; name: string; x: number; z: number; destination: Destination; small?: boolean
}
const place = (id: string, name: string, position: { x: number; z: number }, approach = position, small = false): MapPlace =>
  ({ id, name, x: position.x, z: position.z, destination: { x: approach.x, z: approach.z, name: name + ' · 입구/주변' }, small })
const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...PARK_LAYOUT.SETTINGS.fishBreadShop })

/** Marker positions and navigation approaches have separate roles; both follow the live layout. */
export const PARK_MAP_PLACES: readonly MapPlace[] = [
  ...PARK_ZONES.map(zone => place(zone.id, zone.id === 'vr' ? GENERATED_PARK_ENABLED ? 'VR 체험관' : 'VR 구역 · 주변' : zone.name,
    zone, GENERATED_PARK_ENABLED && zone.id === 'vr' ? vrEntrance(PARK_LAYOUT.SITES.vr, PARK_LAYOUT.VR_YAW) : PARK_DESTINATIONS[zone.id]!)),
  ...(GENERATED_PARK_ENABLED ? [
    place('folk', '민속놀이 존', PARK_LAYOUT.SITES.folk, vrEntrance(PARK_LAYOUT.SITES.folk, PARK_LAYOUT.VR_YAW)),
    place('jumpmap', '돌탑 점프맵', START, RETURN_TO),
    place('rps-roulette', '오락기', cabinet, front, true),
    ...PARK_LAYOUT.data.interactions.construction.filter(site => site.id === 'layout-drink').map(site =>
      place(site.id, site.label, { x: site.position[0], z: site.position[2] }, { x: site.reachPosition[0], z: site.reachPosition[2] })),
    place('ranking-board', '랭킹 보드', PARK_LAYOUT.SITES.photo, {
      x: PARK_LAYOUT.data.interactions.rankingBoard.reachPosition[0], z: PARK_LAYOUT.data.interactions.rankingBoard.reachPosition[2],
    }),
  ] : []),
]
