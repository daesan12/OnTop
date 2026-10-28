import { Texture, VideoTexture, type Camera, type Material, type Scene, type WebGLRenderer } from 'three'

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** Upload shared maps while the GPU compiles, rather than serializing both
 * costs in the first draw. Yield between batches so auth/socket callbacks run. */
export async function prepareScene(
  renderer: WebGLRenderer, scene: Scene, camera: Camera, live: () => boolean,
) {
  performance.mark('park-scene-prepare-start')
  const compiling = renderer.compileAsync(scene, camera)
  // This pass deliberately does not draw yet. Submit shader work now so GPU
  // compilation can run while the following texture uploads occupy the CPU.
  renderer.getContext().flush()
  const textures = new Set<Texture>()
  const collect = (material: Material) => {
    for (const value of Object.values(material)) if (value instanceof Texture && !(value instanceof VideoTexture)) textures.add(value)
    if ('uniforms' in material) {
      for (const uniform of Object.values(material.uniforms as Record<string, { value: unknown }>))
        if (uniform.value instanceof Texture && !(uniform.value instanceof VideoTexture)) textures.add(uniform.value)
    }
  }
  scene.traverseVisible(object => {
    if (!('material' in object)) return
    const material = object.material as Material | Material[]
    if (Array.isArray(material)) material.forEach(collect)
    else if (material) collect(material)
  })
  let batchStart = performance.now()
  for (const texture of textures) {
    if (!live()) return
    renderer.initTexture(texture)
    if (performance.now() - batchStart >= 8) {
      await nextTurn()
      batchStart = performance.now()
    }
  }
  performance.mark('park-scene-textures-ready')
  await compiling
  // compileAsync tracks one current program per material. A shared material can
  // also produce instanced/skinned variants; wait for every prepared program.
  const context = renderer.getContext()
  const parallel = context.getExtension('KHR_parallel_shader_compile')
  if (parallel) {
    while (live() && renderer.info.programs?.some(program => program.program
      && !context.getProgramParameter(program.program as WebGLProgram, parallel.COMPLETION_STATUS_KHR))) {
      await nextTurn()
    }
  }
  performance.mark('park-scene-programs-ready')
}
