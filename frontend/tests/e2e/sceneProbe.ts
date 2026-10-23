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
import { avatars, sampleAvatar } from '../../src/network/worldClient'
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
