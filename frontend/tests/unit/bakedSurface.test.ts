import { expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { capturePropBuilds, encodeBakedProps, installBakedProps } from '../../src/world/art/bakedProps'
import { mergeSurfaceParts, raycastStaticSurface } from '../../src/world/art/staticSurface'

it('restores static-surface triangle ranges and raycast openings with identical geometry', async () => {
  const records = capturePropBuilds()
  const box = new BoxGeometry()
  const batches = [{ geometry: box, strength: .2, parts: [
    { p: [-2, 0, 0] as [number, number, number], s: [1, 1, 1] as [number, number, number], c: '#aabbcc' },
    { p: [2, 0, 0] as [number, number, number], s: [1, 1, 1] as [number, number, number], c: '#aabbcc' },
  ] }]
  const original = mergeSurfaceParts(batches, [1, 1, 1], 'test-surface')
  const bytes = encodeBakedProps(records)
  await installBakedProps(bytes.buffer as ArrayBuffer)
  // A restored batch must not touch construction inputs again.
  const restored = mergeSurfaceParts([], [1, 1, 1], 'test-surface')
  expect(restored.index!.array).toEqual(original.index!.array)
  for (const name of Object.keys(original.attributes)) expect(restored.getAttribute(name).array).toEqual(original.getAttribute(name).array)
  const material = new MeshBasicMaterial()
  const hits = (geometry: typeof original, x: number) => {
    const mesh = new Mesh(geometry, material)
    mesh.raycast = raycastStaticSurface; mesh.updateMatrixWorld(true)
    return new Raycaster(new Vector3(x, 0, 5), new Vector3(0, 0, -1)).intersectObject(mesh).map(hit => hit.distance)
  }
  expect(hits(restored, 0)).toEqual([])
  expect(hits(restored, 2)).toEqual(hits(original, 2))
  expect(hits(restored, 2).length).toBeGreaterThan(0)
  box.dispose(); original.dispose(); restored.dispose(); material.dispose()
})
