// Dev-server-only inspection helper. Never imported by production code or bundled with the app.
export function equipmentProbe() {
  const s = useSession.getState()
  return { approved: s.equipment, models: s.ids.map(id => {
    const avatar = root().scene.getObjectByName('avatar-' + id)
    return { id: avatar?.name, equipment: (avatar?.userData.equipment ?? []) as import('../../src/network/equipment').PublicEquipment[],
      assetsPending: avatar?.userData.equipmentAssetsPending }
  }) }
}
import { _roots } from '@react-three/fiber'
import {
  Box3,
  Mesh,
  Vector3,
  Texture,
  type BufferAttribute,
  type InterleavedBufferAttribute,
} from 'three'
import {
  environmentClock,
  environmentConfig,
} from '../../src/world/environmentState'
import { resetMetrics, summarizeFrames } from '../../src/performance/metrics'
import { useSession } from '../../src/network/worldClient'
import { viewControls } from '../../src/world/input'
import { setDisplayProfiles } from '../../src/network/profileBridge'
import { CHARACTER, GOMOKU } from '../../src/config'
import type { InstancedMesh } from 'three'
import { omokCamera } from '../../src/game/cameraState'
import { Matrix4 } from 'three'
import { useGame } from '../../src/game/store'
import { avatars, sampleAvatar, estimatedServerTime, type AvatarSnapshot } from '../../src/network/worldClient'
import { SkinnedMesh, ShaderMaterial } from 'three'
import { FITNESS_STATIONS } from '../../src/config'
import { ADVERTISEMENT_SCHEDULE } from '../../src/world/art/advertisementMedia'
import { groundHeight } from '../../src/config'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { useDiceUI, diceCamera } from '../../src/game/farkle/controls'
export const inspectTable = () => parkRuntime.inspectTable('table-1')
export const omokCameraReady = () => omokCamera.ready
export function pointForOmok(x: number, y: number) {
  const { scene, camera, gl } = root()
  const object = scene.getObjectByName(
    'omok-board-' + useSession.getState().focusedAnchorId,
  )!
  const point = object
    .localToWorld(
      new Vector3(
        (x / 14 - 0.5) * GOMOKU.boardSpan,
        0.019,
        (y / 14 - 0.5) * GOMOKU.boardSpan,
      ),
    )
    .project(camera)
  const box = gl.domElement.getBoundingClientRect()
  return {
    x: ((point.x + 1) * box.width) / 2,
    y: ((1 - point.y) * box.height) / 2,
  }
}
export function omokGeometry() {
  const { scene, gl } = root()
  const count: number[] = []
  scene.traverse((o) => {
    if (o.name.startsWith('omok-board-'))
      o.children.forEach((c) => {
        if ('isInstancedMesh' in c) count.push((c as InstancedMesh).count)
      })
  })
  return {
    counts: count,
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
  }
}
export function omokPresentationProbe() {
  const { scene, gl } = root()
  const board = scene.getObjectByName('omok-board-' + useSession.getState().focusedAnchorId)
  const hover = board?.getObjectByName('omok-hover'), last = board?.getObjectByName('omok-last-move')
  return { hover: !!hover?.visible, hoverPosition: hover?.position.toArray() ?? null,
    lastMove: last?.position.toArray() ?? null, cursor: gl.domElement.style.cursor }
}
// M10 visual QA: inspect render-only supplies without changing game or transport state.
export function omokArtProbe(visible?: boolean) {
  const { scene } = root()
  const board = scene.getObjectByName('omok-board-' + useSession.getState().focusedAnchorId)
  if (board && visible !== undefined) board.visible = visible
  const art = board?.getObjectByName('walnut-gomoku-assets')
  const bounds = art ? new Box3().setFromObject(art) : null
  const batches: { name: string; count: number; triangles: number }[] = []
  art?.traverse(o => {
    if (!('isInstancedMesh' in o)) return
    const m = o as InstancedMesh
    batches.push({ name: m.name, count: m.count, triangles: (m.geometry.index?.count ?? m.geometry.attributes.position!.count) / 3 })
  })
  return { present: !!art, batches, bounds: bounds ? [bounds.min.toArray(), bounds.max.toArray()] : null }
}
export function pointForOmokLocal(x: number, y: number, z: number) {
  const { scene, camera, gl } = root()
  const board = scene.getObjectByName('omok-board-' + useSession.getState().focusedAnchorId)!
  const p = board.localToWorld(new Vector3(x, y, z)).project(camera), box = gl.domElement.getBoundingClientRect()
  return { x: (p.x + 1) * box.width / 2, y: (1 - p.y) * box.height / 2 }
}
const omokResources = { instances: 0, shared: 0 }
export function watchOmokResources() {
  omokResources.instances = omokResources.shared = 0
  const { scene } = root(), geometries = new Set(), materials = new Set()
  scene.getObjectByName('omok-board-' + useSession.getState().focusedAnchorId)?.traverse(o => {
    if (!('isInstancedMesh' in o)) return
    const mesh = o as InstancedMesh
    mesh.addEventListener('dispose', () => omokResources.instances++)
    // Inlay's JSX boxGeometry is table-owned; all other shapes here are cached primitives.
    if (mesh.geometry.type !== 'BoxGeometry' && !geometries.has(mesh.geometry)) { geometries.add(mesh.geometry); mesh.geometry.addEventListener('dispose', () => omokResources.shared++) }
    // Only externally shared stone materials are expected to survive this table.
    if (!o.name && (o.parent?.name.startsWith('omok-board-'))) {
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!materials.has(m)) { materials.add(m); m.addEventListener('dispose', () => omokResources.shared++) }
      }
    }
  })
}
export const omokResourceProbe = () => ({ ...omokResources })
export function farkleProbe() {
  const { scene } = root()
  const dice: { id: string; face: number; held: boolean; quaternion: number[] }[] = []
  scene.traverse(o => { if (o.name.startsWith('farkle-die-')) dice.push({ id: o.name, face: o.userData.face, held: o.userData.held, quaternion: o.quaternion.toArray() }) })
  return { dice, cameraReady: diceCamera.ready, cup: useDiceUI.getState().cup, selected: useDiceUI.getState().selectedIds }
}
export function pointForFarkleCup() {
  const { scene, camera, gl } = root()
  const cup = scene.getObjectByName('farkle-cup-table-1')!
  const p = cup.localToWorld(new Vector3(0, .15, 0)).project(camera), box = gl.domElement.getBoundingClientRect()
  return { x: (p.x + 1) * box.width / 2, y: (1 - p.y) * box.height / 2 }
}
const diceResources = { disposed: 0, sharedDisposed: 0 }
export function watchDiceResources() {
  diceResources.disposed = diceResources.sharedDisposed = 0
  const geometries = new Set(), materials = new Set()
  root().scene.traverse(child => {
    if (!child.parent?.name.startsWith('farkle-die-') || !(child instanceof Mesh)) return
    const mesh = child
    if ('isInstancedMesh' in mesh) (mesh as InstancedMesh).addEventListener('dispose', () => diceResources.disposed++)
    if (!geometries.has(mesh.geometry)) { geometries.add(mesh.geometry); mesh.geometry.addEventListener('dispose', () => diceResources.sharedDisposed++) }
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!materials.has(m)) { materials.add(m); m.addEventListener('dispose', () => diceResources.sharedDisposed++) }
    }
  })
}
export const diceResourceProbe = () => ({ ...diceResources })

function root() {
  const canvas = document.querySelector('canvas')!
  return _roots.get(canvas)!.store.getState()
}
export function adCameraProbe() {
  const { camera, scene } = root(), s = useSession.getState()
  const own = avatars.get(s.sessionId)
  return { controls: { ...viewControls }, camera: camera.position.toArray(), direction: camera.getWorldDirection(new Vector3()).toArray(),
    pose: own ? { ...own.current } : null,
    ownVisible: scene.getObjectByName('avatar-' + s.sessionId)?.visible,
    remoteVisible: scene.getObjectByName('avatar-102')?.visible,
    active: document.pointerLockElement === document.querySelector('canvas') }
}
export function avatarMenuPoint(id: string) {
  const { scene, camera, gl } = root(), avatar = scene.getObjectByName('avatar-' + id)!
  const p = avatar.getWorldPosition(new Vector3()), worldX = p.x
  p.y += CHARACTER.height * .55; p.project(camera)
  const box = gl.domElement.getBoundingClientRect()
  return { x: box.left + (p.x + 1) * box.width / 2, y: box.top + (1 - p.y) * box.height / 2, worldX }
}
export function projectWorldPoint(position: readonly number[]) {
  const { camera, gl } = root(), p = new Vector3(position[0], position[1], position[2]).project(camera)
  const box = gl.domElement.getBoundingClientRect()
  return { x: box.left + (p.x + 1) * box.width / 2, y: box.top + (1 - p.y) * box.height / 2 }
}
const followResources = { geometry: 0, material: 0 }
const followDraw = { calls: 0, triangles: 0 }
export function measureFollowDraw() {
  const { scene, gl } = root(), mesh = scene.getObjectByName('follow-ropes') as Mesh
  let calls = 0, triangles = 0
  mesh.onBeforeRender = () => { calls = gl.info.render.calls; triangles = gl.info.render.triangles }
  mesh.onAfterRender = () => { followDraw.calls = gl.info.render.calls - calls; followDraw.triangles = gl.info.render.triangles - triangles }
}
export function watchFollowResources() {
  followResources.geometry = followResources.material = 0
  const mesh = root().scene.getObjectByName('follow-ropes') as Mesh
  mesh.geometry.addEventListener('dispose', () => followResources.geometry++)
  const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material
  material.addEventListener('dispose', () => followResources.material++)
}
export const followResourceProbe = () => ({ ...followResources })
export function followRenderProbe() {
  const { scene, gl } = root(), mesh = scene.getObjectByName('follow-ropes') as Mesh
  const position = mesh.geometry.getAttribute('position')
  const material = (Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material) as import('three').MeshBasicMaterial
  return { vertices: mesh.geometry.drawRange.count, capacity: position.count,
    ownDraw: { ...followDraw }, textured: !!material.map,
    finite: Array.from(position.array).every(Number.isFinite),
    calls: gl.info.render.calls, triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }
}
/** A fixture-approved pose in front of a real poster, then an actual browser raycast click. */
export function advertisementTarget() {
  const { scene } = root()
  let target: Mesh | undefined
  scene.traverse(o => { if (!target && o.name === 'park-static-advertisement' && o.userData.face === 1) target = o as Mesh })
  if (!target) throw new Error('Missing original advertisement')
  target.updateWorldMatrix(true, false)
  const point = target.getWorldPosition(new Vector3()), normal = new Vector3(0, 0, 1).transformDirection(target.matrixWorld)
  const position = point.clone().addScaledVector(normal, 5)
  // Keep the test eye aligned with the poster. This is a rendering fixture, not a physics test.
  position.y = point.y - (CHARACTER.height - .2 - .8)
  viewControls.yaw = Math.atan2(normal.x, normal.z); viewControls.pitch = 0
  return { x: position.x, y: position.y, z: position.z, yaw: 0 }
}
export function advertisementPoint() {
  const { scene, camera, gl } = root()
  let target: Mesh | undefined
  scene.traverse(o => { if (!target && o.name === 'park-static-advertisement' && o.userData.face === 1) target = o as Mesh })
  const point = target!.getWorldPosition(new Vector3()).project(camera), box = gl.domElement.getBoundingClientRect()
  return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 }
}
export function sceneProbe() {
  const { scene, camera, gl } = root(),
    state = useSession.getState()
  let geometryBytes = 0,
    textureBytes = 0
  const geometries = new Set(),
    textures = new Set()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (!geometries.has(object.geometry)) {
      geometries.add(object.geometry)
      for (const a of Object.values(object.geometry.attributes) as (
        BufferAttribute | InterleavedBufferAttribute
      )[])
        geometryBytes += (
          'isInterleavedBufferAttribute' in a ? a.data.array : a.array
        ).byteLength
      geometryBytes += object.geometry.index?.array.byteLength ?? 0
    }
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      for (const value of Object.values(material)) {
        if (
          value &&
          typeof value === 'object' &&
          'isTexture' in value &&
          !textures.has(value)
        ) {
          textures.add(value)
          const image = (
            value as { image?: { width?: number; height?: number } }
          ).image
          if (image?.width && image.height)
            textureBytes += (image.width * image.height * 4 * 4) / 3
        }
      }
  })
  const context = gl.getContext(),
    debug = context.getExtension('WEBGL_debug_renderer_info')
  return {
    metrics: summarizeFrames(),
    camera: camera.position.toArray(),
    seated: !!state.tableId,
    ownVisible: scene.getObjectByName('avatar-' + state.sessionId)?.visible,
    remoteVisible: scene.getObjectByName('avatar-102')?.visible,
    geometryBytesEstimate: geometryBytes,
    textureBytesEstimate: textureBytes,
    gpu: debug
      ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : 'unavailable',
    gpuTimerAvailable: !!context.getExtension(
      'EXT_disjoint_timer_query_webgl2',
    ),
    hardwareConcurrency: navigator.hardwareConcurrency,
  }
}
export function pointForTable(id: string) {
  const { scene, camera, size } = root(),
    object = scene.getObjectByName(id)
  if (!object) throw new Error('Missing table')
  const box = new Box3().setFromObject(object),
    point = box.getCenter(new Vector3())
  point.y = box.max.y - 0.3
  point.project(camera)
  return {
    x: ((point.x + 1) * size.width) / 2,
    y: ((1 - point.y) * size.height) / 2,
  }
}
export function visualTime(phase: number) {
  environmentClock.reset()
  environmentClock.sync(
    environmentConfig.epochMs + environmentConfig.dayDurationMs * phase,
    performance.now(),
  )
}
export function resetFrames() {
  resetMetrics()
}
export function assetVisibility(on: boolean) {
  const { scene } = root()
  const original = scene.getObjectByName('placeholder-park')
  if (original) original.visible = on
}
export function orbit(yaw: number, pitch = 0.35, distance = 6.8) {
  Object.assign(viewControls, { yaw, pitch, distance })
}
export function avatarLODs() {
  const { scene } = root()
  return ['101', '102'].map((id) => {
    const root = scene.getObjectByName('avatar-' + id)
    return {
      id,
      visible: root?.visible,
      near: root?.getObjectByName('near-body')?.visible,
      far: root?.getObjectByName('far-body')?.visible,
    }
  })
}
export function fixtureProfiles() {
  setDisplayProfiles(
    {
      '101': { nickname: '테스트 산책자', character: 'girl' },
      '102': { nickname: '테스트 친구', character: 'man' },
    },
    { nickname: '테스트 산책자', balance: 1234 },
  )
}
export async function gpuTimes(count = 8) {
  const context = root().gl.getContext() as WebGL2RenderingContext,
    ext = context.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!ext) return { status: 'extension unavailable', ms: [] as number[] }
  const ms: number[] = []
  for (let i = 0; i < count; i++) {
    await new Promise(requestAnimationFrame)
    const query = context.createQuery()!
    context.beginQuery(ext.TIME_ELAPSED_EXT, query)
    await new Promise(requestAnimationFrame)
    context.endQuery(ext.TIME_ELAPSED_EXT)
    for (let tries = 0; tries < 120; tries++) {
      if (context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) {
        if (!context.getParameter(ext.GPU_DISJOINT_EXT))
          ms.push(context.getQueryParameter(query, context.QUERY_RESULT) / 1e6)
        break
      }
      await new Promise(requestAnimationFrame)
    }
    context.deleteQuery(query)
  }
  return { status: ms.length ? 'available' : 'no non-disjoint samples', ms }
}

// M01-only probes, loaded by browser tests through the dev server.
import { findBench } from '../../src/features/interactions/benchAnchors'
import { benchService } from '../../src/features/interactions/benchService'
import { benchSignal, useBenchState } from '../../src/features/interactions/benchState'
import { refreshActivityPresentation } from '../../src/network/worldClient'
export async function fixtureBench(userId: string, benchId: string, seat: 0 | 1) {
  const bench = findBench(benchId)!, session = useSession.getState()
  const lease = await benchService.sit({ userId, channelId: session.roomId,
    position: { x: bench.position[0], y: bench.position[1] + 0.8, z: bench.position[2] + 2, yaw: 0 } }, benchId, seat, benchSignal())
  useBenchState.setState(s => ({ placements: { ...s.placements, [userId]: lease } }))
  refreshActivityPresentation()
}
export const benchProbe = () => ({ benchId: useSession.getState().benchId, pending: useBenchState.getState().pending,
  lease: useBenchState.getState().placements[useSession.getState().sessionId], ...sceneProbe() })

export function movementProbe() {
  const { scene, camera } = root(), s = useSession.getState()
  const avatar = avatars.get(s.sessionId)
  const ripple = scene.getObjectByName('swimming-ripples') as InstancedMesh | undefined
  const rippleMatrix = new Matrix4()
  if (ripple?.count) ripple.getMatrixAt(0, rippleMatrix)
  return {
    approved: avatar ? { ...avatar.current } : null,
    sampled: avatar ? sampleAvatar(avatar, performance.now(), { x: 0, y: 0, z: 0, yaw: 0 }) : null,
    moving: avatar?.moving, running: avatar?.running, swimming: avatar?.swimming,
    remoteSwimming: avatars.get('102')?.swimming,
    figureRotationX: scene.getObjectByName('figure-' + s.sessionId)?.rotation.x,
    rippleCount: ripple?.count ?? 0,
    ripplePosition: new Vector3().setFromMatrixPosition(rippleMatrix).toArray(),
    cameraY: camera.position.y, terrainY: groundHeight(camera.position.x, camera.position.z),
  }
}

/** Keep unrelated advertisement uploads out of the avatar allocation/disposal comparison. */
export function fixtureStaticAdvertisementClock() {
  const at = ADVERTISEMENT_SCHEDULE.totalMs * 10_000 + 1000 // First two slots are static posters.
  environmentClock.reset()
  environmentClock.sync(at, performance.now())
  environmentClock.now = () => at
}
export function advertisementPostersReady() {
  const { scene, gl } = root()
  const textures = new Set<import('three').Texture>()
  scene.traverse(object => {
    if (object.name !== 'rotating-advertisement' || !(object instanceof Mesh) || !(object.material instanceof ShaderMaterial)) return
    for (const key of ['current', 'next']) textures.add(object.material.uniforms[key]!.value)
  })
  return textures.size > 0 && [...textures].every(texture =>
    (texture.image instanceof HTMLImageElement ? texture.image.complete
      : typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap && texture.image.width > 0)
    && !!(gl.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture)
}


// Unsupported action data stays in this test module, outside application entry points.
export function fixtureCharacterPose(id: string, patch: Partial<AvatarSnapshot>) {
  Object.assign(avatars.get(id)!, patch,
    patch.emote && patch.emoteAt === undefined ? { emoteAt: estimatedServerTime() - 700 } : {})
}
export function fixtureExercise(index: number) {
  for (const id of ['101', '102']) fixtureCharacterPose(id, {
    fitnessId: FITNESS_STATIONS[index]!.id, fitnessStartedAt: estimatedServerTime() - 1100,
    swimming: false, benchId: '', seatIndex: -1, emote: '',
  })
}
export function characterProbe() {
  const { scene, gl } = root()
  return {
    memory: { ...gl.info.memory },
    avatars: ['101', '102'].map(id => {
      const object = scene.getObjectByName('avatar-' + id)
      const model = object?.getObjectByName('character-model')
      const near = model?.getObjectByName('near-body') as SkinnedMesh | undefined
      const far = model?.getObjectByName('far-body') as SkinnedMesh | undefined
      const bone = (name: string) => {
        const rotation = model?.getObjectByName(name)?.rotation
        return rotation ? [rotation.x, rotation.y, rotation.z] : undefined
      }
      return { id, character: object?.userData.character, visible: object?.visible,
        near: near?.visible, far: far?.visible, skeleton: near?.skeleton.uuid,
        texture: near?.skeleton.boneTexture?.uuid, geometry: near?.geometry.uuid,
        // Test-only inspection of the pinned Three renderer; allocation alone is not a GPU upload.
        textureUploaded: !!near?.skeleton.boneTexture && !!(gl.properties.get(near.skeleton.boneTexture) as { __webglTexture?: WebGLTexture }).__webglTexture,
        bones: near?.skeleton.bones.length, arm: bone('upperArm_R'), elbow: bone('lowerArm_L'),
        leg: bone('upperLeg_L'), figureX: scene.getObjectByName('figure-' + id)?.rotation.x,
        seatedCloth: near?.morphTargetInfluences?.[near.morphTargetDictionary?.seatedCloth ?? -1],
      }
    }),
  }
}
const resourceWatch = { disposed: 0, sharedDisposed: 0 }
export function watchCharacterResources() {
  resourceWatch.disposed = resourceWatch.sharedDisposed = 0
  const object = root().scene.getObjectByName('avatar-102')!
  const skeletons = new Set(), geometries = new Set(), materials = new Set()
  object.traverse(child => {
    if (!(child instanceof SkinnedMesh)) return
    if (!skeletons.has(child.skeleton)) {
      skeletons.add(child.skeleton)
      child.skeleton.boneTexture?.addEventListener('dispose', () => resourceWatch.disposed++)
    }
    if (!geometries.has(child.geometry)) {
      geometries.add(child.geometry)
      child.geometry.addEventListener('dispose', () => resourceWatch.sharedDisposed++)
    }
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (materials.has(material)) continue
      materials.add(material)
      material.addEventListener('dispose', () => resourceWatch.sharedDisposed++)
    }
  })
}
export const characterResources = () => ({ ...resourceWatch })

import { useEmoteState } from '../../src/features/emotes/state'
import { inputState } from '../../src/world/inputOwnership'
export function emoteProbe() {
  const { scene } = root()
  return { ...useEmoteState.getState(), wheelOpen: inputState.emoteWheelOpen,
    avatars: ['101', '102'].map(id => ({ id, emote: avatars.get(id)?.emote, at: avatars.get(id)?.emoteAt,
      arm: scene.getObjectByName('avatar-' + id)?.getObjectByName('upperArm_R')?.rotation.toArray().slice(0, 3) as number[] | undefined,
      headYaw: scene.getObjectByName('avatar-' + id)?.getObjectByName('head')?.rotation.y,
      cloudVisible: scene.getObjectByName('fart-' + id)?.visible,
    })) }
}
export function fixtureInputFlag(flag: 'manualOpen' | 'mapOpen' | 'minigameOpen', open: boolean) { inputState[flag] = open }

import { PULLDOWN_LIFT, AVATAR, createFitnessMotion, sampleFitnessMotion } from '../../src/config'
import { fitnessService } from '../../src/features/fitness/service'
import { fitnessSignal, useFitnessState } from '../../src/features/fitness/state'
import { fitnessAnchors } from '../../src/features/fitness/anchors'
import { authoritativePose } from '../../src/network/worldClient'
export async function fixtureFitness(userId: string, stationId: string) {
  const lease = await fitnessService.enter({ userId, channelId: useSession.getState().roomId,
    position: fitnessAnchors(stationId).exit }, stationId, fitnessSignal(userId))
  useFitnessState.setState(s => ({ placements: { ...s.placements, [userId]: lease } }))
  refreshActivityPresentation()
}
export function fitnessProbe(stationId: string) {
  const { scene } = root(), s = useSession.getState(), state = useFitnessState.getState()
  const station = FITNESS_STATIONS.find(item => item.id === stationId)!
  const lease = Object.values(state.placements).find(item => item.stationId === stationId)
  const m = sampleFitnessMotion(station.kind, lease?.startedAt ?? 0, lease ? Date.now() : 0, createFitnessMotion())
  const mechanism = scene.getObjectByName(stationId + '-mechanism')
  const left = scene.getObjectByName(stationId + '-left-pedal')
  const right = scene.getObjectByName(stationId + '-right-pedal')
  const errors: number[] = []
  const difference = (actual: number | undefined, expected: number) => errors.push(Math.abs((actual ?? Infinity) - expected))
  if (station.kind === 'walker') { difference(left?.rotation.x, m.leftLeg); difference(right?.rotation.x, m.rightLeg) }
  else if (station.kind === 'elliptical') {
    difference(left?.position.y, station.baseHeight + (0.6 + m.leftPedalY) * AVATAR.scale)
    difference(left?.position.z, m.leftPedalZ * AVATAR.scale)
    difference(right?.position.z, m.rightPedalZ * AVATAR.scale)
  } else if (station.kind === 'inversion') difference(mechanism?.rotation.x, m.mechanism)
  else if (station.kind === 'surfer') difference(mechanism?.rotation.z, m.mechanism)
  else if (station.kind === 'twister') difference(mechanism?.rotation.y, m.mechanism)
  else if (station.kind === 'shoulder') difference(mechanism?.rotation.z, m.wheel)
  else if (station.kind === 'backmassage') difference(mechanism?.rotation.x, m.wheel)
  else if (station.kind === 'rower') difference(mechanism?.rotation.x, -m.mechanism * 0.5)
  else if (station.kind === 'legpress') difference(mechanism?.position.z, 0.5 + m.mechanism * 0.35)
  else if (station.kind === 'pulldown') difference(scene.getObjectByName('pulldown-seat-lift')?.position.y, m.mechanism * PULLDOWN_LIFT)
  else difference(mechanism?.rotation.x, 0)
  const avatar = avatars.get(s.sessionId)
  return { fitnessId: s.fitnessId, pending: state.pending, lease, placements: state.placements,
    occupantStartedAt: lease ? avatars.get(lease.userId)?.fitnessStartedAt : undefined,
    occupantFitnessId: lease ? avatars.get(lease.userId)?.fitnessId : undefined,
    authoritative: authoritativePose(s.sessionId), displayed: avatar?.current,
    ownVisible: scene.getObjectByName('avatar-' + s.sessionId)?.visible,
    remoteVisible: scene.getObjectByName('avatar-102')?.visible,
    avatarStartedAt: avatar?.fitnessStartedAt, avatarFitnessId: avatar?.fitnessId,
    machineError: Math.max(...errors), mechanism: mechanism?.rotation.toArray().slice(0, 3),
    leftPedal: left?.rotation.x, figure: scene.getObjectByName('figure-' + s.sessionId)?.rotation.x,
  }
}

import { telescopeService } from '../../src/features/telescopes/service'
import { telescopeSignal, useTelescopeState } from '../../src/features/telescopes/state'
import { telescopeAnchors } from '../../src/features/telescopes/anchors'
import { telescopeView } from '../../src/features/telescopeView'
export async function fixtureTelescope(userId: string, id: string, yaw?: number, pitch = -0.18) {
  const signal = telescopeSignal(userId)
  let lease = await telescopeService.enter({ userId, channelId: useSession.getState().roomId,
    position: telescopeAnchors(id).use }, id, signal)
  if (yaw !== undefined) lease = { ...lease, ...await telescopeService.aim(lease, { yaw, pitch }, signal) }
  useTelescopeState.setState(s => ({ placements: { ...s.placements, [userId]: lease } }))
  refreshActivityPresentation()
}
export function telescopeProbe(id: string) {
  const { camera, scene } = root(), s = useSession.getState()
  const state = useTelescopeState.getState()
  const direction = camera.getWorldDirection(new Vector3())
  return { id: s.telescopeId, pending: state.pending, placements: state.placements, view: { ...telescopeView },
    controls: { ...viewControls }, fov: 'fov' in camera ? camera.fov as number : 0,
    camera: camera.position.toArray(), direction: direction.toArray(),
    ownVisible: scene.getObjectByName('avatar-' + s.sessionId)?.visible,
    remoteVisible: scene.getObjectByName('avatar-102')?.visible,
    instrumentVisible: scene.getObjectByName(id)?.visible,
    swivel: scene.getObjectByName(id + '-swivel')?.rotation.y,
    head: scene.getObjectByName(id + '-head')?.rotation.x,
    authoritative: authoritativePose(s.sessionId), displayed: avatars.get(s.sessionId)?.current,
    remote: { id: avatars.get('102')?.telescopeId, yaw: avatars.get('102')?.telescopeYaw, pitch: avatars.get('102')?.telescopePitch },
  }
}

import { feedbackService } from '../../src/features/feedback/service'
import { useFeedbackState } from '../../src/features/feedback/state'
import type { FeedbackSubmission } from '../../src/features/feedback/contracts'
let feedbackFault: 'normal' | 'reject' | 'hold' | 'acceptThenLose' = 'normal'
let feedbackWrapped = false
const feedbackCalls: FeedbackSubmission[] = []
const feedbackAccepted: string[] = []
export function fixtureFeedback(mode: typeof feedbackFault) {
  feedbackFault = mode
  if (feedbackWrapped) return
  feedbackWrapped = true
  const submit = feedbackService.submit.bind(feedbackService)
  feedbackService.submit = async (payload, signal) => {
    feedbackCalls.push(payload)
    const fault = feedbackFault
    if (fault === 'reject') throw new Error('테스트 저장 실패입니다. 같은 내용으로 다시 시도해주세요.')
    if (fault === 'hold') return new Promise(() => {}) // Deliberately non-cooperating adapter for timeout/cancellation tests.
    const result = await submit(payload, signal)
    feedbackAccepted.push(result.receiptId)
    if (fault === 'acceptThenLose') { feedbackFault = 'normal'; return new Promise(() => {}) }
    return result
  }
}
export function feedbackProbe() {
  const own = useFeedbackState.getState()
  return { ...own, calls: feedbackCalls.map(call => ({ operationId: call.operationId, keys: Object.keys(call).sort() })),
    accepted: [...feedbackAccepted], controls: { ...viewControls }, feedbackOpen: inputState.feedbackOpen,
    publicData: JSON.stringify({ session: useSession.getState(), avatars: [...avatars] }),
  }
}

import { notesService } from '../../src/features/notes/service'
import { useNotesState } from '../../src/features/notes/state'
import { NOTES_BOX } from '../../src/config/notes'
import type { NoteSubmission } from '../../src/features/notes/contracts'
let notesFault: 'normal' | 'readReject' | 'holdRead' | 'reject' | 'hold' | 'acceptThenLose' = 'normal'
let notesWrapped = false
const noteCalls: NoteSubmission[] = []
const noteAccepted: string[] = []
export function fixtureNotes(mode: typeof notesFault) {
  notesFault = mode
  if (notesWrapped) return
  notesWrapped = true
  const read = notesService.read.bind(notesService), submit = notesService.submit.bind(notesService)
  notesService.read = async (scope, signal) => {
    if (notesFault === 'readReject') throw new Error('테스트 목록 조회 실패입니다.')
    if (notesFault === 'holdRead') return new Promise(() => {})
    return read(scope, signal)
  }
  notesService.submit = async (scope, submission, signal) => {
    noteCalls.push({ ...submission })
    if (notesFault === 'reject') throw new Error('테스트 메모 저장 실패입니다.')
    if (notesFault === 'hold') return new Promise(() => {})
    const result = await submit(scope, submission, signal)
    noteAccepted.push(result.note.id)
    if (notesFault === 'acceptThenLose') { notesFault = 'normal'; return new Promise(() => {}) }
    return result
  }
}
export function notesProbe() {
  return { ...useNotesState.getState(), calls: noteCalls.map(c => ({ operationId: c.operationId, keys: Object.keys(c).sort() })),
    accepted: [...noteAccepted], controls: { ...viewControls }, notesOpen: inputState.notesOpen,
    publicData: JSON.stringify({ session: useSession.getState(), avatars: [...avatars] }) }
}
/** Another reader/writer on the same explicit page mock, not an actual network peer. */
export async function fixtureNearbyNote(text: string) {
  return notesService.submit({ userId: 'nearby-fixture', channelId: useSession.getState().roomId,
    position: { x: NOTES_BOX.x, y: NOTES_BOX.y + 0.8, z: NOTES_BOX.z, yaw: 0 } },
  { text, operationId: crypto.randomUUID() }, new AbortController().signal)
}


// M09: seed only the missing public-reference port in the explicit preview build.
import { publicMatchService } from '../../src/features/tableLobby/publicMatch'
import { useTableLobby, seatedLook } from '../../src/features/tableLobby/state'
import type { PublicMatchReference } from '../../src/features/tableLobby/publicMatch'
export function previewPublicMatch(ref: PublicMatchReference) {
  if (!import.meta.env.DEV || import.meta.env.MODE !== 'facility-preview' || publicMatchService.mode !== 'mock') throw new Error('Preview only')
  ;(publicMatchService as typeof publicMatchService & { set(ref: PublicMatchReference): void }).set(ref)
}
export function onecardProbe() {
  const scene = root().scene, top = scene.getObjectByName('onecard-public-top'), backs = scene.getObjectByName('onecard-public-card-backs') as InstancedMesh | undefined
  return { top: top?.userData.cardId, backs: backs?.count ?? 0, visible: !!scene.getObjectByName('onecard-table'),
    publicData: JSON.stringify({ session: useSession.getState(), avatars: [...avatars] }) }
}
export function bridgeProbe() {
  const { scene } = root(), b = useGame.getState().game?.bridge, pieces = scene.getObjectByName('bridge-pawns') as InstancedMesh | undefined
  const pawns = b?.players.flatMap(p => p.pawns) ?? [], matrix = new Matrix4()
  return { visible: !!scene.getObjectByName('bridge-table'), count: pieces?.count ?? 0,
    crosses: (scene.getObjectByName('bridge-vacated') as InstancedMesh | undefined)?.count ?? 0,
    pawns: pieces ? pawns.map((p, i) => { pieces.getMatrixAt(i, matrix); return { id: p.id, status: p.status, position: matrix.elements.slice(12, 15), scale: Math.hypot(...matrix.elements.slice(0, 3)) } }) : [],
    publicData: JSON.stringify({ session: useSession.getState(), avatars: [...avatars] }) }
}
export function boardgameArtProbe() {
  const { scene } = root()
  const pawn = scene.getObjectByName('bridge-pawns') as InstancedMesh | undefined
  const top = scene.getObjectByName('onecard-public-top')
  const mat = scene.getObjectByName('onecard-felt-mat')
  const cup = scene.getObjectByName('farkle-cup-' + useSession.getState().focusedAnchorId)
  const cupMeshes: Mesh[] = []
  cup?.traverse(o => { if (o instanceof Mesh) cupMeshes.push(o) })
  return { cardMat: !!mat, cardSurfaceY: top?.position.y, deck: !!scene.getObjectByName('onecard-draw-deck'),
    cupMeshes: cupMeshes.length, originalTray: !!scene.getObjectByName('farkle-oak-tray'),
    boardModel: !!scene.getObjectByName('board-lod'), boardNear: scene.getObjectByName('board-detail')?.visible,
    boardFar: scene.getObjectByName('board-distant')?.visible,
    pawnTriangles: pawn ? (pawn.geometry.index?.count ?? pawn.geometry.attributes.position!.count) / 3 : 0 }
}
const bridgeResources = { instances: 0, shared: 0 }
export const bridgeResourceProbe = () => ({ ...bridgeResources })
export function watchBridgeResources() {
  const resources = new Set<object>()
  root().scene.getObjectByName('bridge-table')?.traverse(object => {
    if (!(object instanceof Mesh)) return
    if ('isInstancedMesh' in object) object.addEventListener('dispose', () => bridgeResources.instances++)
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])]) {
      if (!resources.has(resource)) { resources.add(resource); resource.addEventListener('dispose', () => bridgeResources.shared++) }
    }
  })
}
const onecardResources = { textures: 0, materials: 0, instances: 0, shared: 0 }
const watchedOneCardResources = new WeakSet<object>()
export const onecardResourceProbe = () => ({ ...onecardResources })
export function watchOneCardResources() {
  const scene = root().scene
  scene.getObjectByName('onecard-table')?.traverse(object => {
    if (!(object instanceof Mesh)) return
    if (!watchedOneCardResources.has(object.geometry)) {
      watchedOneCardResources.add(object.geometry); object.geometry.addEventListener('dispose', () => onecardResources.shared++)
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (watchedOneCardResources.has(material)) continue
      watchedOneCardResources.add(material)
      if ('map' in material && material.map instanceof Texture) {
        material.addEventListener('dispose', () => onecardResources.materials++)
        material.map.addEventListener('dispose', () => onecardResources.textures++)
      } else material.addEventListener('dispose', () => onecardResources.shared++)
    }
  })
  const backs = scene.getObjectByName('onecard-public-card-backs') as InstancedMesh | undefined
  if (backs && !watchedOneCardResources.has(backs)) {
    watchedOneCardResources.add(backs); backs.addEventListener('dispose', () => onecardResources.instances++)
  }
}
export function tablePresentationProbe() {
  const { camera } = root()
  return { query: useTableLobby.getState(), yaw: seatedLook.yaw, seatIndex: useSession.getState().seatIndex,
    ownTable: useSession.getState().tableId, camera: camera.position.toArray(), omokCamera: { ...omokCamera },
    publicMatchMode: publicMatchService.mode }
}
