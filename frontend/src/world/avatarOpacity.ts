import { Mesh, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer } from 'three'
import { waitForScenePrograms } from './prepareScene'

/** Prepare private fade materials before overlap; shared asset materials stay immutable. */
export function createAvatarOpacity(root: Object3D) {
  const copies = new Map<Material, Material>()
  let previous = 1
  let ready = false, disposed = false, preparation: Promise<void> | undefined
  function faded(source: Material) {
    let material = copies.get(source)
    if (!material) {
      material = source.clone()
      material.transparent = true
      material.depthWrite = false
      copies.set(source, material)
    }
    return material
  }
  const surfaces: { mesh: Mesh; original: Material | Material[]; faded: Material | Material[] }[] = []
  root.traverse(object => {
    if (object instanceof Mesh) surfaces.push({ mesh: object, original: object.material,
      faded: Array.isArray(object.material) ? object.material.map(faded) : faded(object.material) })
  })
  function restore() {
    for (const { mesh, original } of surfaces) mesh.material = original
  }
  return {
    prepare(renderer: WebGLRenderer, camera: Camera, scene: Scene) {
      if (preparation) return preparation
      if (disposed) return Promise.resolve()
      const lights: { object: Object3D; visible: boolean }[] = []
      scene.traverse(object => {
        if ('isLight' in object && object.userData.warmNightLight) lights.push({ object, visible: object.visible })
      })
      // compileAsync gathers materials synchronously. Restore the live scene before
      // awaiting the GPU so no frame sees a preparation material or lighting state.
      const materials = surfaces.map(surface => surface.mesh.material)
      const compiling: Promise<unknown>[] = []
      try {
        for (const surface of surfaces) surface.mesh.material = surface.faded
        compiling.push(renderer.compileAsync(root, camera, scene))
        if (lights.length) {
          for (const visible of [false, true]) {
            for (const light of lights) light.object.visible = visible
            compiling.push(renderer.compileAsync(root, camera, scene))
          }
        }
      } catch (error) {
        compiling.push(Promise.reject(error))
      } finally {
        surfaces.forEach((surface, index) => { surface.mesh.material = materials[index]! })
        for (const light of lights) light.object.visible = light.visible
      }
      preparation = Promise.all(compiling)
        .then(() => waitForScenePrograms(renderer, () => !disposed))
        .then(() => { if (!disposed) ready = true })
      return preparation
    },
    set(opacity: number) {
      // Late joiners keep the original material until their fade shaders are ready.
      if (!ready || disposed) return
      if (opacity === previous) return
      previous = opacity
      // Opaque/hidden states keep the original material; fade copies stay cached.
      if (opacity <= 0 || opacity >= 1) { restore(); return }
      for (const surface of surfaces) {
        surface.mesh.material = surface.faded
      }
      for (const [source, material] of copies) material.opacity = source.opacity * opacity
    },
    dispose() {
      disposed = true
      ready = false
      restore()
      for (const material of copies.values()) material.dispose()
      copies.clear()
      previous = 1
    },
  }
}
