export const STONE_TILE_SIZE = 2.6
export const STONE_TILE_RADIUS = STONE_TILE_SIZE / Math.sqrt(3)
export const STONE_TILE_LAYOUT = 'HEX_AXIAL_V2' as const
export const STONE_STEP_DELAY = 1000
export const STONE_DROP_HEIGHT = 41
export const STONE_FLOOR_HEIGHTS = [0, 4, 8, 12, 16, 20, 24, 28, 32] as const
export const STONE_FLOOR_COLORS = ['#a697d5', '#87bfdc', '#e9c76b', '#a697d5', '#87bfdc', '#e9c76b', '#a697d5', '#87bfdc', '#d8e7e7'] as const
export const STONE_FLOOR_RADII = [8, 8, 8, 7, 7, 6, 6, 6, 4] as const
export const STONE_TILE_COUNTS = [217, 217, 217, 169, 169, 127, 127, 127, 8] as const
export const STONE_START_CELLS = [[-2, 0], [2, 0], [0, -3], [0, 3], [-3, 3], [3, -3], [-4, 1], [4, -1]] as const
export const isStoneCell = (floor: number, q: number, r: number) => floor >= 0 && floor < STONE_FLOOR_HEIGHTS.length
  && (floor === STONE_FLOOR_HEIGHTS.length - 1 ? STONE_START_CELLS.some(cell => cell[0] === q && cell[1] === r)
    : stoneTileRing(q, r) <= STONE_FLOOR_RADII[floor]!)

export const stoneTileX = (q: number, r: number) => STONE_TILE_SIZE * (q + r * .5)
export const stoneTileZ = (r: number) => STONE_TILE_SIZE * Math.sqrt(3) * .5 * r
export const stoneTileRing = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))

/** 서버 StoneHexGrid와 동일한 cube rounding으로 사각 모서리의 허공 착지를 막는다. */
export function stoneTileAt(x: number, z: number) {
  const r = z / (STONE_TILE_SIZE * Math.sqrt(3) * .5), q = x / STONE_TILE_SIZE - r * .5, s = -q - r
  let roundedQ = Math.floor(q + .5), roundedR = Math.floor(r + .5)
  const roundedS = Math.floor(s + .5)
  const qError = Math.abs(roundedQ - q), rError = Math.abs(roundedR - r), sError = Math.abs(roundedS - s)
  if (qError > rError && qError > sError) roundedQ = -roundedR - roundedS
  else if (rError > sError) roundedR = -roundedQ - roundedS
  return { q: roundedQ === 0 ? 0 : roundedQ, r: roundedR === 0 ? 0 : roundedR }
}

/** 낙하 중에는 머리 위에 남은 층을 흐리게 해 아래 착지점을 볼 수 있게 한다. */
export function visibleStoneFloor(floor: number, y: number) {
  let visible = floor
  while (visible > 0 && y < STONE_FLOOR_HEIGHTS[visible]! - .35) visible--
  return visible
}
