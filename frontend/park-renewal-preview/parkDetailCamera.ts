import layout from './layout.json'
import { parkDetailIds, type ParkDetailId } from './parkDetailMeshes'
import { TOWER_TOP } from './towerFurniturePlan'

type Point = [number, number, number]
type CloseView = { facility: string; offset: Point; eye: Point }

const closeViews: Partial<Record<ParkDetailId, CloseView>> = {
  jump: { facility: 'jump', offset: [60, 22, 5], eye: [140, 105, 165] },
  pagoda: { facility: 'pagoda', offset: [0, 9, 0], eye: [27, 25, 33] },
  fountain: { facility: 'fountain', offset: [0, 1, 0], eye: [19, 23, 26] },
  mailbox: { facility: 'mailbox', offset: [0, 1.2, 0], eye: [3.5, 2.1, 5] },
  ranking: { facility: 'ranking', offset: [0, 2.5, 0], eye: [6, 5, 13] },
  notes: { facility: 'tower', offset: [TOWER_TOP.notes[0], TOWER_TOP.floor + 1.3, TOWER_TOP.notes[1]], eye: [-5, 2.6, 3.5] },
  telescope: { facility: 'tower', offset: [-3, TOWER_TOP.floor + 1.2, -5.4], eye: [-4, 3, 7] },
  gacha: { facility: 'gacha', offset: [0, 2.6, 0], eye: [4, 3.5, 7.5] },
  fortress: { facility: 'balloon', offset: [23, -8, 1], eye: [80, 54, 90] },
  stairs: { facility: 'pagoda', offset: [0, 0, 0], eye: [24, 22, 27] },
}

export function detailProfileAsset(query: URLSearchParams): ParkDetailId {
  return parkDetailIds.find(id => id === query.get('asset')) ?? 'jump'
}

export function detailProfileFacility(id: ParkDetailId) {
  return closeViews[id]?.facility
}

export function detailCamera(id: ParkDetailId, aspect: number): { position: Point; target: Point } {
  const portrait = aspect < 0.9
  const fovFactor = portrait ? Math.tan(75 * Math.PI / 360) / Math.tan(40 * Math.PI / 360) : 1
  const fit = Math.max(1, 1.2 / (aspect * fovFactor))
  const close = closeViews[id]
  if (!close) {
    const eye = portrait ? [-165, 255, 245] : [-245, 195, 325]
    return { position: [eye[0]! * fit, eye[1]! * fit, eye[2]! * fit], target: [-5, 38, -10] }
  }
  const { position: [x, y, z] } = layout.facilities.find(facility => facility.id === close.facility)!
  const { stairs } = layout
  const target: Point = id === 'stairs'
    ? [stairs.x, (stairs.bottom + stairs.top) / 2, (stairs.zTop + stairs.zBottom) / 2]
    : [x! + close.offset[0], y! + close.offset[1], z! + close.offset[2]]
  return { position: [target[0] + close.eye[0] * fit, target[1] + close.eye[1] * fit, target[2] + close.eye[2] * fit], target }
}
