import { Box3, Matrix4, Ray, Vector3 } from 'three'
import { renewalMap } from '../../park/renewalMap'

// Authored walls still block speech when the camera fader excludes a building.
const walls = renewalMap?.data.physics.boxes.flatMap(({ id, center, half, yaw }) => {
  if (!(id.startsWith('park-prop-') || id === 'duck-dock-booth') || half[1] < .9) return []
  const offset = new Vector3(...center)
  const worldToWall = new Matrix4().makeRotationY(yaw).setPosition(offset).invert()
  const size = new Vector3(...half)
  return [{ offset, radiusSquared: size.lengthSq(), worldToWall, bounds: new Box3(size.clone().negate(), size) }]
})
const worldRay = new Ray(), localRay = new Ray(), hit = new Vector3()

export function npcWallBlocksSpeech(origin: Vector3, target: Vector3) {
  if (!walls) return false
  const distance = worldRay.direction.subVectors(target, origin).length()
  if (distance <= .15) return false
  const limit = (distance - .1) ** 2
  worldRay.origin.copy(origin)
  worldRay.direction.multiplyScalar(1 / distance)
  for (const wall of walls) {
    if (worldRay.distanceSqToPoint(wall.offset) > wall.radiusSquared) continue
    localRay.copy(worldRay).applyMatrix4(wall.worldToWall)
    if (localRay.intersectBox(wall.bounds, hit) && hit.distanceToSquared(localRay.origin) < limit) return true
  }
  return false
}
