import RAPIER from '@dimforge/rapier3d-compat'
import { ParkMotion } from './parkMotion'
import { WORLD, WORLD_COLLIDERS, MOVEMENT, SWIMMING, LAKE, PARK_PAVILIONS, PAVILION,
  OBSERVATION_TOWER, STEPPING_STONES as legacySteppingStones, groundHeight, lakeRadiusAt, createTerrainMesh, isTowerSurface as legacyIsTowerSurface,
  createPavilionStairs, createTowerRamp, createTowerDeck, createTowerRailCollision,
  mergeCollisionMeshes, boxesToCollisionMesh, pavilionFenceBounds, staticStructureBatch,
} from '../park/mapConfig'
import { GENERATED_PARK_ENABLED, JUMPMAP_ENABLED } from '../park/mapSelection'
import { renewalMap } from '../park/renewalMap'
import { PARK_DATA } from '../map/park'
import { addGeneratedPredictionColliders } from './predictionMap'
import { furnitureLandingPosition,furnitureAllowsSupport } from './furnitureLanding'
import { fountainExclusionPosition } from './fountainExclusion'
import type { MovementIntent } from './movementInput'
import type { Pose } from './worldClient'
import type { PredictionSimulation } from './localMovementPrediction'
import { COURSE, COURSE_COLLIDERS, renewalCourse } from '../features/jumpmap/activeCourse'
import { renewalPadPose, renewalPadShown, syncRenewalMotion } from '../features/jumpmap/renewalMotion'
import { useJumpmap } from '../features/jumpmap/state'
import { JumpGrace, type JumpGraceSnapshot } from '../features/jumpmap/jumpGrace'

let initialization: Promise<void> | undefined
/** How long Rapier may keep a grounded state the server does not support before falling. */
const EDGE_GLIDE_SECONDS = .15
const sharedPhysics = renewalMap?.data.physics ?? (GENERATED_PARK_ENABLED ? PARK_DATA.physics : null)
export async function createPredictionPhysics(profile?: 'PARK_V1'): Promise<PredictionSimulation> {
  await (initialization ??= RAPIER.init())
  return new PredictionPhysics(profile === 'PARK_V1')
}

/** Display simulation only. The Java server owns every gameplay position and collision decision. */
class PredictionPhysics implements PredictionSimulation {
  private chairCounts:ReadonlyMap<string,number>=new Map()
  private readonly furniture=sharedPhysics?.boxes.filter(b=>/^table-\d+-(top|chair-[0-3])$/.test(b.id)) ?? []
  private readonly world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  private readonly body
  private readonly collider
  private readonly controller
  private readonly chairs: { anchor: string; number: number; collider: RAPIER.Collider }[] = []
  private readonly stairSurfaces = WORLD_COLLIDERS.filter(box => /^P\d+-step-/.test(box.id)).map(box => ({
    center:box.center, half:box.movementHalf ?? box.half,
    top:box.center[1]+box.half[1], c:Math.cos(box.movementYaw ?? 0), s:Math.sin(box.movementYaw ?? 0),
  }))
  private stairTop(x:number,z:number) {
    let top=-Infinity
    for(const box of this.stairSurfaces){const dx=x-box.center[0],dz=z-box.center[2]
      if(Math.abs(dx*box.c-dz*box.s)<=box.half[0]+.000001 && Math.abs(dx*box.s+dz*box.c)<=box.half[2]+.000001)top=Math.max(top,box.top)
    }
    return top
  }
  private followTarget: {x:number;z:number} | undefined
  private surfaceFlags = {moving:false,running:false}
  private vy = 0
  private launchedJump = false
  private grounded = false
  private yaw = Math.PI
  private climbY = 0
  private readonly parkMotion = new ParkMotion()
  private tunedActive = false
  private jumpEnabled = false
  private readonly jumpGrace = new JumpGrace()
  /** jumpSupported() at the last tuned landing, reused as the next step's jump support. */
  private serverSupport?: boolean
  private edgeGlide = 0
  private readonly jumpColliders: RAPIER.Collider[] = []
  private syncJumpCourse() {
    const enabled = JUMPMAP_ENABLED && useJumpmap.getState().available
    if (!renewalCourse && enabled === this.jumpEnabled) return
    this.jumpEnabled = enabled
    if (enabled && !this.jumpColliders.length) for (const b of COURSE_COLLIDERS) {
      const desc = b.shape === 'cylinder' ? RAPIER.ColliderDesc.cylinder(b.half[1]!, b.radius!) : RAPIER.ColliderDesc.cuboid(b.half[0]!, b.half[1]!, b.half[2]!)
      this.jumpColliders.push(this.world.createCollider(desc.setTranslation(b.center[0]!, b.center[1]!, b.center[2]!)
        .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) })))
    }
    const now = renewalCourse ? syncRenewalMotion() : 0
    for (const [block, collider] of this.jumpColliders.entries()) {
      const pad = COURSE[block]!, b = COURSE_COLLIDERS[block]!
      const pose = renewalCourse ? renewalPadPose(pad, now) : undefined
      const solid = enabled && (!pose || renewalPadShown(block) && pose.solid)
      if (collider.isEnabled() !== solid) collider.setEnabled(solid)
      if (solid && pose) {
        const y = b.center[1]! + pose.offset
        if (Math.abs(collider.translation().y - y) > .00001) collider.setTranslation({ x: pad.x, y, z: pad.z })
      }
    }
  }
  constructor(private tuned: boolean) {
    if (sharedPhysics) {
      this.chairs.push(...addGeneratedPredictionColliders(this.world, sharedPhysics))
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
  setFollowTarget(target: {x:number;z:number} | undefined) { this.followTarget = target }
  stopHorizontal() { this.parkMotion.stopHorizontal(); this.surfaceFlags={moving:false,running:false} }
  private limitFollow(wanted:{x:number;z:number}, p:{x:number;z:number}) {
    if (!this.followTarget) return
    const distance=Math.hypot(this.followTarget.x-p.x,this.followTarget.z-p.z)
    const allowance=Math.max(0,distance-2.2),length=Math.hypot(wanted.x,wanted.z)
    if(length>allowance&&length>0){wanted.x*=allowance/length;wanted.z*=allowance/length}
    if(allowance<.00001)this.parkMotion.stopHorizontal()
  }
  setMotionProfile(profile: 'PARK_V1' | undefined) { this.tuned = profile === 'PARK_V1' }
  reset(pose: Pose, velocityY: number, grounded: boolean, grace?: JumpGraceSnapshot) {
    this.syncJumpCourse()
    this.body.setTranslation(pose, true)
    this.body.setNextKinematicTranslation(pose)
    this.vy = velocityY; this.grounded = grounded; this.yaw = pose.yaw; this.climbY = 0
    this.jumpGrace.reset(grounded, grace)
    this.parkMotion.reset(velocityY); this.tunedActive = false
    this.serverSupport = undefined; this.edgeGlide = 0
    this.world.step()
  }
  setChairs(counts: ReadonlyMap<string, number>) {
    this.chairCounts=counts
    for (const chair of this.chairs) chair.collider.setEnabled(chair.number <= (counts.get(chair.anchor) ?? 2))
  }
  step(input: MovementIntent, dt: number) {
    this.launchedJump = false
    this.syncJumpCourse()
    const p = this.body.translation()
    const swimming = lakeRadiusAt(p.x, p.z) < 1
      && LAKE.surfaceY - groundHeight(p.x, p.z) > SWIMMING.depthThreshold && p.y < LAKE.surfaceY + 0.4
    // The generated lake bank rises slightly above Rapier's default 45 degrees.
    // Limit this allowance to the actual lake bank; ordinary stairs/walls keep their limit.
    const lakeBank = this.tuned && sharedPhysics && lakeRadiusAt(p.x,p.z)<1 && groundHeight(p.x,p.z)<LAKE.surfaceY
    this.controller.setMaxSlopeClimbAngle(lakeBank ? Math.atan(LAKE.depth/(Math.min(LAKE.radiusX,LAKE.radiusZ)*.14))+.03 : Math.PI/4)
    const speed = swimming ? input.run ? SWIMMING.fastSpeed : SWIMMING.speed
      : input.run ? MOVEMENT.runSpeed : MOVEMENT.walkSpeed
    if (this.tuned && !swimming && !this.climbY) {
      if (!this.tunedActive) this.parkMotion.reset(this.vy)
      // Rapier can report grounded with no contact beside a thin fence's top edge.
      // Gliding there is fine, but the server rejects a jump without its own support.
      const support = this.grounded && (this.serverSupport ?? this.jumpSupported(p))
      const jump = this.jumpEnabled ? this.jumpGrace.step(input.jump, support, dt) : input.jump && support
      this.launchedJump = jump
      this.tunedActive = true; this.stepTuned({ ...input, jump }, dt, jump); return
    }
    this.tunedActive = false; this.serverSupport = undefined
    if (input.jump && swimming && (input.dx || input.dz)) {
      const stone = (sharedPhysics?.steppingStones ?? legacySteppingStones).find(s => Math.hypot(Math.max(0, Math.abs(p.x - s.x) - s.width / 2),
        Math.max(0, Math.abs(p.z - s.z) - s.depth / 2)) <= .8
        && (s.x - p.x) * input.dx + (s.z - p.z) * input.dz > .02)
      if (stone) this.climbY = stone.top + MOVEMENT.halfHeight + MOVEMENT.radius + .16
    }
    const jump = this.jumpEnabled ? this.jumpGrace.step(input.jump, this.grounded && !swimming, dt) : input.jump && this.grounded
    if (jump && !swimming) {
      this.launchedJump = true
      const footY=p.y-MOVEMENT.halfHeight-MOVEMENT.radius-MOVEMENT.offset
      const onPavilion=this.onPavilion(p)
      this.vy = onPavilion && sharedPhysics ? sharedPhysics.pavilionJumpSpeed : predictionTowerSurface(p.x, footY, p.z)
        ? OBSERVATION_TOWER.jumpSpeed : MOVEMENT.jumpSpeed
      this.grounded = false
    }
    if (p.y >= this.climbY) this.climbY = 0
    this.vy = this.climbY ? 5.5 : swimming
      ? Math.max(-2, Math.min(2, (LAKE.surfaceY + SWIMMING.floatOffset - p.y) * 5))
      : Math.max(MOVEMENT.maxFallSpeed,
        this.vy + (MOVEMENT.gravity) * dt)
    const wanted = {x:input.dx*speed*dt,y:this.vy*dt,z:input.dz*speed*dt}
    this.limitFollow(wanted,p)
    this.controller.computeColliderMovement(this.collider, wanted)
    const delta = this.controller.computedMovement()
    this.surfaceFlags={moving:Math.hypot(delta.x,delta.z)>dt*.12,running:input.run&&Math.hypot(delta.x,delta.z)>dt*.12}
    if (this.vy > 0 && delta.y + .0001 < this.vy * dt) this.vy = 0
    const limit = WORLD.halfSize - WORLD.boundaryHalfDepth - MOVEMENT.radius - MOVEMENT.offset
    const proposed={ x: Math.max(-limit, Math.min(limit, p.x + delta.x)),y:p.y+delta.y,z:Math.max(-limit, Math.min(limit, p.z + delta.z)) }
    const landing=this.preventClimbing(proposed)
    this.body.setNextKinematicTranslation(landing)
    this.grounded = this.controller.computedGrounded()&&Math.abs(landing.x-proposed.x)<1e-6&&Math.abs(landing.z-proposed.z)<1e-6&&this.supportAllowed(landing)
    if (this.grounded && this.vy < 0) this.vy = 0
    if (input.dx || input.dz) this.yaw = Math.atan2(input.dx, input.dz)
    this.world.timestep = dt
    this.world.step()
  }
  private stepTuned(input: MovementIntent, dt: number, launch: boolean) {
    const p=this.body.translation(),jumpSpeed=this.onPavilion(p)?sharedPhysics?.pavilionTunedJumpSpeed:undefined
    const wanted=this.parkMotion.advance(input,dt,this.grounded||launch,jumpSpeed)
    this.limitFollow(wanted,p)
    // Finish a known stair rise before its centre crosses the tread. Rounded
    // capsule corner contact can otherwise report an interpenetrating mid-step.
    const foot=p.y-MOVEMENT.halfHeight-MOVEMENT.radius
    let stairLift=false
    if(this.grounded&&!input.jump&&wanted.velocityY<=0&&(wanted.x||wanted.z)){
      const top=this.stairTop(p.x+wanted.x,p.z+wanted.z),lift=top+MOVEMENT.offset-foot
      if(Number.isFinite(top)&&top-foot<=MOVEMENT.stepHeight+.0001&&lift>0&&lift<=MOVEMENT.stepHeight+MOVEMENT.offset+.0001){
        wanted.y=Math.max(wanted.y,lift);stairLift=true
      }
    }
    this.controller.computeColliderMovement(this.collider,wanted)
    const delta=this.controller.computedMovement()
    // Rapier can retain floor contact for a sub-skin upward step.
    // A newly launched jump must not become a grounded step and lose its velocity.
    const top=this.stairTop(p.x+delta.x,p.z+delta.z),afterFoot=p.y+delta.y-MOVEMENT.halfHeight-MOVEMENT.radius
    const onStair=stairLift&&Number.isFinite(top)&&afterFoot>=top-.0001&&afterFoot<=top+MOVEMENT.offset+.002
    this.grounded=wanted.velocityY<=0&&(this.controller.computedGrounded()||onStair)
    const limit=WORLD.halfSize-WORLD.boundaryHalfDepth-MOVEMENT.radius-MOVEMENT.offset
    const proposed={x:Math.max(-limit,Math.min(limit,p.x+delta.x)),y:p.y+delta.y,z:Math.max(-limit,Math.min(limit,p.z+delta.z))}
    const landing=this.preventClimbing(proposed)
    if(Math.abs(landing.x-proposed.x)>1e-6||Math.abs(landing.z-proposed.z)>1e-6)this.grounded=false
    if(this.grounded&&!this.supportAllowed(landing))this.grounded=false
    const walls: {x:number;z:number}[]=[]
    const floorNormalY=Math.cos(this.controller.maxSlopeClimbAngle())
    let walkableContact=false
    for(let i=0;i<this.controller.numComputedCollisions();i++){
      const collision=this.controller.computedCollision(i)
      if(collision&&collision.normal1.y>=.6)walkableContact=true
      if(collision&&collision.normal1.y<floorNormalY)walls.push({x:collision.normal1.x,z:collision.normal1.z})
    }
    // computedGrounded can be true while the rounded capsule only touches a
    // near-vertical fence corner. A side contact is not a floor or a new jump.
    // Keep genuine floor support when a wall contact hides it in the controller's list.
    if(this.grounded&&walls.length&&!walkableContact&&!onStair){
      const feet=landing.y-MOVEMENT.halfHeight-MOVEMENT.radius
      const floor=this.world.castRayAndGetNormal(new RAPIER.Ray({x:landing.x,y:feet+.05,z:landing.z},{x:0,y:-1,z:0}),.22,true,undefined,undefined,this.collider)
      this.grounded=!!floor&&floor.normal.y>=.6
    }
    // Beside a thin fence's top edge Rapier also reports grounded with no contact at all, or
    // resting on its rounded corner (normal y ~.61), where the server sees no support. Standing
    // there hangs the capsule in the air and running along the edge glides on it, both ending
    // in a server HOVER correction. Fall at once without input; a rail hop only grazes the corner.
    const supported=this.grounded&&this.jumpSupported(landing)
    if(this.grounded&&!supported&&!onStair){
      this.edgeGlide+=dt
      if(!input.dx&&!input.dz&&!walls.length&&!walkableContact||this.edgeGlide>EDGE_GLIDE_SECONDS)this.grounded=false
    }else if(supported)this.edgeGlide=0
    this.serverSupport=supported
    this.parkMotion.contact(wanted,delta,this.grounded,walls);this.vy=this.parkMotion.velocityY()
    this.body.setNextKinematicTranslation(landing)
    if(input.dx||input.dz)this.yaw=Math.atan2(input.dx,input.dz)
    this.world.timestep=dt;this.world.step()
  }
  private preventClimbing(pose:{x:number;y:number;z:number}) {
    if(!sharedPhysics)return pose
    const footOffset=MOVEMENT.halfHeight+MOVEMENT.radius+MOVEMENT.offset
    const landing=furnitureLandingPosition(pose,this.furniture,footOffset,MOVEMENT.radius,this.chairCounts)
    return fountainExclusionPosition(landing,sharedPhysics.fountainPolicy,footOffset,MOVEMENT.radius)
  }
  /** Mirrors the server's PositionCollision.supported(): the capsule swept 0.17m down onto a walkable face. */
  private jumpSupported(pose:{x:number;y:number;z:number}) {
    const hit=this.world.castShape(pose,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},this.collider.shape,0,.17,false,undefined,undefined,this.collider)
    return !!hit&&hit.normal1.y>.6
  }
  private supportAllowed(pose:{x:number;y:number;z:number}) {
    return !sharedPhysics||furnitureAllowsSupport(pose,this.furniture,MOVEMENT.halfHeight+MOVEMENT.radius+MOVEMENT.offset,MOVEMENT.radius,this.chairCounts)
  }
  private onPavilion(pose:{x:number;y:number;z:number}) {
    const foot=pose.y-MOVEMENT.halfHeight-MOVEMENT.radius-MOVEMENT.offset
    return !!sharedPhysics && PARK_PAVILIONS.some(site => {
      const onBench = 'spectatorBenchTop' in site && typeof site.spectatorBenchTop === 'number'
        && Math.abs(foot - site.spectatorBenchTop) < .15
      return (Math.abs(foot - site.floor) < .15 || onBench)
        && Math.hypot(pose.x - site.x, pose.z - site.z) < 4.5 * site.scale + .3
    })
  }
  movementFlags() { return this.tunedActive ? this.parkMotion.flags() : this.surfaceFlags }
  /** Airborne, swimming and water-exit climbing retain their physical animation flags. */
  groundedForLocomotion() { return this.tunedActive && this.grounded }
  stepJumped() { return this.launchedJump }
  stepSupported() { return this.serverSupport ?? this.grounded }
  pose(): Pose { return { ...this.body.translation(), yaw: this.yaw } }
  dispose() { this.world.free() }
}

/** The legacy helper closes over legacy coordinates; generated towers use the exported surface contract. */
function predictionTowerSurface(x: number, footY: number, z: number) {
  if (!sharedPhysics) return legacyIsTowerSurface(x, footY, z)
  const t = sharedPhysics.tower, radius = Math.hypot(x - t.x, z - t.z)
  if (radius > t.outer + .08) return false
  if (Math.abs(footY - t.topY) < .25) return true
  if (radius < t.inner - .08) return false
  const angle = (Math.atan2(z - t.z, x - t.x) + Math.PI * 2) % (Math.PI * 2)
  const rise = t.height / t.turns, base = t.surfaceOffset + angle / (Math.PI * 2) * rise
  const turn = Math.round((footY - base) / rise)
  return turn >= 0 && turn < t.turns && Math.abs(footY - base - turn * rise) < .25
}
