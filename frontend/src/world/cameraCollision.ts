import { groundHeight } from '../park/mapConfig'

/** Terrain floor at the rendered orbit position. Scenery still fades without changing zoom. */
export function constrainRoamingCamera(
  position: { x: number; y: number; z: number },
  heightAt: (x: number, z: number) => number = groundHeight,
) {
  position.y = Math.max(position.y, heightAt(position.x, position.z) + 0.3)
}
