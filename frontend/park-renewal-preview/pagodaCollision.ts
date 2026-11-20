import { GARDEN_PAGODA, PAGODA_TIERS } from '../src/config/pagoda'
import type { PhysicalBox, PhysicalHull } from '../src/map/park/physics'

/** 장식 부조를 제외한 기단·몸통·지붕의 연속된 충돌면. 모델의 한 번 스케일과 일치한다. */
export function mainPagodaCollision(x: number, ground: number, z: number) {
  const scale = GARDEN_PAGODA.scale, horizontal = scale * GARDEN_PAGODA.widthScale
  const base = ground + 1.8, boxes: PhysicalBox[] = [], hulls: PhysicalHull[] = []
  const box = (id: string, width: number, depth: number, bottom: number, top: number) => {
    boxes.push({ id: 'main-pagoda-' + id, role: 'solid', yaw: 0,
      center: [x, base + (bottom + top) / 2 * scale, z],
      half: [width * horizontal / 2, (top - bottom) * scale / 2, depth * horizontal / 2] })
  }
  for (const [i, [bottom, top, width]] of [
    [0, .24, 7.4], [.24, .60, 5.65], [.60, .76, 6], [.76, 1.34, 5.2],
    [1.34, 1.46, 5.55], [1.46, 1.80, 4.95], [1.80, 1.92, 5.3], [1.92, 2.44, 4.45], [2.44, 2.60, 4.85],
  ].entries()) box('plinth-' + i, width! * 1.15, width! * 1.15, bottom! - .015, top! + .015)
  for (const [i, t] of PAGODA_TIERS.entries()) {
    const body = t.width * .69, cross = t.cross ? .55 : 1
    for (let side = 0; side < (t.cross ? 2 : 1); side++) {
      box('body-' + i + '-' + side, side ? body * cross : body, side ? body : body * cross,
        t.y - .025, t.y + t.bodyHeight + t.roofHeight * .16)
      // 폭이 줄어드는 볼록체로 처마와 경사를 연결해 층 사이 틈을 막는다.
      const width = t.width * (side ? cross : 1), depth = t.width * (side ? 1 : cross)
      hulls.push({ id: 'main-pagoda-roof-' + i + '-' + side, role: 'solid',
        vertices: [[1, .08], [.59, 1]].flatMap(([radius, height]) =>
          [-1, 1].flatMap(sx => [-1, 1].flatMap(sz => [
            x + sx * width * horizontal * radius! / 2,
            base + (t.y + t.bodyHeight + t.roofHeight * height!) * scale,
            z + sz * depth * horizontal * radius! / 2,
          ]))) })
    }
  }
  box('crown', .8, .8, 19.05, 19.95)
  return { boxes, hulls }
}
