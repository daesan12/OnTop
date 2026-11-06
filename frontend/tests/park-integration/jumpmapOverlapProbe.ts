// Dev-server-only diagnostic. Synthetic approved snapshots isolate rendering from server physics.
import { _roots } from '@react-three/fiber'
import { COURSE } from '../../src/features/jumpmap/course'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { finishWelcomeFlight } from '../../src/features/welcomeTour/state'
import { avatars, receive, useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { Mesh, type Material } from 'three'

let timer: ReturnType<typeof setInterval> | undefined, animation = 0, overlap = false, gaps: number[] = []
let previous = 0, ticks = 0
let peerPresent = true
let disposal = { expected: 0, disposed: 0, restored: true }

const canvasRoot = () => _roots.get(document.querySelector('canvas')!)!.store.getState()

export function startOverlapDiagnostic() {
  finishWelcomeFlight()
  const session = useSession.getState(), pad = COURSE[0]!
  useJumpmap.setState({ available: true, checked: true, owner: session.sessionId,
    run: { runId: 'overlap-diagnostic', startedAt: performance.now(), gatesPassed: 0,
      elapsedMs: 0, finalReached: false, maxHeight: 0, runCoins: 0 } })
  ticks = 0; overlap = false; gaps = []; previous = performance.now()
  peerPresent = true; disposal = { expected: 0, disposed: 0, restored: true }
  const frame = (at: number) => { gaps.push(at - previous); previous = at; animation = requestAnimationFrame(frame) }
  animation = requestAnimationFrame(frame)
  timer = setInterval(() => {
    const index = ++ticks, own = { x: pad.x + index * .015, y: pad.top + .8, z: pad.z,
      yaw: 0, moving: true, running: false, swimming: false, lastInputSeq: index }
    receive({ type: 'WORLD_STATE', requestId: null, payload: {
      channelId: session.roomId, version: 100000 + index, mapVersion: session.mapVersion,
      avatars: [{ userId: session.sessionId, position: own },
        ...(peerPresent ? [{ userId: 'overlap-remote', position: { ...own, x: own.x + (overlap ? .1 : 2) },
          motion: { tick: index * 3, epoch: 1, appliedInputSeq: index, inputAgeMs: 0,
            velocityY: 0, grounded: true, inputActive: true } }] : [])],
    } })
  }, 100)
}

export function setDiagnosticOverlap(value: boolean) { overlap = value; gaps = [] }

export function watchPeerDisposal() {
  const meshes: Mesh[] = [], materials = new Set<Material>()
  canvasRoot().scene.getObjectByName('avatar-overlap-remote')?.getObjectByName('character-model')?.traverse(object => {
    if (!(object instanceof Mesh)) return
    meshes.push(object)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  disposal = { expected: materials.size, disposed: 0, restored: true }
  for (const material of materials) material.addEventListener('dispose', () => {
    disposal.disposed++
    disposal.restored &&= meshes.every(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .every(liveMaterial => !materials.has(liveMaterial)))
  })
}

export function setDiagnosticPeerPresent(value: boolean) { peerPresent = value }
export function loseDiagnosticContext() { canvasRoot().gl.forceContextLoss() }
export function restoreDiagnosticContext() { canvasRoot().gl.forceContextRestore() }

export function overlapProbe() {
  const root = canvasRoot()
  const peer = root.scene.getObjectByName('avatar-overlap-remote')
  let fadedMaterials = 0
  const materialState: { name: string; opacity: number; transparent: boolean }[] = []
  peer?.getObjectByName('character-model')?.traverse(object => {
    if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materialState.push({ name: object.name, opacity: material.opacity, transparent: material.transparent })
      if (material.transparent && material.opacity < .5) fadedMaterials++
    }
  })
  return { programs: root.gl.info.programs?.length ?? 0, maxFrameGapMs: Math.max(0, ...gaps), frames: gaps.length,
    camera: root.camera.position.toArray(), own: avatars.get(useSession.getState().sessionId)?.current,
    remoteOpacity: peer?.userData.appearanceOpacity as number | undefined, inputState: { ...inputState },
    hasPeer: !!peer, fadedMaterials, materialState,
    contextLost: root.gl.getContext().isContextLost(), disposal: { ...disposal } }
}

export function stopOverlapDiagnostic() { clearInterval(timer); cancelAnimationFrame(animation) }
