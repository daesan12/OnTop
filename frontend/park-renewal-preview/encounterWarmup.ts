import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type Material, type Mesh, type Texture } from 'three'

const TEXTURE_SLOTS = ['map', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap'] as const

/**
 * The twelve encounters stay hidden until they jump out, so without help their shader programs are linked and their
 * textures uploaded in the very frame the scare starts, freezing the screen at the worst moment. While the
 * underground is shown (its lights are the ones the programs must match), compile every hidden encounter — three's
 * compile walks hidden children too — and upload their textures a couple per frame. New meshes (a Tripo model that
 * finished loading and replaced its fallback) are prepared again. S15P31B105-450.
 */
export function useEncounterWarmup(stage: RefObject<Object3D | null>) {
  const prepared = useRef(-1)
  const uploaded = useRef(new WeakSet<Texture>())
  const queue = useRef<Texture[]>([])
  useFrame(({ gl, camera, scene }) => {
    const root = stage.current
    if (!root) return
    for (let node: Object3D | null = root; node; node = node.parent) if (!node.visible) return
    const pending = queue.current
    for (let i = 0; i < 2 && pending.length; i++) {
      const texture = pending.shift()!
      if (texture.image) gl.initTexture(texture)
    }
    if (gl.info.render.frame % 15) return
    let meshes = 0
    root.traverse(object => { if ('material' in object) meshes++ })
    if (meshes === prepared.current) return
    prepared.current = meshes
    root.traverse(object => {
      const material = (object as Mesh).material as Material | Material[] | undefined
      for (const m of material ? Array.isArray(material) ? material : [material] : []) for (const slot of TEXTURE_SLOTS) {
        const texture = (m as unknown as Record<string, Texture | null | undefined>)[slot]
        if (texture?.isTexture && !uploaded.current.has(texture)) { uploaded.current.add(texture); pending.push(texture) }
      }
    })
    // Hand three only the meshes: compiling the stage itself would count its accent light twice (once from the
    // scene, once from the stage) and build programs for one light too many.
    const meshes_: Object3D[] = []
    root.traverse(object => { if ('material' in object) meshes_.push(object) })
    const selection = new Object3D()
    selection.traverse = visit => meshes_.forEach(visit)
    try {
      void gl.compileAsync(selection, camera, scene).catch(() => {})
    } catch {
      // Preparing early is an optimisation only; the first draw will still compile what is missing.
    }
  }, .55)
}
