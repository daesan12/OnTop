// Dev-server-only inspection helper. Never imported by production code or bundled with the app.
import { _roots } from '@react-three/fiber'
import {
  Box3,
  Mesh,
  Vector3,
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
import { GOMOKU } from '../../src/config'
import type { InstancedMesh } from 'three'
import { omokCamera } from '../../src/game/cameraState'
import { Matrix4 } from 'three'
import { avatars, sampleAvatar, estimatedServerTime, type AvatarSnapshot } from '../../src/network/worldClient'
import { SkinnedMesh, ShaderMaterial } from 'three'
import { FITNESS_STATIONS } from '../../src/config'
import { ADVERTISEMENT_SCHEDULE } from '../../src/world/art/advertisementMedia'
import { groundHeight } from '../../src/config'
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

function root() {
  const canvas = document.querySelector('canvas')!
  return _roots.get(canvas)!.store.getState()
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
  return textures.size > 0 && [...textures].every(texture => texture.image instanceof HTMLImageElement
    && texture.image.complete && !!(gl.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture)
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
  return { ...useEmoteState.getState(), wheelOpen: inputState.emoteWheelOpen,
    avatars: ['101', '102'].map(id => ({ id, emote: avatars.get(id)?.emote, at: avatars.get(id)?.emoteAt })) }
}
export function fixtureInputFlag(flag: 'manualOpen' | 'mapOpen' | 'minigameOpen', open: boolean) { inputState[flag] = open }
