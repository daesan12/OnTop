import { BufferGeometry, Float32BufferAttribute } from 'three'
import { OBSERVATION_TOWER } from '../src/config'
import { groundSurfaceHeight } from './groundSurface'
import { heightAt, site } from './plan'

const tower = site('tower')
const { inner, outer, height } = OBSERVATION_TOWER
export const towerRampStartY = heightAt(tower.x, tower.z) + .12 * 40 / height
export const towerRampRadius = (inner + outer) / 2
const approachLength = 2

function entryHeight(x: number, z: number) {
  const t = Math.max(0, Math.min(1, 1 - (z - tower.z) / approachLength))
  const y = groundSurfaceHeight(x, z)
  return y + (towerRampStartY - y) * t
}

export function createTowerEntrance() {
  const positions: number[] = [], indices: number[] = []
  const rows = 8, columns = 6
  for (let row = 0; row <= rows; row++) {
    const z = tower.z + approachLength * row / rows
    for (let column = 0; column <= columns; column++) {
      const x = tower.x - outer + (outer - inner) * column / columns
      positions.push(x, entryHeight(x, z), z)
      if (row && column) {
        const i = positions.length / 3 - 1
        indices.push(i - columns - 2, i - 1, i - columns - 1, i - columns - 1, i - 1, i)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
