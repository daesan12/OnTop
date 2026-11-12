import { Frustum, Matrix4, Object3D, Sprite, Texture, Vector4, VideoTexture, type Camera, type Material, type Scene, type WebGLRenderer } from 'three'

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const PROGRAM_TIMEOUT_MS = 30_000
interface PreparationView { position: readonly [number, number, number]; target: readonly [number, number, number] }

export async function prepareVisibleScenePrograms(renderer: WebGLRenderer, scene: Scene, camera: Camera, live: () => boolean) {
  scene.updateMatrixWorld()
  camera.updateWorldMatrix(true, false)
  const view = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const frustum = new Frustum().setFromProjectionMatrix(view, camera.coordinateSystem, camera.reversedDepth)
  const visible: Object3D[] = []
  scene.traverseVisible(object => {
    if (!('material' in object) || !object.layers.test(camera.layers)) return
    if (object.frustumCulled && !(object instanceof Sprite ? frustum.intersectsSprite(object) : frustum.intersectsObject(object))) return
    visible.push(object)
  })
  // Three's compile traverses every child even if hidden or outside the camera.
  // Give it the first camera's objects without reparenting any live meshes.
  const selection = new Object3D()
  selection.traverse = visit => visible.forEach(visit)
  // compileAsync has its own poller. The shared wait below also checks all
  // programs, including variants that share a material. Check them once.
  renderer.compile(selection, camera, scene)
  await waitForScenePrograms(renderer, live)
  if (live()) performance.mark('park-gate-shaders-ready')
}

/** A shared material may compile more than its current LOD/skinning program. */
export async function waitForScenePrograms(renderer: WebGLRenderer, live: () => boolean, compilation?: Promise<unknown>) {
  const context = renderer.getContext()
  const parallel = context.getExtension('KHR_parallel_shader_compile')
  const status = { pending: !!compilation, failed: false, error: undefined as unknown }
  // Guard compileAsync's own pending promise as well as the remaining LOD programs.
  compilation?.then(() => { status.pending = false }, error => {
    status.pending = false; status.failed = true; status.error = error
  })
  const started = performance.now()
  while (live()) {
    if (context.isContextLost()) throw new Error('WebGL 컨텍스트가 유실되어 셰이더 준비를 중단했습니다.')
    if (status.failed) throw status.error
    if (!status.pending && (!parallel || !renderer.info.programs?.some(program => program.program
      && !context.getProgramParameter(program.program as WebGLProgram, parallel.COMPLETION_STATUS_KHR)))) return
    if (performance.now() - started >= PROGRAM_TIMEOUT_MS) throw new Error('셰이더 준비 대기 시간을 초과했습니다.')
    await new Promise<void>(resolve => setTimeout(resolve, 10))
  }
}

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
      for (const uniform of Object.values(material.uniforms as Record<string, { value: unknown }>)) {
        if (uniform.value instanceof Texture && !(uniform.value instanceof VideoTexture)) textures.add(uniform.value)
      }
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
  // compileAsync tracks one current program per material. A shared material can
  // also produce instanced/skinned variants; wait for every prepared program.
  await waitForScenePrograms(renderer, live, compiling)
  if (!live()) return
  if (options.warmGeometry && live()) {
    warmSceneGeometry(renderer, scene, camera, options.views)
    // The first draw initializes morph/instance features on late/inactive meshes.
    // Cache their night variants too before the player can reveal them.
    await waitForScenePrograms(renderer, live, options.warmLighting ? compile() : undefined)
    if (!live()) return
    performance.mark('park-scene-buffers-ready')
  }
  performance.mark('park-scene-programs-ready')
}
