import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { waitForScenePrograms } from '../../src/world/prepareScene'

export function ShaderPreparedGroup({ children, priority = 0 }: { children: ReactNode; priority?: number }) {
  const group = useRef<Group>(null)
  const started = useRef<Group | null>(null)

  useFrame(({ gl, camera, scene }) => {
    const target = group.current
    if (!target || started.current === target) return
    started.current = target
    const live = () => group.current === target
    const reveal = () => { if (live()) target.visible = true }

    if (!gl.extensions.has('KHR_parallel_shader_compile')) {
      reveal()
      return
    }
    // Compile against the live environment, then allow drawing only once the
    // renderer can query the program without blocking on compilation.
    try {
      const compilation = gl.compileAsync(target, camera, scene)
      void waitForScenePrograms(gl, live, compilation).then(reveal, reveal)
    } catch {
      reveal()
    }
  }, priority)

  return <group ref={group} visible={false}>{children}</group>
}
