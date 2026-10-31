import * as THREE from 'three'

export type Surface = 'oak' | 'ceramic'

/** Counter and tableware reuse the existing shared atlas. Food has edible surfaces. */
export class SkewerSurfaces {
  private atlas: THREE.Texture | null = null
  private readonly maps: THREE.Texture[] = []
  private readonly materials = new Map<Surface, THREE.MeshStandardMaterial>()
  private disposed = false

  constructor(private readonly anisotropy: number, onError: () => void) {
    new THREE.TextureLoader().load(new URL('./art/material-atlas-v3.png', import.meta.url).href, loaded => {
      if (this.disposed) { loaded.dispose(); return }
      this.atlas = loaded
      loaded.colorSpace = THREE.SRGBColorSpace
      loaded.anisotropy = Math.min(this.anisotropy, 4)
      loaded.needsUpdate = true
      this.materials.forEach((material, surface) => this.applyMap(surface, material))
    }, undefined, () => { if (!this.disposed) onError() })
  }

  material(surface: Surface): THREE.MeshStandardMaterial {
    let material = this.materials.get(surface)
    if (material) return material
    material = new THREE.MeshStandardMaterial({
      color: { oak: '#c3976a', ceramic: '#e9e0ce' }[surface],
      roughness: surface === 'ceramic' ? 0.3 : 0.65,
    })
    this.materials.set(surface, material)
    if (this.atlas) this.applyMap(surface, material)
    return material
  }

  private applyMap(surface: Surface, material: THREE.MeshStandardMaterial): void {
    if (!this.atlas || material.map) return
    const index = { oak: 0, ceramic: 1 }[surface]
    const map = this.atlas.clone()
    // Small insets prevent neighbouring quadrants bleeding at mip boundaries.
    map.repeat.set(0.488, 0.488)
    map.offset.set((index % 2) * 0.5 + 0.006, index < 2 ? 0.506 : 0.006)
    map.needsUpdate = true
    this.maps.push(map)
    material.map = map
    material.color.set('#ffffff')
    material.needsUpdate = true
  }

  dispose(): void {
    this.disposed = true
    this.materials.forEach(material => material.dispose())
    this.maps.forEach(texture => texture.dispose())
    this.atlas?.dispose()
  }
}
