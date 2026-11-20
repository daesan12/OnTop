import { Matrix4, Quaternion, Vector3, type Camera } from 'three'

/** Keep position and rotation continuous at boarding, turns, and the return to roaming. */
export class SleighCamera {
  active = false
  private returning = -1
  private boarding = 0
  private fromPosition = new Vector3()
  private fromRotation = new Quaternion()
  private position = new Vector3()
  private rotation = new Quaternion()
  private desired = new Vector3()
  private target = new Vector3()
  private up = new Vector3(0, 1, 0)
  private matrix = new Matrix4()
  private targetRotation = new Quaternion()
  follow(camera: Camera, pose: { x: number; y: number; z: number; yaw: number }, delta: number) {
    const entering = !this.active
    if (entering) {
      this.fromPosition.copy(camera.position); this.fromRotation.copy(camera.quaternion); this.boarding = 0
    }
    this.active = true; this.returning = -1
    const radius = Math.max(1, Math.hypot(pose.x, pose.z)), ox = pose.x / radius, oz = pose.z / radius
    this.desired.set(pose.x + ox * 11 - Math.sin(pose.yaw) * 7, pose.y + 9,
      pose.z + oz * 11 - Math.cos(pose.yaw) * 7)
    this.target.set(pose.x - ox * 12 + Math.sin(pose.yaw) * 7, pose.y - 8,
      pose.z - oz * 12 + Math.cos(pose.yaw) * 7)
    this.matrix.lookAt(this.desired, this.target, this.up)
    this.targetRotation.setFromRotationMatrix(this.matrix)
    if (entering) { this.position.copy(this.desired); this.rotation.copy(this.targetRotation) }
    const step = Math.min(delta, .05), blend = 1 - Math.exp(-6 * step)
    this.position.lerp(this.desired, blend); this.rotation.slerp(this.targetRotation, blend)
    if (!entering) this.boarding = Math.min(.9, this.boarding + step)
    const t = this.boarding / .9, eased = t * t * (3 - 2 * t)
    camera.position.lerpVectors(this.fromPosition, this.position, eased)
    camera.quaternion.slerpQuaternions(this.fromRotation, this.rotation, eased)
  }
  leave(camera: Camera) {
    if (!this.active) return false
    this.active = false; this.returning = 0
    this.fromPosition.copy(camera.position); this.fromRotation.copy(camera.quaternion)
    return true
  }
  returnToPark(camera: Camera, desired: Vector3, look: Vector3, delta: number) {
    if (this.returning < 0) return
    this.returning = Math.min(1.4, this.returning + Math.min(delta, .05))
    const t = this.returning / 1.4, blend = t * t * (3 - 2 * t)
    this.matrix.lookAt(desired, look, this.up)
    this.targetRotation.setFromRotationMatrix(this.matrix)
    camera.position.lerpVectors(this.fromPosition, desired, blend)
    camera.quaternion.slerpQuaternions(this.fromRotation, this.targetRotation, blend)
    if (this.returning >= 1.4) this.returning = -1
  }
}
