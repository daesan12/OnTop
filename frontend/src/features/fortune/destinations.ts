import { TABLES } from '../../park/mapConfig'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { renewalMap, type RenewalRecreationId } from '../../park/renewalMap'
import { PARK_DESTINATIONS, type Destination } from '../navigation/parkNavigation'
import { PARK_MAP_PLACES } from '../navigation/mapPlaces'
import { RETURN_TO } from '../jumpmap/activeCourse'
import type { FortuneGame } from './model'

const renewalEntries: Partial<Record<string, RenewalRecreationId>> = {
  bungeoppang: 'fish-bread',
  'gugu-jump-rope': 'pigeon-jump-rope',
  'rps-roulette': 'rps-roulette-cabinet',
  'plus-minus': 'plus-minus-cabinet',
  'whack-a-mole': 'mole-shop',
  'speed-mole': 'mole-shop',
}

/** Use reviewed real approaches, never the old plaza or the middle of a solid model. */
export function fortuneGuideTarget(game: FortuneGame, pose: { x: number; z: number }): Destination | undefined {
  if (game.destination === 'vr') {
    const entrance = renewalMap?.data.interactions.vrEntrance
    return entrance && {
      x: entrance.x, z: entrance.z, arrivalRadius: entrance.radius, name: '온탑 꼬치왕 · VR 체험관 입구',
    }
  }
  if (game.destination === 'table') {
    if (RENEWAL_PARK_ENABLED) {
      const entrance = PARK_MAP_PLACES.find(place => place.id === 'central')?.destination
      return entrance && { ...entrance, name: `${game.name} · 메인 팔각정 입구` }
    }
    const table = [...TABLES].sort((a, b) => Math.hypot(a.position[0] - pose.x, a.position[2] - pose.z)
      - Math.hypot(b.position[0] - pose.x, b.position[2] - pose.z))[0]
    if (!table) return
    const point = table.interactionPoints?.reduce<typeof table.position | undefined>((nearest, candidate) =>
      !nearest || Math.hypot(candidate[0] - pose.x, candidate[2] - pose.z) < Math.hypot(nearest[0] - pose.x, nearest[2] - pose.z)
        ? candidate : nearest, undefined)
    return { x: point?.[0] ?? table.position[0], z: point?.[2] ?? table.position[2] + 2.7, name: `${game.name} · 게임 테이블` }
  }
  if (RENEWAL_PARK_ENABLED) {
    if (game.destination === 'jumpmap') return { ...RETURN_TO, name: game.name }
    const id = renewalEntries[game.id]
    const target = renewalMap?.data.interactions.recreation?.find(entry => entry.id === id)?.reachPosition
    return target ? { x: target[0], z: target[2], name: `${game.name} · ${id === 'mole-shop' ? '두더지 게임장' : game.destination === 'arcade' ? '오락실' : '입구'}` } : undefined
  }
  const target = game.destination === 'arcade' ? PARK_MAP_PLACES.find(place => place.id === 'rps-roulette')?.destination : PARK_DESTINATIONS[game.destination]
  return target ? { ...target, name: game.destination === 'arcade' ? `${game.name} · 오락기` : game.name } : undefined
}
