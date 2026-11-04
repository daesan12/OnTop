import skewer from '../../vrZone/art/skewer-cover-lowpoly.png'
import chef from './art/chef-role-illustration.png'
import hall from './art/server-role-illustration.png'
import celebration from './art/result-celebration.png'

const artworks = [
  { src: skewer, position: '50% 48%' },
  { src: chef, position: '50% 30%' },
  { src: hall, position: '50% 49%' },
  { src: celebration, position: '50% 32%' },
] as const

/** List position and search results must never change a room's visual identity. */
export function roomArtwork(gameId: string) {
  let hash = 2166136261
  for (const character of gameId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return artworks[hash % artworks.length]
}
