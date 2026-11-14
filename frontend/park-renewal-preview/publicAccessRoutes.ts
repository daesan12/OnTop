import { OBSERVATION_TOWER } from '../src/config'
import { fountainPavingRadius } from '../src/layout-preview/fountainPaving'
import { fountainAccessHeight } from './fountainAccessSurface'
import { HILL_COORDINATES, HILL_NODE_IDS } from './hillRoute'
import { BRIDGE, DOCK_ACCESS, STATION_APPROACH, TOWER_ACCESS, heightAt, site } from './plan'
import { towerRampRadius, towerRampStartY } from './towerEntrance'

type Node = readonly [x: number, z: number, height?: number]

export function publicAccessRoute(id: string): { nodes: Node[]; meshes: string[]; lakeDeck?: boolean } | undefined {
  if (id === 'island-bridge') {
    return { nodes: [[55.1, BRIDGE.z], [25, BRIDGE.z]], meshes: [], lakeDeck: true }
  }
  if (id === 'duck-dock') {
    const nodes: Node[] = [[51, 29], ...DOCK_ACCESS.points, [56, DOCK_ACCESS.points[2]![1]]]
    return { nodes: nodes.reverse(), meshes: [], lakeDeck: true }
  }
  if (id === 'balloon-hill') {
    const nodes: Node[] = [[-86, 12], [-81, 2], ...HILL_NODE_IDS.map(key => HILL_COORDINATES[key]),
      [-48, -52], STATION_APPROACH.a, STATION_APPROACH.b]
    return { nodes: nodes.reverse(), meshes: [] }
  }
  if (id === 'tower-ramp') {
    const tower = site('tower')
    const { turns, segments } = OBSERVATION_TOWER
    const spiral: Node[] = Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments, angle = 2 * Math.PI * turns * t
      return [tower.x - towerRampRadius * Math.cos(angle), tower.z - towerRampRadius * Math.sin(angle), towerRampStartY + 40 * t]
    })
    const deck: Node = [tower.x - towerRampRadius + 1, tower.z - .6, towerRampStartY + 40]
    const nodes: Node[] = [...TOWER_ACCESS.points.slice(0, -1), ...spiral, deck]
    return { nodes: nodes.reverse(), meshes: ['tower-walkway-floor', 'tower-top-floor'] }
  }
  if (id === 'fountain-west' || id === 'fountain-east') {
    const f = site('fountain'), base = heightAt(f.x, f.z)
    const angle = Math.atan2(-7.19, -17.37) + (id === 'fountain-east' ? Math.PI : 0)
    const nodes: Node[] = [11.8, fountainPavingRadius, 19].map(r => {
      const dx = Math.cos(angle) * r, dz = Math.sin(angle) * r
      return [f.x + dx, f.z + dz, base + fountainAccessHeight(dx, dz)]
    })
    return { nodes, meshes: ['renewal-fountain-walkway'] }
  }
}
