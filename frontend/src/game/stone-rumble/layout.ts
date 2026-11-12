export const STONE_TILE_SIZE = 2.6
export const STONE_STEP_DELAY = 1200
export const STONE_FLOOR_HEIGHTS = [0, 12, 24] as const
export const STONE_TILE_COUNTS = [289, 225, 169] as const

/** 낙하 중에는 머리 위에 남은 층을 흐리게 해 아래 착지점을 볼 수 있게 한다. */
export function visibleStoneFloor(floor: number, y: number) {
  let visible = floor
  while (visible > 0 && y < STONE_FLOOR_HEIGHTS[visible]! - .35) visible--
  return visible
}
