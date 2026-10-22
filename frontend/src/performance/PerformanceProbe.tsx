import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { metrics, recordFrame, resetMetrics } from './metrics'
export function PerformanceProbe() {
  const gl = useThree((state) => state.gl)
  const frameloop = useThree((state) => state.frameloop)
  useEffect(() => {
    resetMetrics()
    metrics.renderMode =
      frameloop === 'always'
        ? 'continuous'
        : frameloop === 'demand'
          ? 'on-demand'
          : 'paused'
    return () => {
      metrics.renderMode = 'paused'
      resetMetrics()
      metrics.drawCalls = metrics.triangles = metrics.width = metrics.height = 0
    }
  }, [frameloop])
  useEffect(() => {
    const context = gl.getContext(),
      extension = context.getExtension('WEBGL_debug_renderer_info')
    metrics.renderer = extension
      ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
      : 'WebGL 2 (GPU name unavailable)'
    function lost(event: Event) {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('tapgol-context-lost'))
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl])
  useEffect(() => {
    const capture = () => {
      // Read after rendering: a demand scene may never have a subsequent frame.
      metrics.drawCalls = gl.info.render.calls
      metrics.triangles = gl.info.render.triangles
      metrics.geometries = gl.info.memory.geometries
      metrics.textures = gl.info.memory.textures
      metrics.width = gl.domElement.width
      metrics.height = gl.domElement.height
      metrics.dpr = gl.getPixelRatio()
    }
    capture()
    return addAfterEffect(capture)
  }, [gl])
  useFrame((state, delta) => {
    // Idle demand frames can be minutes apart: that gap is not a rendering hitch.
    if (state.frameloop === 'always' && !document.hidden && delta > 0)
      recordFrame(delta * 1000)
    if (!metrics.firstFrameMs) metrics.firstFrameMs = performance.now()
  })
  return null
}
