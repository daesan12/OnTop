// Dev-only evidence for the quality controls. Never imported by application code.
import { _roots } from '@react-three/fiber'
import { summarizeFrames } from '../../src/performance/metrics'

export function graphicsProbe() {
  const canvas = document.querySelector('canvas')!
  const { gl, frameloop, camera } = _roots.get(canvas)!.store.getState()
  const shadow = gl.shadowMap
  return { report: summarizeFrames(), frameloop, shadows: shadow.enabled, shadowType: shadow.type,
    canvas: [canvas.width, canvas.height], camera: camera.uuid }
}
