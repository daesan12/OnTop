import { Color, DoubleSide, Float32BufferAttribute, FrontSide, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, type Material, type Scene } from 'three'
import { pigeonMaterial, pigeonShadowMaterial } from './pigeons/pigeonGeometry'

/** Compile known first-walk variants without constructing distant art.
 * Keep these private materials alive until canvas teardown so Three retains the programs. */
export function createEntryProgramProbes(scene: Scene) {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(geometry.attributes.position!.count * 3).fill(1), 3))
  const materials: Material[] = [
    new MeshBasicMaterial({ transparent: true }),
  ]
  const retaining = scene.getObjectByName('steep-bank-stone-retaining-faces') as Mesh | undefined
  if (retaining && !Array.isArray(retaining.material)) {
    const original = retaining.material, front = original.clone()
    front.side = FrontSide
    front.onBeforeCompile = original.onBeforeCompile
    front.customProgramCacheKey = original.customProgramCacheKey
    materials.push(front)
  }
  const objects = materials.map(material => new Mesh(geometry, material))
  // SurfaceMaterial's simplified, two-sided pagoda variant is not used by
  // entrance props. Compile it before distant buildings first become visible.
  const pagoda = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide })
  materials.push(pagoda); objects.push(new Mesh(geometry, pagoda))
  // Fitness walkers have instance matrices but neither vertex nor instance colours.
  const fitness = new MeshLambertMaterial({ flatShading: true })
  materials.push(fitness); objects.push(new InstancedMesh(geometry, fitness, 1))
  for (const source of [pigeonMaterial, pigeonShadowMaterial]) {
    const material = source.clone(), probe = new InstancedMesh(geometry, material, 1)
    probe.setColorAt(0, new Color('#ffffff'))
    materials.push(material); objects.push(probe)
  }
  let disposed = false
  return { objects, dispose() {
    if (disposed) return
    disposed = true
    objects.forEach(object => { if (object instanceof InstancedMesh) object.dispose() })
    materials.forEach(material => material.dispose()); geometry.dispose()
  } }
}
