import { snapshotWalls, type Snapshot } from './replay'
export type Placement = { x: number; y: number; angle: number }

/** 미리보기 안내용. 실제 효과·소모는 항상 서버 검증으로 확정한다. */
export function itemPreview(state: Snapshot | null, type: string, targets: string[], at: Placement | null) {
  const no = (reason: string) => ({ valid: false, reason }), yes = { valid: true, reason: '확정할 수 있습니다.' }
  if (!state) return no('경기 상태를 기다리는 중입니다.')
  const ownOnly = type === 'POWER_UP' || type === 'DEFEND'
  const own = state.pieces.filter(p => p.alive && (!ownOnly || p.owner === state.turn))
  const chosen = targets.map(id => own.find(p => p.id === id))
  const walls = snapshotWalls(state)
  const circleWall = (x: number, y: number, radius: number) => {
    return walls.some(wall => overlapsWall(x, y, radius, wall))
  }
  const fits = (x: number, y: number, r: number, excluded: string[], full = false) =>
    Math.abs(x) + (full ? r : 0) <= state.settings.halfWidth && Math.abs(y) + (full ? r : 0) <= state.settings.halfHeight
    && state.pieces.every(p => !p.alive || excluded.includes(p.id) || Math.hypot(x - p.x, y - p.y) >= r + p.radius - 1e-9)
    && !circleWall(x, y, r)
  if (type === 'EXTRA_SHOT') return yes
  if (type === 'WALL') {
    if ((state.wallsUsed?.[state.turn] ?? 0) >= 3) return no('내 벽 3개를 모두 설치했습니다.')
    if (!at || ![at.x, at.y, at.angle].every(Number.isFinite)) return no('판 위에서 벽 위치를 고르세요.')
    const length = state.itemRules?.wallLength ?? 1.6, thickness = state.itemRules?.wallThickness ?? .18
    const margin = state.itemRules?.wallMargin ?? .12
    const c = Math.abs(Math.cos(at.angle)), s = Math.abs(Math.sin(at.angle))
    if (Math.abs(at.x) + (c * length + s * thickness) / 2 + margin > state.settings.halfWidth
      || Math.abs(at.y) + (s * length + c * thickness) / 2 + margin > state.settings.halfHeight) return no('판 가장자리와 겹칩니다.')
    if (state.pieces.some(p => p.alive && overlapsWall(p.x, p.y, p.radius + .02, { ...at, length, thickness }))) return no('알과 겹칩니다.')
    if (walls.some(wall => wallsOverlap({ ...at, length, thickness }, wall))) return no('기존 벽과 겹칩니다.')
    return yes
  }
  if (chosen.some(p => !p) || chosen.length !== (type === 'SWAP' ? 2 : 1)) return no(type === 'SWAP' ? '살아 있는 알 두 개를 고르세요.' : ownOnly ? '내 알 하나를 고르세요.' : '살아 있는 알 하나를 고르세요.')
  const a = chosen[0]!
  if (type === 'SWAP') {
    const b = chosen[1]!
    return a.id !== b.id && fits(b.x, b.y, a.radius, targets, false) && fits(a.x, a.y, b.radius, targets, false)
      && Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 1e-9 ? yes : no('교환 후 알이나 벽과 겹칩니다.')
  }
  if (type === 'RELOCATE') {
    if (!at) return no('이동할 위치를 고르세요.')
    if (Math.hypot(a.x - at.x, a.y - at.y) > (state.itemRules?.relocateDistance ?? 2)) return no('이동 가능 거리를 넘었습니다.')
    return fits(at.x, at.y, a.radius, targets) ? yes : no('다른 알·벽과 겹치거나 중심이 판 밖입니다.')
  }
  if (type === 'POWER_UP') return a.powerUp ? no('이미 힘 강화가 적용된 알입니다.') : yes
  if (a.modifier) return no('기존 크기·방어 효과가 남아 있습니다.')
  if (type === 'DEFEND') return yes
  const scale = type === 'GROW' ? state.itemRules?.growScale ?? 1.25 : state.itemRules?.shrinkScale ?? .8
  return fits(a.x, a.y, a.radius * scale, targets) ? yes : no('바뀐 크기가 알·벽·판 가장자리와 겹칩니다.')
}

export function overlapsWall(x: number, y: number, radius: number, wall: Placement & { length: number; thickness: number }) {
  const dx = x - wall.x, dy = y - wall.y, c = Math.cos(wall.angle), s = Math.sin(wall.angle)
  const ex = Math.max(0, Math.abs(c * dx + s * dy) - wall.length / 2)
  const ey = Math.max(0, Math.abs(-s * dx + c * dy) - wall.thickness / 2)
  return ex * ex + ey * ey < radius * radius - 1e-9
}

export function wallsOverlap(a: Placement & {length:number;thickness:number}, b: Placement & {length:number;thickness:number}) {
  const dx=b.x-a.x,dy=b.y-a.y,ac=Math.cos(a.angle),as=Math.sin(a.angle),bc=Math.cos(b.angle),bs=Math.sin(b.angle)
  return [[ac,as],[-as,ac],[bc,bs],[-bs,bc]].every(([ux,uy])=>{
    const ar=Math.abs(ux*ac+uy*as)*a.length/2+Math.abs(-ux*as+uy*ac)*a.thickness/2
    const br=Math.abs(ux*bc+uy*bs)*b.length/2+Math.abs(-ux*bs+uy*bc)*b.thickness/2
    return Math.abs(dx*ux+dy*uy)<ar+br-1e-9
  })
}
