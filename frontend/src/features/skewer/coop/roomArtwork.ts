import lantern from './art/rooms/lantern.webp'
import grill from './art/rooms/grill.webp'
import garden from './art/rooms/garden.webp'
import moon from './art/rooms/moon.webp'
import blossom from './art/rooms/blossom.webp'
import bamboo from './art/rooms/bamboo.webp'
import teapot from './art/rooms/teapot.webp'
import pass from './art/rooms/pass.webp'

const artworks = [
  { src: lantern, position: '50% 52%' },
  { src: grill, position: '50% 55%' },
  { src: garden, position: '50% 55%' },
  { src: moon, position: '50% 47%' },
  { src: blossom, position: '50% 50%' },
  { src: bamboo, position: '50% 50%' },
  { src: teapot, position: '50% 52%' },
  { src: pass, position: '50% 59%' },
] as const

/** List position and search results must never change a room's visual identity. */
export function roomArtwork(gameId: string) {
  let hash = 2166136261
  for (const character of gameId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return artworks[hash % artworks.length]
}
