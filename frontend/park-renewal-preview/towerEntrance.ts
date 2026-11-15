import { OBSERVATION_TOWER } from '../src/config'
import { heightAt, site } from './plan'

const tower = site('tower')
const { inner, outer, height } = OBSERVATION_TOWER
export const towerRampStartY = heightAt(tower.x, tower.z) + .12 * 40 / height
export const towerRampRadius = (inner + outer) / 2
const approachLength = 4.5

const ease = (t: number) => {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

export function gradeTowerEntrance(x: number, z: number, y: number) {
  const lateral = Math.max(tower.x-outer-x, x-tower.x+inner, 0)
  if (lateral >= 1.2 || z < tower.z - .7 || z >= tower.z + approachLength) return y
  const along = z >= tower.z ? 1 - ease((z-tower.z)/approachLength) : ease((z-tower.z+.7)/.7)
  // Keep the first wooden tread slightly above the last stone paving.
  return y + (towerRampStartY - .015 - y) * along * (1 - ease(lateral/1.2))
}
