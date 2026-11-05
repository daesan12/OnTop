import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, type WebGLRenderer } from 'three'
import { bungeoppangReturnOpacity, bungeoppangView } from '../../src/features/bungeoppang/bungeoppangView'
import { createAvatarOpacity } from '../../src/world/avatarOpacity'

afterEach(() => {
  bungeoppangView.active = false
  bungeoppangView.returningUntil = 0
  vi.restoreAllMocks()
})

it('keeps the avatar hidden until the camera clears it, then smoothly reveals it over 320ms', () => {
  expect(bungeoppangReturnOpacity(100)).toBe(1)
  bungeoppangView.active = true
  expect(bungeoppangReturnOpacity(100)).toBe(0)
  bungeoppangView.active = false
  bungeoppangView.returningUntil = 340
  expect(bungeoppangReturnOpacity(339)).toBe(0)
  expect(bungeoppangReturnOpacity(340)).toBe(0)
  expect(bungeoppangReturnOpacity(500)).toBe(.5)
  expect(bungeoppangReturnOpacity(660)).toBe(1)
  expect(bungeoppangReturnOpacity(10000)).toBe(1)
  expect(bungeoppangReturnOpacity(341, true)).toBe(1)
  expect(bungeoppangReturnOpacity(339, true)).toBe(0)
})

const renderer = () => ({ compileAsync: vi.fn(() => Promise.resolve()),
  getContext: () => ({ getExtension: () => null }) }) as unknown as WebGLRenderer

it('fades all LOD materials without changing a peer that shares the same asset materials', async () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial({ opacity: .8 })
  const near = new Mesh(geometry, material), far = new Mesh(geometry, [material]), peer = new Mesh(geometry, material)
  const originalArray = far.material
  const root = new Group().add(near, far)
  const opacity = createAvatarOpacity(root)
  await opacity.prepare(renderer(), new PerspectiveCamera(), new Scene())
  opacity.set(0)
  expect(near.material).toBe(material)
  opacity.set(.25)
  expect(near.material).not.toBe(material)
  expect(near.material.opacity).toBe(.2)
  expect(near.material.transparent).toBe(true)
  expect(near.material.depthWrite).toBe(false)
  expect(far.material[0]).toBe(near.material)
  expect(peer.material).toBe(material)
  expect(peer.material.opacity).toBe(.8)
  expect(peer.material.transparent).toBe(false)
  opacity.set(1)
  expect(near.material).toBe(material)
  expect(far.material).toBe(originalArray)
  opacity.dispose(); material.dispose(); geometry.dispose()
})

it('reuses private materials across visits and disposes only those copies on teardown', async () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial()
  const mesh = new Mesh(geometry, material), sourceDispose = vi.spyOn(material, 'dispose')
  const opacity = createAvatarOpacity(mesh)
  await opacity.prepare(renderer(), new PerspectiveCamera(), new Scene())
  opacity.set(.5)
  const copy = mesh.material, copyDispose = vi.spyOn(copy, 'dispose')
  opacity.set(1); opacity.set(.75)
  expect(mesh.material).toBe(copy)
  expect(mesh.material.opacity).toBe(.75)
  opacity.dispose()
  expect(mesh.material).toBe(material)
  expect(copyDispose).toHaveBeenCalledOnce()
  expect(sourceDispose).not.toHaveBeenCalled()
  material.dispose(); geometry.dispose()
})

it('prepares a late avatar before overlap, restores live materials/lights immediately, and reuses the prepared shaders', async () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), clone = vi.spyOn(material, 'clone')
  const near = new Mesh(geometry, material), far = new Mesh(geometry, material), root = new Group().add(near, far)
  far.visible = false
  const scene = new Scene(), lamp = new PointLight(), camera = new PerspectiveCamera()
  lamp.visible = false; lamp.userData.warmNightLight = true; scene.add(root, lamp)
  const opacity = createAvatarOpacity(root), compiled: boolean[] = [], releases: (() => void)[] = []
  const gl = renderer()
  vi.spyOn(gl, 'compileAsync').mockImplementation((object, view, target) => {
    expect(object).toBe(root); expect(view).toBe(camera); expect(target).toBe(scene)
    expect(near.material).not.toBe(material); expect(near.material.transparent).toBe(true)
    expect(far.material).toBe(near.material); expect(far.visible).toBe(false)
    compiled.push(lamp.visible)
    return new Promise(resolve => releases.push(() => resolve(root)))
  })
  expect(clone).toHaveBeenCalledOnce()
  const pending = opacity.prepare(gl, camera, scene)
  expect(opacity.prepare(gl, camera, scene)).toBe(pending)
  expect(compiled).toEqual([false, false, true])
  expect(near.material).toBe(material); expect(far.material).toBe(material); expect(lamp.visible).toBe(false)
  opacity.set(.4)
  expect(near.material).toBe(material)
  releases.forEach(release => release()); await pending
  opacity.set(.4)
  expect(near.material.opacity).toBe(.4)
  opacity.set(1); opacity.set(.4)
  expect(clone).toHaveBeenCalledOnce()
  expect(gl.compileAsync).toHaveBeenCalledTimes(3)
  opacity.dispose(); material.dispose(); geometry.dispose()
})

it.each([false, true])('keeps the original avatar usable if shader preparation fails (synchronous: %s)', async synchronous => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), root = new Mesh(geometry, material)
  const opacity = createAvatarOpacity(root), gl = renderer(), scene = new Scene(), lamp = new PointLight()
  lamp.userData.warmNightLight = true; scene.add(root, lamp)
  vi.spyOn(gl, 'compileAsync').mockImplementation(() => {
    if (synchronous) throw new Error('compile failed')
    return Promise.reject(new Error('compile failed'))
  })
  await expect(opacity.prepare(gl, new PerspectiveCamera(), scene)).rejects.toThrow('compile failed')
  opacity.set(.4)
  expect(root.material).toBe(material); expect(lamp.visible).toBe(true)
  opacity.dispose(); material.dispose(); geometry.dispose()
})

it('does not reattach disposed fade materials when an avatar leaves during preparation', async () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), root = new Mesh(geometry, material)
  const opacity = createAvatarOpacity(root), gl = renderer()
  let release!: () => void
  vi.spyOn(gl, 'compileAsync').mockImplementation(() => new Promise(resolve => { release = () => resolve(root) }))
  const pending = opacity.prepare(gl, new PerspectiveCamera(), new Scene())
  opacity.dispose(); release(); await pending
  opacity.set(.4)
  expect(root.material).toBe(material)
  material.dispose(); geometry.dispose()
})
