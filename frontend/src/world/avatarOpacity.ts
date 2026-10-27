import { Mesh, type Material, type Object3D } from 'three'

/** Shared asset materials stay immutable; only a fading avatar borrows private copies. */
export function createAvatarOpacity(root: Object3D) {
  const surfaces: { mesh: Mesh; original: Material | Material[]; faded?: Material | Material[] }[] = []
  root.traverse(object => {
    if (object instanceof Mesh) surfaces.push({ mesh: object, original: object.material })
  })
  const copies = new Map<Material, Material>()
  let previous = 1
  function restore() {
    for (const { mesh, original } of surfaces) mesh.material = original
  }
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
  return {
    set(opacity: number) {
      if (opacity === previous) return
      previous = opacity
      // Fully hidden avatars need no transparent materials or new shader programs.
      if (opacity <= 0 || opacity >= 1) { restore(); return }
      for (const surface of surfaces) {
        surface.faded ??= Array.isArray(surface.original) ? surface.original.map(faded) : faded(surface.original)
        surface.mesh.material = surface.faded
      }
      for (const [source, material] of copies) material.opacity = source.opacity * opacity
    },
    dispose() {
      restore()
      for (const material of copies.values()) material.dispose()
      copies.clear()
      for (const surface of surfaces) surface.faded = undefined
      previous = 1
    },
  }
}
