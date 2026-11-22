import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import { Object3D, type Group, type WebGLRenderer } from 'three'
import { prepareObjectTextures, waitForScenePrograms } from '../../src/world/prepareScene'

const objectsPerBatch = 12
const lastBatchFrame = new WeakMap<WebGLRenderer, number>()

export function ShaderPreparedGroup({ children, priority = 0, batched = false }: {
  children: ReactNode
  priority?: number
  batched?: boolean
}) {
  const group = useRef<Group>(null)
  const started = useRef<Group | null>(null)
  const batches = useRef<{ target: Group; objects: Object3D[]; next: number } | null>(null)

  useFrame(({ gl, camera, scene }) => {
    const target = group.current
    if (!target || (started.current === target && !batches.current)) return
    const live = () => group.current === target
    const reveal = () => {
      const ready = () => { if (live()) target.visible = true }
      void prepareObjectTextures(gl, target, live).then(ready, ready)
    }

    if (started.current !== target) {
      started.current = target
      batches.current = null
      if (!gl.extensions.has('KHR_parallel_shader_compile')) {
        reveal()
        return
      }
      if (!batched) {
        try {
          const compilation = gl.compileAsync(target, camera, scene)
          void waitForScenePrograms(gl, live, compilation).then(reveal, reveal)
        } catch {
          reveal()
        }
        return
      }
      const objects: Object3D[] = []
      target.traverse(object => {
        if ('material' in object) objects.push(object)
      })
      batches.current = { target, objects, next: 0 }
    }

    const batch = batches.current
    const frame = gl.info.render.frame
    if (!batch || batch.target !== target || lastBatchFrame.get(gl) === frame) return
    lastBatchFrame.set(gl, frame)
    try {
      const end = Math.min(batch.next + objectsPerBatch, batch.objects.length)
      const selection = new Object3D()
      // Keep the meshes attached so Three uses the same transforms and lighting as the live draw.
      selection.traverse = visit => {
        for (let i = batch.next; i < end; i++) visit(batch.objects[i]!)
      }
      gl.compile(selection, camera, scene)
      batch.next = end
      if (end !== batch.objects.length) return
      batches.current = null
      void waitForScenePrograms(gl, live).then(reveal, reveal)
    } catch {
      batches.current = null
      reveal()
    }
  }, priority)

  return <group ref={group} visible={false}>{children}</group>
}
