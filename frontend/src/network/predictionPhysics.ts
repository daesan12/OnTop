import RAPIER from '@dimforge/rapier3d-compat'
import { WORLD, WORLD_COLLIDERS, MOVEMENT, SWIMMING, LAKE, PARK_PAVILIONS, PAVILION,
  OBSERVATION_TOWER, STEPPING_STONES, groundHeight, lakeRadiusAt, createTerrainMesh, isTowerSurface,
  createPavilionStairs, createTowerRamp, createTowerDeck, createTowerRailCollision,
  mergeCollisionMeshes, boxesToCollisionMesh, pavilionFenceBounds, staticStructureBatch,
} from '../config'
import type { MovementIntent } from './movementInput'
import type { Pose } from './worldClient'
import type { PredictionSimulation } from './localMovementPrediction'

let initialization: Promise<void> | undefined
export async function createPredictionPhysics(): Promise<PredictionSimulation> {
  await (initialization ??= RAPIER.init())
  return new PredictionPhysics()
}

/** Display simulation only. The Java server owns every gameplay position and collision decision. */
class PredictionPhysics implements PredictionSimulation {
  private readonly world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  private readonly body
  private readonly collider
  private readonly controller
  private readonly chairs: { anchor: string; number: number; collider: RAPIER.Collider }[] = []
  private vy = 0
  private grounded = false
  private yaw = Math.PI
  private climbY = 0
  private obstructed = false
  constructor() {
    for (const box of WORLD_COLLIDERS.filter(b => !staticStructureBatch(b.id))) {
      const half = box.movementHalf ?? box.half
      const halfY = box.movementHeight === undefined ? half[1] : box.movementHeight / 2
      const yaw = box.movementYaw ?? 0
      const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(half[0], halfY, half[2])
        .setTranslation(box.center[0], box.center[1] - box.half[1] + halfY, box.center[2])
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }))
      const chair = /(.+)-chair-([0-3])$/.exec(box.id)
      if (chair) {
        const number = Number(chair[2]) + 1
        collider.setEnabled(number <= 2)
        this.chairs.push({ anchor: chair[1]!, number, collider })
      }
    }
    for (const mesh of [createTerrainMesh(), createPavilionStairs(),
      mergeCollisionMeshes([createTowerRamp(), createTowerDeck(), createTowerRailCollision()]),
      boxesToCollisionMesh(pavilionFenceBounds())]) {
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices))
    }
    for (const p of PARK_PAVILIONS) {
      const vertices: number[] = []
      for (const y of [p.ground, p.floor]) for (let i = 0; i < 8; i++) {
        const angle = Math.PI / 8 + i * Math.PI / 4
        vertices.push(p.x + Math.cos(angle) * PAVILION.radius * p.scale, y,
          p.z + Math.sin(angle) * PAVILION.radius * p.scale)
      }
      const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices))
      if (!hull) throw new Error('예측 충돌 지형을 구성할 수 없습니다.')
      this.world.createCollider(hull)
    }
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(MOVEMENT.halfHeight, MOVEMENT.radius), this.body)
    this.controller = this.world.createCharacterController(MOVEMENT.offset)
    this.controller.enableSnapToGround(0.15)
    this.controller.enableAutostep(MOVEMENT.stepHeight, 0.15, false)
    this.world.timestep = 1 / 60
    this.world.step()
  }
  reset(pose: Pose, velocityY: number, grounded: boolean) {
    this.body.setTranslation(pose, true)
    this.body.setNextKinematicTranslation(pose)
    this.vy = velocityY; this.grounded = grounded; this.yaw = pose.yaw; this.climbY = 0; this.obstructed = false
    this.world.step()
  }
  setChairs(counts: ReadonlyMap<string, number>) {
    for (const chair of this.chairs) chair.collider.setEnabled(chair.number <= (counts.get(chair.anchor) ?? 2))
  }
  step(input: MovementIntent, dt: number) {
    const p = this.body.translation()
    const swimming = lakeRadiusAt(p.x, p.z) < 1
      && LAKE.surfaceY - groundHeight(p.x, p.z) > SWIMMING.depthThreshold && p.y < LAKE.surfaceY + 0.4
    const speed = swimming ? input.run ? SWIMMING.fastSpeed : SWIMMING.speed
      : input.run ? MOVEMENT.runSpeed : MOVEMENT.walkSpeed
    if (input.jump && swimming && (input.dx || input.dz)) {
      const stone = STEPPING_STONES.find(s => Math.hypot(Math.max(0, Math.abs(p.x - s.x) - s.width / 2),
        Math.max(0, Math.abs(p.z - s.z) - s.depth / 2)) <= .8
        && (s.x - p.x) * input.dx + (s.z - p.z) * input.dz > .02)
      if (stone) this.climbY = stone.top + MOVEMENT.halfHeight + MOVEMENT.radius + .16
    }
    if (input.jump && this.grounded && !swimming) {
      this.vy = isTowerSurface(p.x, p.y - MOVEMENT.halfHeight - MOVEMENT.radius - MOVEMENT.offset, p.z)
        ? OBSERVATION_TOWER.jumpSpeed : MOVEMENT.jumpSpeed
      this.grounded = false
    }
    if (p.y >= this.climbY) this.climbY = 0
    this.vy = this.climbY ? 5.5 : swimming
      ? Math.max(-2, Math.min(2, (LAKE.surfaceY + SWIMMING.floatOffset - p.y) * 5))
      : Math.max(MOVEMENT.maxFallSpeed, this.vy + MOVEMENT.gravity * dt)
    this.controller.computeColliderMovement(this.collider, {
      x: input.dx * speed * dt, y: this.vy * dt, z: input.dz * speed * dt,
    })
    const delta = this.controller.computedMovement()
    this.obstructed ||= Math.hypot(delta.x - input.dx * speed * dt, delta.z - input.dz * speed * dt) > .005
    const limit = WORLD.halfSize - WORLD.boundaryHalfDepth - MOVEMENT.radius - MOVEMENT.offset
    this.body.setNextKinematicTranslation({ x: Math.max(-limit, Math.min(limit, p.x + delta.x)),
      y: p.y + delta.y, z: Math.max(-limit, Math.min(limit, p.z + delta.z)) })
    this.grounded = this.controller.computedGrounded()
    if (this.grounded && this.vy < 0) this.vy = 0
    if (input.dx || input.dz) this.yaw = Math.atan2(input.dx, input.dz)
    this.world.timestep = dt
    this.world.step()
  }
  pose(): Pose { return { ...this.body.translation(), yaw: this.yaw } }
  blocked() { return this.obstructed }
  dispose() { this.world.free() }
}
