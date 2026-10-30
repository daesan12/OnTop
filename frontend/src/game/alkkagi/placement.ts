import type { Snapshot } from './replay'
export type Placement = { x: number; y: number; angle: number }

/** 미리보기 안내용. 실제 효과·소모는 항상 서버 검증으로 확정한다. */
export function itemPreview(state: Snapshot | null, type: string, targets: string[], at: Placement | null) {
  const no = (reason: string) => ({ valid: false, reason }), yes = { valid: true, reason: '확정할 수 있습니다.' }
  if (!state) return no('경기 상태를 기다리는 중입니다.')
  const own = state.pieces.filter(p => p.alive && p.owner === state.turn)
  const chosen = targets.map(id => own.find(p => p.id === id))
  const wall = state.wall
  const circleWall = (x: number, y: number, radius: number) => {
    if (!wall) return false
    return overlapsWall(x, y, radius, wall)
  }
  const fits = (x: number, y: number, r: number, excluded: string[], full = true) =>
    Math.abs(x) + (full ? r : 0) <= state.settings.halfWidth && Math.abs(y) + (full ? r : 0) <= state.settings.halfHeight
    && state.pieces.every(p => !p.alive || excluded.includes(p.id) || Math.hypot(x - p.x, y - p.y) >= r + p.radius - 1e-9)
    && !circleWall(x, y, r)
  if (type === 'EXTRA_SHOT') return yes
  if (type === 'WALL') {
    if (wall) return no('이미 벽이 있습니다.')
    if ((state.wallsUsed?.[state.turn] ?? 0) >= 3) return no('경기당 벽 3회를 사용했습니다.')
    if (!at || ![at.x, at.y, at.angle].every(Number.isFinite)) return no('판 위에서 벽 위치를 고르세요.')
    const length = state.itemRules?.wallLength ?? 1.6, thickness = state.itemRules?.wallThickness ?? .18
    const margin = state.itemRules?.wallMargin ?? .12
    const c = Math.abs(Math.cos(at.angle)), s = Math.abs(Math.sin(at.angle))
    if (Math.abs(at.x) + (c * length + s * thickness) / 2 + margin > state.settings.halfWidth
      || Math.abs(at.y) + (s * length + c * thickness) / 2 + margin > state.settings.halfHeight) return no('판 가장자리와 겹칩니다.')
    if (state.pieces.some(p => p.alive && overlapsWall(p.x, p.y, p.radius + .02, { ...at, length, thickness }))) return no('알과 겹칩니다.')
    return yes
  }
  if (chosen.some(p => !p) || chosen.length !== (type === 'SWAP' ? 2 : 1)) return no(type === 'SWAP' ? '내 알 두 개를 고르세요.' : '내 알 하나를 고르세요.')
  const a = chosen[0]!
  if (type === 'SWAP') {
    const b = chosen[1]!
    return a.id !== b.id && fits(b.x, b.y, a.radius, targets, false) && fits(a.x, a.y, b.radius, targets, false)
      && Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 1e-9 ? yes : no('교환 후 알이나 벽과 겹칩니다.')
  }
  if (type === 'RELOCATE') {
    if (!at) return no('이동할 위치를 고르세요.')
    if (Math.hypot(a.x - at.x, a.y - at.y) > (state.itemRules?.relocateDistance ?? 2)) return no('이동 가능 거리를 넘었습니다.')
    return fits(at.x, at.y, a.radius, targets) ? yes : no('알·벽·판 가장자리와 겹칩니다.')
  }
  if (type === 'POWER_UP') return yes
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
