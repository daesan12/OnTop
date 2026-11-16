import { groundHeight } from '../../park/mapConfig'
import type { TableAnchor } from '../../park/tablePlacement'

export const STONE_RUMBLE_GUIDE_ID = 'stone-rumble-entrance-stele'

export function stoneRumbleStelePosition(anchor: TableAnchor): [number, number, number] {
  // Keep the guide beside the front approach and clear of the return rows.
  const x = anchor.position[0] + 3.35
  const z = anchor.position[2] + 1.55
  return [x, groundHeight(x, z), z]
}
