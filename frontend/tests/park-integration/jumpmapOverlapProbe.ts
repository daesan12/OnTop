// Dev-server-only diagnostic. Synthetic approved snapshots isolate rendering from server physics.
import { _roots } from '@react-three/fiber'
import { COURSE } from '../../src/features/jumpmap/course'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { finishWelcomeFlight } from '../../src/features/welcomeTour/state'
import { avatars, receive, useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'

let timer: ReturnType<typeof setInterval> | undefined, animation = 0, overlap = false, gaps: number[] = []
let previous = 0, ticks = 0

export function startOverlapDiagnostic() {
  finishWelcomeFlight()
  const session = useSession.getState(), pad = COURSE[0]!
  useJumpmap.setState({ available: true, checked: true, owner: session.sessionId,
    run: { runId: 'overlap-diagnostic', startedAt: performance.now(), gatesPassed: 0,
      elapsedMs: 0, finalReached: false, maxHeight: 0, runCoins: 0 } })
  ticks = 0; overlap = false; gaps = []; previous = performance.now()
  const frame = (at: number) => { gaps.push(at - previous); previous = at; animation = requestAnimationFrame(frame) }
  animation = requestAnimationFrame(frame)
  timer = setInterval(() => {
    const index = ++ticks, own = { x: pad.x + index * .015, y: pad.top + .8, z: pad.z,
      yaw: 0, moving: true, running: false, swimming: false, lastInputSeq: index }
    receive({ type: 'WORLD_STATE', requestId: null, payload: {
      channelId: session.roomId, version: 100000 + index, mapVersion: session.mapVersion,
      avatars: [{ userId: session.sessionId, position: own },
        { userId: 'overlap-remote', position: { ...own, x: own.x + (overlap ? .1 : 2) },
          motion: { tick: index * 3, epoch: 1, appliedInputSeq: index, inputAgeMs: 0,
            velocityY: 0, grounded: true, inputActive: true } }],
    } })
  }, 100)
}

export function setDiagnosticOverlap(value: boolean) { overlap = value; gaps = [] }

export function overlapProbe() {
  const root = _roots.get(document.querySelector('canvas')!)!.store.getState()
  const peer = root.scene.getObjectByName('avatar-overlap-remote')
  return { programs: root.gl.info.programs?.length ?? 0, maxFrameGapMs: Math.max(0, ...gaps), frames: gaps.length,
    camera: root.camera.position.toArray(), own: avatars.get(useSession.getState().sessionId)?.current,
    remoteOpacity: peer?.userData.appearanceOpacity as number | undefined, inputState: { ...inputState } }
}

export function stopOverlapDiagnostic() { clearInterval(timer); cancelAnimationFrame(animation) }
