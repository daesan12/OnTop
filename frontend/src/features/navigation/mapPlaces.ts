import { PARK_ZONES } from '../../park/mapConfig'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { PARK_LAYOUT } from '../../map/park'
import { PARK_DESTINATIONS, type Destination } from './parkNavigation'
import { RETURN_TO, START } from '../jumpmap/activeCourse'
import { rpsCabinetPlacement } from '../rpsRoulette/placement'
import { vrEntrance } from '../vrZone/anchors'
import { renewalMap } from '../../park/renewalMap'
import { FACILITY_APPROACHES, NODES, site } from '../../../park-renewal-preview/plan'

export interface MapPlace {
  id: string; name: string; x: number; z: number; destination: Destination; small?: boolean
}
const place = (id: string, name: string, position: { x: number; z: number }, approach = position, small = false): MapPlace =>
  ({ id, name, x: position.x, z: position.z, destination: { x: approach.x, z: approach.z, name: name + ' · 입구/주변' }, small })
const { cabinet, front } = rpsCabinetPlacement({ ...PARK_LAYOUT.SITES.cart, ...PARK_LAYOUT.SETTINGS.fishBreadShop })

const xz = ([x, , z]: readonly number[]) => ({ x: x!, z: z! })
const node = (id: string) => ({ x: NODES[id]![0], z: NODES[id]![1] })

function renewalMapPlaces({ interactions, jumpCourse }: NonNullable<typeof renewalMap>['data']): MapPlace[] {
  const recreation = interactions.recreation ?? []
  const { b: [vrDoorX, vrDoorZ] } = FACILITY_APPROACHES.find(approach => approach.id === 'vr')!
  const gamePlace = (facility: string, id: typeof recreation[number]['id'], name: string) => {
    const anchor = recreation.find(entry => entry.id === id)
    const building = site(facility)
    return place(id, name, building, anchor ? xz(anchor.reachPosition) : node(building.node))
  }
  const plaza = site('plaza')
  return [
    place('plaza', '중앙광장', { x: plaza.x, z: plaza.z - 5 }, node(plaza.node)),
    place('central', '메인 팔각정', site('pavilion'), { x: 0, z: 18 }),
    place('fitness', '운동마당', site('fitness'), interactions.fitness[0]!.use),
    place('fountain', '분수대', site('fountain'), node('fountainGate')),
    place('tower', '40m 전망대', site('tower'), node(site('tower').node)),
    place('lake', '버들호수', site('island-pavilion'), node('island-entry')),
    place('pagoda', '대석탑 정원', site('pagoda'), node('monumentSouthToe')),
    place('vr', 'VR 체험관', site('vr'), { x: vrDoorX, z: vrDoorZ }),
    ...(jumpCourse ? [place('jumpmap', '돌탑 점프맵', jumpCourse.guide, jumpCourse.returnTo)] : []),
    place('ranking-board', '랭킹 보드', xz(interactions.rankingBoard.position), xz(interactions.rankingBoard.reachPosition)),
    place('mailbox', '온탑 소리함', xz(interactions.mailbox.position), node(site('mailbox').node)),
    gamePlace('fortune', 'fortune', '오늘의 운세방'),
    gamePlace('bread', 'fish-bread', '붕어빵 가게'),
    gamePlace('pigeon', 'pigeon-jump-rope', '비둘기 줄넘기'),
    gamePlace('mole', 'mole-shop', '두더지 가게'),
    gamePlace('arcade', 'rps-roulette-cabinet', '오락실'),
    gamePlace('shooting', 'shooting', '온탑 사격장'),
    ...interactions.construction.map(anchor => {
      const label = anchor.id.startsWith('mobility-') ? anchor.label + ' 대여소' : anchor.label
      return place(anchor.id, label, xz(anchor.position), xz(anchor.reachPosition), true)
    }),
  ]
}

/** Marker positions and navigation approaches have separate roles; both follow the live layout. */
export const PARK_MAP_PLACES: readonly MapPlace[] = renewalMap ? renewalMapPlaces(renewalMap.data) : [
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
