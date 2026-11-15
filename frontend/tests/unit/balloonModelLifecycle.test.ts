import { useLayoutEffect } from 'react'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { expect, it, vi } from 'vitest'
import { useBalloonModel } from '../../src/features/balloon/useBalloonModel'

vi.mock('react', () => ({ useLayoutEffect: vi.fn() }))
vi.mock('../../park-renewal-preview/assetFactories', () => ({
  factory: () => {
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    return new Group().add(new Mesh(geometry, material), new Mesh(geometry, [material]))
  },
}))

function trackDisposal(model: Object3D) {
  const listeners = new Map<object, ReturnType<typeof vi.fn>>()
  model.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const resource of [object.geometry, ...[object.material].flat()]) {
      if (listeners.has(resource)) continue
      const disposed = vi.fn()
      listeners.set(resource, disposed)
      resource.addEventListener('dispose', disposed)
    }
  })
  expect(listeners.size).toBeGreaterThan(0)
  return [...listeners.values()]
}

it('detaches and disposes the old balloon before attaching a fresh one on effect replay', () => {
  const group = new Group()
  useBalloonModel({ current: group })
  const setup = vi.mocked(useLayoutEffect).mock.lastCall![0]
  expect(group.children).toHaveLength(0)

  const cleanup = setup()
  const first = group.children[0]!
  const firstResources = trackDisposal(first)
  cleanup!()
  expect(group.children).toHaveLength(0)
  for (const disposed of firstResources) expect(disposed).toHaveBeenCalledTimes(1)

  const cleanupReplay = setup()
  expect(group.children).toHaveLength(1)
  const second = group.children[0]!
  expect(second).not.toBe(first)
  const secondResources = trackDisposal(second)
  cleanupReplay!()
  for (const disposed of firstResources) expect(disposed).toHaveBeenCalledTimes(1)
  for (const disposed of secondResources) expect(disposed).toHaveBeenCalledTimes(1)
})
