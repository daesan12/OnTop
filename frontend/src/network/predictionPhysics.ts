import RAPIER from '@dimforge/rapier3d-compat'
import { WORLD, WORLD_COLLIDERS, MOVEMENT, SWIMMING, LAKE, PARK_PAVILIONS, PAVILION,
  OBSERVATION_TOWER, STEPPING_STONES as legacySteppingStones, groundHeight, lakeRadiusAt, createTerrainMesh, isTowerSurface as legacyIsTowerSurface,
  createPavilionStairs, createTowerRamp, createTowerDeck, createTowerRailCollision,
  mergeCollisionMeshes, boxesToCollisionMesh, pavilionFenceBounds, staticStructureBatch,
} from '../park/mapConfig'
import { GENERATED_PARK_ENABLED } from '../park/mapSelection'
import { PARK_DATA } from '../map/park'
import { addGeneratedPredictionColliders } from './predictionMap'
import { furnitureLandingPosition } from './furnitureLanding'
import { fountainExclusionPosition } from './fountainExclusion'
import type { MovementIntent } from './movementInput'
import type { Pose } from './worldClient'
import type { PredictionSimulation } from './localMovementPrediction'
import { COURSE_COLLIDERS } from '../features/jumpmap/course'
import { useJumpmap } from '../features/jumpmap/state'
import { JumpGrace, type JumpGraceSnapshot } from '../features/jumpmap/jumpGrace'

let initialization: Promise<void> | undefined
export async function createPredictionPhysics(): Promise<PredictionSimulation> {
  await (initialization ??= RAPIER.init())
  return new PredictionPhysics()
}

/** Display simulation only. The Java server owns every gameplay position and collision decision. */
class PredictionPhysics implements PredictionSimulation {
  private chairCounts:ReadonlyMap<string,number>=new Map()
  private readonly furniture=PARK_DATA.physics.boxes.filter(b=>/^table-\d+-(top|chair-[0-3])$/.test(b.id))
  private readonly world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  private readonly body
  private readonly collider
  private readonly controller
  private readonly chairs: { anchor: string; number: number; collider: RAPIER.Collider }[] = []
  private vy = 0
  private grounded = false
  private yaw = Math.PI
  private climbY = 0
  private jumpEnabled = false
  private readonly jumpGrace = new JumpGrace()
  private readonly jumpColliders: RAPIER.Collider[] = []
  private syncJumpCourse() {
    const enabled = GENERATED_PARK_ENABLED && useJumpmap.getState().available
    if (enabled === this.jumpEnabled) return
    this.jumpEnabled = enabled
    if (enabled && !this.jumpColliders.length) for (const b of COURSE_COLLIDERS) {
      const desc = b.shape === 'cylinder' ? RAPIER.ColliderDesc.cylinder(b.half[1]!, b.radius!) : RAPIER.ColliderDesc.cuboid(b.half[0]!, b.half[1]!, b.half[2]!)
      this.jumpColliders.push(this.world.createCollider(desc.setTranslation(b.center[0]!, b.center[1]!, b.center[2]!)))
    }
    for (const collider of this.jumpColliders) collider.setEnabled(enabled)
  }
  constructor() {
    if (GENERATED_PARK_ENABLED) {
      this.chairs.push(...addGeneratedPredictionColliders(this.world))
    } else {
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
    }
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(MOVEMENT.halfHeight, MOVEMENT.radius), this.body)
    this.controller = this.world.createCharacterController(MOVEMENT.offset)
    this.controller.enableSnapToGround(0.15)
    this.controller.enableAutostep(MOVEMENT.stepHeight, 0.15, false)
    this.world.timestep = 1 / 60
    this.world.step()
  }
  reset(pose: Pose, velocityY: number, grounded: boolean, grace?: JumpGraceSnapshot) {
    this.syncJumpCourse()
    this.body.setTranslation(pose, true)
    this.body.setNextKinematicTranslation(pose)
    this.vy = velocityY; this.grounded = grounded; this.yaw = pose.yaw; this.climbY = 0
    this.jumpGrace.reset(grounded, grace)
    this.world.step()
  }
  setChairs(counts: ReadonlyMap<string, number>) {
    this.chairCounts=counts
    for (const chair of this.chairs) chair.collider.setEnabled(chair.number <= (counts.get(chair.anchor) ?? 2))
  }
  step(input: MovementIntent, dt: number) {
    this.syncJumpCourse()
    const p = this.body.translation()
    const swimming = lakeRadiusAt(p.x, p.z) < 1
      && LAKE.surfaceY - groundHeight(p.x, p.z) > SWIMMING.depthThreshold && p.y < LAKE.surfaceY + 0.4
    const speed = swimming ? input.run ? SWIMMING.fastSpeed : SWIMMING.speed
      : input.run ? MOVEMENT.runSpeed : MOVEMENT.walkSpeed
    if (input.jump && swimming && (input.dx || input.dz)) {
      const stone = (GENERATED_PARK_ENABLED ? PARK_DATA.physics.steppingStones : legacySteppingStones).find(s => Math.hypot(Math.max(0, Math.abs(p.x - s.x) - s.width / 2),
        Math.max(0, Math.abs(p.z - s.z) - s.depth / 2)) <= .8
        && (s.x - p.x) * input.dx + (s.z - p.z) * input.dz > .02)
      if (stone) this.climbY = stone.top + MOVEMENT.halfHeight + MOVEMENT.radius + .16
    }
    const jump = this.jumpEnabled ? this.jumpGrace.step(input.jump, this.grounded && !swimming, dt) : input.jump && this.grounded
    if (jump && !swimming) {
      const footY=p.y-MOVEMENT.halfHeight-MOVEMENT.radius-MOVEMENT.offset
      const onPavilion=GENERATED_PARK_ENABLED&&PARK_PAVILIONS.some(site=>Math.abs(footY-site.floor)<.15&&Math.hypot(p.x-site.x,p.z-site.z)<4.5*site.scale+.3)
      this.vy = onPavilion ? PARK_DATA.physics.pavilionJumpSpeed : predictionTowerSurface(p.x, footY, p.z)
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
    if (this.vy > 0 && delta.y + .0001 < this.vy * dt) this.vy = 0
    const limit = WORLD.halfSize - WORLD.boundaryHalfDepth - MOVEMENT.radius - MOVEMENT.offset
    const proposed={ x: Math.max(-limit, Math.min(limit, p.x + delta.x)),y:p.y+delta.y,z:Math.max(-limit, Math.min(limit, p.z + delta.z)) }
    const furnitureLanding=GENERATED_PARK_ENABLED&&this.controller.computedGrounded()
      ?furnitureLandingPosition(proposed,this.furniture,MOVEMENT.halfHeight+MOVEMENT.radius+MOVEMENT.offset,MOVEMENT.radius,this.chairCounts):proposed
    const landing=GENERATED_PARK_ENABLED?fountainExclusionPosition(furnitureLanding,PARK_DATA.physics.fountainPolicy,MOVEMENT.halfHeight+MOVEMENT.radius+MOVEMENT.offset,MOVEMENT.radius):furnitureLanding
    this.body.setNextKinematicTranslation(landing)
    this.grounded = this.controller.computedGrounded()&&Math.abs(landing.x-proposed.x)<1e-6&&Math.abs(landing.z-proposed.z)<1e-6
    if (this.grounded && this.vy < 0) this.vy = 0
    if (input.dx || input.dz) this.yaw = Math.atan2(input.dx, input.dz)
    this.world.timestep = dt
    this.world.step()
  }
  pose(): Pose { return { ...this.body.translation(), yaw: this.yaw } }
  dispose() { this.world.free() }
}

/** The legacy helper closes over legacy coordinates; generated towers use the exported surface contract. */
function predictionTowerSurface(x: number, footY: number, z: number) {
  if (!GENERATED_PARK_ENABLED) return legacyIsTowerSurface(x, footY, z)
  const t = PARK_DATA.physics.tower, radius = Math.hypot(x - t.x, z - t.z)
  if (radius > t.outer + .08) return false
  if (Math.abs(footY - t.topY) < .25) return true
  if (radius < t.inner - .08) return false
  const angle = (Math.atan2(z - t.z, x - t.x) + Math.PI * 2) % (Math.PI * 2)
  const rise = t.height / t.turns, base = t.surfaceOffset + angle / (Math.PI * 2) * rise
  const turn = Math.round((footY - base) / rise)
  return turn >= 0 && turn < t.turns && Math.abs(footY - base - turn * rise) < .25
}
