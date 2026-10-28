import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Texture, type WebGLRenderer } from 'three'
import { prepareScene } from '../../src/world/prepareScene'

afterEach(() => vi.useRealTimers())

it('waits for every shared-material program variant while uploads overlap async compilation', async () => {
  vi.useFakeTimers()
  const scene = new Scene(), texture = new Texture(), material = new MeshBasicMaterial({map:texture})
  const geometry = new BoxGeometry()
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material))
  let releaseCompile!: () => void, secondReady = false, done = false
  const first = {}, second = {}
  const order: string[] = []
  const initTexture = vi.fn(() => order.push('upload'))
  const renderer = {
    compileAsync: () => new Promise<void>(resolve => { releaseCompile = resolve }),
    initTexture,
    info: {programs:[{program:first},{program:second}]},
    getContext: () => ({flush:()=>order.push('flush'),getExtension:()=>({COMPLETION_STATUS_KHR:0x91b1}),
      getProgramParameter:(program:unknown) => program === first || secondReady}),
  } as unknown as WebGLRenderer
  const pending = prepareScene(renderer, scene, new PerspectiveCamera(), () => true).then(()=>{done=true})
  expect(initTexture.mock.calls).toEqual([[texture]])
  expect(order).toEqual(['flush','upload'])
  releaseCompile()
  await vi.advanceTimersByTimeAsync(12)
  expect(done).toBe(false)
  secondReady = true
  await vi.runAllTimersAsync()
  await pending
  expect(done).toBe(true)
  geometry.dispose(); material.dispose(); texture.dispose()
})

it('supports renderers without parallel compilation and propagates compilation failures', async () => {
  const make = (failure?: Error) => ({
    compileAsync: () => failure ? Promise.reject(failure) : Promise.resolve(), initTexture:vi.fn(),
    getContext:()=>({flush:vi.fn(),getExtension:()=>null}),
  }) as unknown as WebGLRenderer
  await expect(prepareScene(make(), new Scene(), new PerspectiveCamera(),()=>true)).resolves.toBeUndefined()
  await expect(prepareScene(make(new Error('compile failed')), new Scene(), new PerspectiveCamera(),()=>true)).rejects.toThrow('compile failed')
})
