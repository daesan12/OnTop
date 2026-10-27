import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
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

it('fades all LOD materials without changing a peer that shares the same asset materials', () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial({ opacity: .8 })
  const near = new Mesh(geometry, material), far = new Mesh(geometry, [material]), peer = new Mesh(geometry, material)
  const originalArray = far.material
  const root = new Group().add(near, far)
  const opacity = createAvatarOpacity(root)
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

it('reuses private materials across visits and disposes only those copies on teardown', () => {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial()
  const mesh = new Mesh(geometry, material), sourceDispose = vi.spyOn(material, 'dispose')
  const opacity = createAvatarOpacity(mesh)
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
