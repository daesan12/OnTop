import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { prepareScene } from '../../world/prepareScene'
import type { Scene } from 'three'
import { renderStoneScene } from './visibility'
import { StoneParkBackdrop } from './StoneParkBackdrop'

export type StoneSceneStatus = (ready: boolean, error?: string) => void
const views: { position: readonly [number, number, number]; target: readonly [number, number, number] }[] =
  [33, 24, 12, 0].map(y => ({ position: [0, y + 9, 7.5], target: [0, y + .4, -1.5] }))

/** 같은 WebGL 컨텍스트에 모델·텍스처·버퍼와 최초 낙하/발사 재질까지 준비한다. */
export function StoneRumblePreparation({ onStatus, playScene }: { onStatus: StoneSceneStatus; playScene: Scene }) {
  const { gl, scene, camera } = useThree()
  const backdrop = useMemo(() => new StoneParkBackdrop(), [])
  const startup = useMemo(() => ({ phase: 'cold', disposed: false, generation: 0, presentedAt: 0,
    backdropAttempted: false, fence: null as WebGLSync | null }), [])
  useEffect(() => {
    startup.disposed = false
    backdrop.invalidate()
    const lost = (event: Event) => {
      event.preventDefault(); startup.generation++; startup.phase = 'failed'; startup.fence = null
      onStatus(false, '3D 화면 연결이 끊겼어요. 복구를 기다려 주세요.')
    }
    const restored = () => {
      backdrop.invalidate()
      startup.phase = 'cold'
      startup.backdropAttempted = false
      onStatus(false)
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    gl.domElement.addEventListener('webglcontextrestored', restored)
    return () => {
      startup.disposed = true; startup.generation++; backdrop.dispose()
      if (startup.fence) (gl.getContext() as WebGL2RenderingContext).deleteSync(startup.fence)
      gl.domElement.removeEventListener('webglcontextlost', lost)
      gl.domElement.removeEventListener('webglcontextrestored', restored)
    }
  }, [backdrop, gl, onStatus, startup])
  useFrame(() => {
    const context = gl.getContext() as WebGL2RenderingContext
    if (startup.phase === 'cold') {
      startup.phase = 'preparing'
      const generation = ++startup.generation
      const live = () => !startup.disposed && generation === startup.generation
      onStatus(false)
      performance.mark('stone-rumble-prepare-start')
      void (async () => {
        await prepareScene(gl, playScene, camera, live, { warmGeometry: true, views })
        if (live()) startup.phase = 'ready'
      })().catch((error: unknown) => {
        if (live()) { startup.phase = 'failed'; onStatus(false, error instanceof Error ? error.message : '공원을 준비하지 못했어요.') }
      })
      return
    }
    if (startup.phase === 'preparing' || startup.phase === 'failed') return
    // 공원은 장식용이라 첫 경기 프레임과 서버 준비 신호를 기다리게 하지 않는다.
    if (startup.phase === 'presented' && !startup.backdropAttempted && scene.getObjectByName('stone-rumble-backdrop-source')) {
      startup.backdropAttempted = true
      try { backdrop.prepare(gl, scene) } catch { /* 경기장은 기본 하늘로 계속 그린다. */ }
    }
    try {
      renderStoneScene(gl, backdrop.scene, playScene, camera)
    } catch {
      startup.phase = 'failed'
      onStatus(false, '경기 화면을 그리지 못했어요. 다시 준비해 주세요.')
      return
    }
    if (startup.phase === 'ready') {
      startup.fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0)
      if (!startup.fence) { startup.phase = 'failed'; onStatus(false, '3D 화면 준비를 확인하지 못했어요. 다시 준비해 주세요.'); return }
      context.flush(); startup.presentedAt = performance.now(); startup.phase = 'presenting'
    } else if (startup.phase === 'presenting' && startup.fence) {
      const result = context.clientWaitSync(startup.fence, 0, 0)
      if (result === context.TIMEOUT_EXPIRED && performance.now() - startup.presentedAt < 30_000) return
      context.deleteSync(startup.fence); startup.fence = null
      if (result === context.WAIT_FAILED || result === context.TIMEOUT_EXPIRED) { startup.phase = 'failed'; onStatus(false, '3D 화면 준비 확인에 실패했어요.'); return }
      startup.phase = 'presented'
      performance.mark('stone-rumble-scene-ready')
      onStatus(true)
    }
  }, 1)
  return null
}
