import { WORLD } from '../../config/world'
type Point = { x: number; z: number }
/** Keep original approved coordinates in the tether; offset only the drawn marker.
 * Places people clear of destination buttons, the viewer and earlier people.
 */
export function placeMapMarkers<T extends Point>(players: T[], own: Point | null, destinations: readonly Point[]) {
  const occupied = [...destinations.map(p => ({...p, radius: 6})), ...(own ? [{...own, radius: 4}] : [])]
  const edge = WORLD.halfSize - 6
  return players.map((player, index) => {
    let x = player.x, z = player.z
    const clear = () => occupied.every(p => Math.hypot(x-p.x,z-p.z) > p.radius + 5)
    for (let attempt = 0; !clear() && attempt < 256; attempt++) {
      const angle = (attempt + index) * 2.399 + 0.7, radius = 6 + Math.sqrt(attempt + 1) * 3.6
      x = Math.max(-edge, Math.min(edge, player.x + Math.cos(angle)*radius))
      z = Math.max(-edge, Math.min(edge, player.z + Math.sin(angle)*radius))
    }
    occupied.push({x,z,radius:4.3})
    return {...player,drawX:x,drawZ:z}
  })
}
