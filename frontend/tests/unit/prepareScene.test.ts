import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, Texture, Vector4, type WebGLRenderer } from 'three'
import { prepareObjectTextures, prepareScene, prepareVisibleScenePrograms, warmSceneGeometry, waitForScenePrograms } from '../../src/world/prepareScene'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('skips nullish materials and array entries while still uploading valid shared maps once', async () => {
  vi.useFakeTimers()
  const scene = new Scene(), texture = new Texture(), material = new MeshBasicMaterial({ map: texture })
  scene.add(new Group(), Object.assign(new Group(), { material: null }),
    Object.assign(new Group(), { material: undefined }),
    Object.assign(new Group(), { material: [null, material, undefined, material] }))
  const initTexture = vi.fn(), renderer = { initTexture } as unknown as WebGLRenderer
  const pending = prepareObjectTextures(renderer, scene, () => true)
  await vi.runAllTimersAsync()
  await expect(pending).resolves.toBeUndefined()
  expect(initTexture.mock.calls).toEqual([[texture]])
  texture.dispose(); material.dispose()
})

it('includes opted-in off-camera entrance meshes but respects visibility and camera layers', async () => {
  const scene = new Scene(), camera = new PerspectiveCamera(60, 1, .1, 100)
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial()
  const inside = new Mesh(geometry, material); inside.position.z = -5
  const outside = inside.clone(); outside.position.x = 1000
  const opted = outside.clone(); opted.userData.prepareEntranceProgram = true
  const hidden = opted.clone(); hidden.visible = false
  const otherLayer = opted.clone(); otherLayer.layers.set(1)
  scene.add(inside, outside, opted, hidden, otherLayer)
  const selected: unknown[] = []
  const renderer = { compile: (objects: Group) => objects.traverse(object => selected.push(object)),
    getContext: () => ({ getExtension: () => null, isContextLost: () => false }),
  } as unknown as WebGLRenderer
  await prepareVisibleScenePrograms(renderer, scene, camera, () => true)
  expect(selected).toEqual([inside, opted])
  expect(opted.parent).toBe(scene)
  geometry.dispose(); material.dispose()
})

it('uploads streamed textures between display frames and skips remaining uploads after disposal', async () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length })
  const color = new Texture(), normal = new Texture(), geometry = new BoxGeometry()
  const material = new MeshStandardMaterial({ map: color, normalMap: normal })
  const initTexture = vi.fn(), renderer = { initTexture } as unknown as WebGLRenderer
  let live = true
  try {
    const pending = prepareObjectTextures(renderer, new Mesh(geometry, material), () => live)
    expect(initTexture).not.toHaveBeenCalled()
    frames.shift()!(0); await Promise.resolve()
    expect(initTexture.mock.calls).toEqual([[color]])
    live = false; frames.shift()!(16); await pending
    expect(initTexture).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals(); color.dispose(); normal.dispose(); geometry.dispose(); material.dispose()
  }
})

it('waits for every shared-material program variant while uploads overlap async compilation', async () => {
  vi.useFakeTimers()
  const scene = new Scene(), texture = new Texture(), material = new MeshBasicMaterial({map:texture})
  const geometry = new BoxGeometry()
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material))
  let releaseCompile!: () => void, secondReady = false, done = false
  const first = {}, second = {}
  const getUniforms = vi.fn(), getAttributes = vi.fn()
  const initTexture = vi.fn()
  const renderer = {
    compileAsync: () => new Promise<void>(resolve => { releaseCompile = resolve }),
    initTexture,
    info: {programs:[{program:first,getUniforms,getAttributes},{program:second,getUniforms,getAttributes}]},
    getContext: () => ({isContextLost:()=>false,getExtension:()=>({COMPLETION_STATUS_KHR:0x91b1}),
      getProgramParameter:(program:unknown) => program === first || secondReady}),
  } as unknown as WebGLRenderer
  const pending = prepareScene(renderer, scene, new PerspectiveCamera(), () => true).then(()=>{done=true})
  expect(initTexture.mock.calls).toEqual([[texture]])
  releaseCompile()
  await vi.advanceTimersByTimeAsync(12)
  expect(done).toBe(false)
  secondReady = true
  await vi.runAllTimersAsync()
  await pending
  expect(done).toBe(true)
  expect(getUniforms).toHaveBeenCalledTimes(2)
  expect(getAttributes).toHaveBeenCalledTimes(2)
  geometry.dispose(); material.dispose(); texture.dispose()
})

it('reflects bindings once per linked program, yields between programs and cancels on disposal', async () => {
  vi.useFakeTimers()
  let live = true
  const programs = Array.from({ length: 2 }, () => ({ getUniforms: vi.fn(), getAttributes: vi.fn() }))
  const renderer = { info: { programs }, getContext: () => ({
    isContextLost: () => false, getExtension: () => null,
  }) } as unknown as WebGLRenderer
  const pending = waitForScenePrograms(renderer, () => live)
  expect(programs[0]!.getUniforms).toHaveBeenCalledOnce()
  expect(programs[1]!.getUniforms).not.toHaveBeenCalled()
  live = false; await vi.runAllTimersAsync(); await pending
  expect(programs[1]!.getUniforms).not.toHaveBeenCalled()
  live = true
  const resumed = waitForScenePrograms(renderer, () => live)
  await vi.runAllTimersAsync(); await resumed
  for (const program of programs) {
    expect(program.getUniforms).toHaveBeenCalledOnce()
    expect(program.getAttributes).toHaveBeenCalledOnce()
  }
})

it('supports renderers without parallel compilation and propagates compilation failures', async () => {
  const make = (failure?: Error) => ({
    compileAsync: () => failure ? Promise.reject(failure) : Promise.resolve(), initTexture:vi.fn(),
    getContext:()=>({getExtension:()=>null,isContextLost:()=>false}),
  }) as unknown as WebGLRenderer
  await expect(prepareScene(make(), new Scene(), new PerspectiveCamera(),()=>true)).resolves.toBeUndefined()
  await expect(prepareScene(make(new Error('compile failed')), new Scene(), new PerspectiveCamera(),()=>true)).rejects.toThrow('compile failed')
})

it('uploads maps on hidden LODs before a camera turn reveals them', async () => {
  const texture = new Texture(), material = new MeshBasicMaterial({map:texture}), geometry = new BoxGeometry()
  const scene = new Scene(), hidden = new Group(); hidden.visible = false
  hidden.add(new Mesh(geometry, material)); scene.add(hidden)
  const initTexture = vi.fn(), renderer = {
    compileAsync: () => Promise.resolve(), initTexture, getContext:()=>({getExtension:()=>null,isContextLost:()=>false}),
  } as unknown as WebGLRenderer
  await prepareScene(renderer, scene, new PerspectiveCamera(), () => true, {warmLighting:true})
  expect(initTexture.mock.calls).toEqual([[texture]])
  expect(hidden.visible).toBe(false)
  texture.dispose(); material.dispose(); geometry.dispose()
})

it.each([false, true])('warms all views with unchanged lighting and restores the scene/scissor even after failure: %s', failure => {
  const scene = new Scene(), hidden = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial()
  const mesh = new Mesh(geometry, material), lamp = new PointLight(), camera = new PerspectiveCamera()
  hidden.visible = false; hidden.add(mesh, lamp); scene.add(hidden)
  const scissor = new Vector4(3, 4, 500, 400), setScissor = vi.fn(), setScissorTest = vi.fn()
  const render = vi.fn((actualScene, actualCamera) => {
    expect(actualScene).toBe(scene); expect(actualCamera).toBe(camera)
    expect(hidden.visible).toBe(false); expect(mesh.visible).toBe(true); expect(mesh.frustumCulled).toBe(false)
    // Inactive effects/LODs and their lighting stay hidden during the upload pass.
    expect(lamp.visible).toBe(true)
    if (failure) throw new Error('warm failed')
  })
  const renderer = {getScissor:(out:Vector4)=>out.copy(scissor),getScissorTest:()=>true,setScissor,setScissorTest,render} as unknown as WebGLRenderer
  if (failure) expect(()=>warmSceneGeometry(renderer,scene,camera)).toThrow('warm failed')
  else warmSceneGeometry(renderer,scene,camera)
  expect(render).toHaveBeenCalledOnce()
  expect(hidden.visible).toBe(false); expect(mesh.visible).toBe(true); expect(mesh.frustumCulled).toBe(true); expect(lamp.visible).toBe(true)
  expect(setScissor.mock.calls).toEqual([[0,0,1,1],[scissor]])
  expect(setScissorTest.mock.calls).toEqual([[true],[true]])
  geometry.dispose(); material.dispose()
})

it.each([false, true])('prepares both light-count variants and restores the live pool after compilation: %s', failure => {
  const scene = new Scene(), pooled = new PointLight(), other = new PointLight()
  pooled.userData.warmNightLight = true; pooled.visible = false; scene.add(pooled, other)
  const compileAsync = vi.fn(() => {
    expect(other.visible).toBe(true)
    return failure && pooled.visible ? Promise.reject(new Error('night compile failed')) : Promise.resolve()
  })
  const renderer = {compileAsync,initTexture:vi.fn(),getContext:()=>({getExtension:()=>null,isContextLost:()=>false})} as unknown as WebGLRenderer
  const pending = prepareScene(renderer, scene, new PerspectiveCamera(), () => true, {warmLighting:true})
  expect(pooled.visible).toBe(false); expect(other.visible).toBe(true)
  expect(compileAsync).toHaveBeenCalledTimes(3)
  return failure ? expect(pending).rejects.toThrow('night compile failed') : expect(pending).resolves.toBeUndefined()
})

it('prepares course prop LODs with cloned cameras and leaves the player camera unchanged', () => {
  const scene = new Scene(), camera = new PerspectiveCamera(), seen: number[][] = []
  camera.position.set(1, 2, 3); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true)
  const rotation = camera.quaternion.toArray(), projection = camera.projectionMatrix.toArray()
  const renderer = {
    getScissor:(out:Vector4)=>out.set(0,0,800,600),getScissorTest:()=>false,setScissor:vi.fn(),setScissorTest:vi.fn(),
    render:(_scene:Scene,view:PerspectiveCamera)=>seen.push(view.position.toArray()),
  } as unknown as WebGLRenderer
  warmSceneGeometry(renderer, scene, camera, [
    {position:[20,3,15],target:[20,1,10]}, {position:[-10,40,5],target:[-10,38,0]},
  ])
  expect(seen).toEqual([[1,2,3],[20,3,15],[-10,40,5]])
  expect(camera.position.toArray()).toEqual([1,2,3])
  expect(camera.quaternion.toArray()).toEqual(rotation)
  expect(camera.projectionMatrix.toArray()).toEqual(projection)
})

it('prepares the shader features initialized by the first upload before presenting the scene', async () => {
  const scene = new Scene(), light = new PointLight(), stages: boolean[] = []
  light.visible = false; light.userData.warmNightLight = true; scene.add(light)
  let uploaded = false
  const renderer = {
    compileAsync:()=>{stages.push(uploaded);return Promise.resolve()}, initTexture:vi.fn(),
    getContext:()=>({getExtension:()=>null,isContextLost:()=>false}), getScissor:(out:Vector4)=>out.set(0,0,800,600),
    getScissorTest:()=>false,setScissor:vi.fn(),setScissorTest:vi.fn(),render:()=>{uploaded=true},
  } as unknown as WebGLRenderer
  await prepareScene(renderer,scene,new PerspectiveCamera(),()=>true,{warmGeometry:true,warmLighting:true})
  expect(stages).toEqual([false,false,false,true,true,true])
  expect(light.visible).toBe(false)
})

it('stops on context loss even while compileAsync itself remains pending', async () => {
  vi.useFakeTimers()
  let lost = false
  const getProgramParameter = vi.fn(() => null)
  const renderer = { getContext: () => ({ isContextLost: () => lost,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }), getProgramParameter }),
    info: { programs: [{ program: {} }] } } as unknown as WebGLRenderer
  const pending = waitForScenePrograms(renderer, () => true, new Promise(() => {}))
  const assertion = expect(pending).rejects.toThrow('컨텍스트가 유실')
  lost = true
  await vi.advanceTimersByTimeAsync(10); await assertion
  expect(getProgramParameter).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds unfinished program polling even when the driver never completes a shader', async () => {
  vi.useFakeTimers()
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  const renderer = { getContext: () => ({ isContextLost: () => false,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }), getProgramParameter: () => null }),
    info: { programs: [{ program: {} }] } } as unknown as WebGLRenderer
  const assertion = expect(waitForScenePrograms(renderer, () => true)).rejects.toThrow('대기 시간을 초과')
  now.mockReturnValue(30_001)
  await vi.advanceTimersByTimeAsync(10); await assertion
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels a pending compilation wait when its owner is disposed', async () => {
  vi.useFakeTimers()
  let live = true
  const renderer = { getContext: () => ({ isContextLost: () => false, getExtension: () => null }) } as unknown as WebGLRenderer
  const pending = waitForScenePrograms(renderer, () => live, new Promise(() => {}))
  live = false
  await vi.advanceTimersByTimeAsync(10)
  await expect(pending).resolves.toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
})
