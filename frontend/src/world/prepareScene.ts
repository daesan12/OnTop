import { Texture, Vector4, VideoTexture, type Camera, type Material, type Scene, type WebGLRenderer } from 'three'

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))
interface PreparationView { position: readonly [number, number, number]; target: readonly [number, number, number] }

/** Upload active geometry/instance buffers outside the current field of view.
 * A one-pixel scissor keeps the normal output colour space and shader variants,
 * unlike an offscreen render target. Keep the active lighting and camera intact. */
export function warmSceneGeometry(renderer: WebGLRenderer, scene: Scene, camera: Camera, views: readonly PreparationView[] = []) {
  const scissor = renderer.getScissor(new Vector4()), scissorTest = renderer.getScissorTest()
  const objects: { object: typeof scene.children[number]; visible: boolean; frustumCulled: boolean }[] = []
  scene.traverse(object => {
    objects.push({ object, visible: object.visible, frustumCulled: object.frustumCulled })
  })
  try {
    // Only game-owned preparation meshes opt in while hidden. Other inactive
    // effects/LODs keep their visibility and normal resource lifecycle.
    for (const { object } of objects) {
      if (object.userData.prepareWhenHidden) object.visible = true
      object.frustumCulled = false
    }
    renderer.setScissor(0, 0, 1, 1)
    renderer.setScissorTest(true)
    renderer.render(scene, camera)
    const preview = camera.clone()
    for (const view of views) {
      preview.position.set(...view.position); preview.lookAt(...view.target); preview.updateMatrixWorld(true)
      renderer.render(scene, preview)
    }
  } finally {
    for (const { object, visible, frustumCulled } of objects) Object.assign(object, { visible, frustumCulled })
    renderer.setScissor(scissor)
    renderer.setScissorTest(scissorTest)
  }
}

/** Upload shared maps while the GPU compiles, rather than serializing both
 * costs in the first draw. Yield between batches so auth/socket callbacks run. */
export async function prepareScene(
  renderer: WebGLRenderer, scene: Scene, camera: Camera, live: () => boolean,
  options: { warmGeometry?: boolean; warmLighting?: boolean; views?: readonly PreparationView[] } = {},
) {
  performance.mark('park-scene-prepare-start')
  const compile = () => {
    const compiling = [renderer.compileAsync(scene, camera)]
    if (options.warmLighting) {
      const lights: { object: typeof scene.children[number]; visible: boolean }[] = []
      scene.traverse(object => {
        if ('isLight' in object && object.userData.warmNightLight) lights.push({ object, visible: object.visible })
      })
      // Light counts are shader variants. Prepare dawn/dusk together, then restore
      // the live light pool synchronously, before another frame can observe it.
      const modes = lights.every(light => light.visible) ? [false] : lights.every(light => !light.visible) ? [true] : [false, true]
      try {
        if (lights.length) for (const visible of modes) {
          for (const light of lights) light.object.visible = visible
          compiling.push(renderer.compileAsync(scene, camera))
        }
      } finally {
        for (const light of lights) light.object.visible = light.visible
      }
      if (lights.length) compiling.push(renderer.compileAsync(scene, camera))
    }
    return Promise.all(compiling)
  }
  const compiling = compile()
  const textures = new Set<Texture>()
  const collect = (material: Material) => {
    for (const value of Object.values(material)) if (value instanceof Texture && !(value instanceof VideoTexture)) textures.add(value)
    if ('uniforms' in material) {
      for (const uniform of Object.values(material.uniforms as Record<string, { value: unknown }>))
        if (uniform.value instanceof Texture && !(uniform.value instanceof VideoTexture)) textures.add(uniform.value)
    }
  }
  const traverse = options.warmGeometry || options.warmLighting ? scene.traverse : scene.traverseVisible
  traverse.call(scene, object => {
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
  const waitForPrograms = async () => {
    const context = renderer.getContext()
    const parallel = context.getExtension('KHR_parallel_shader_compile')
    if (parallel) {
      while (live() && renderer.info.programs?.some(program => program.program
        && !context.getProgramParameter(program.program as WebGLProgram, parallel.COMPLETION_STATUS_KHR))) {
        await nextTurn()
      }
    }
  }
  await waitForPrograms()
  if (options.warmGeometry && live()) {
    warmSceneGeometry(renderer, scene, camera, options.views)
    // The first draw initializes morph/instance features on late/inactive meshes.
    // Cache their night variants too before the player can reveal them.
    if (options.warmLighting) await compile()
    await waitForPrograms()
    performance.mark('park-scene-buffers-ready')
  }
  performance.mark('park-scene-programs-ready')
}
