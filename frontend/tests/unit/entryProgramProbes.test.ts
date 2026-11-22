import { expect, it, vi } from 'vitest'
import { DoubleSide, InstancedMesh, Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Scene, type WebGLRenderer } from 'three'
import { createEntryProgramProbes } from '../../src/world/entryProgramProbes'
import { prepareVisibleScenePrograms } from '../../src/world/prepareScene'

it('warms private variants without adding visible objects or mutating shared materials, and frees them once', async () => {
  const scene = new Scene(), source = new MeshLambertMaterial({ side: DoubleSide }), geometry = new PlaneGeometry()
  source.onBeforeCompile = vi.fn()
  source.customProgramCacheKey = () => 'retaining'
  const mesh = new Mesh(geometry, source); mesh.name = 'steep-bank-stone-retaining-faces'; scene.add(mesh)
  const probes = createEntryProgramProbes(scene)
  expect(scene.children).toEqual([mesh])
  expect(probes.objects).toHaveLength(6)
  expect(probes.objects.every(object => !object.parent)).toBe(true)
  const front = probes.objects[1]!.material
  expect(front.onBeforeCompile).toBe(source.onBeforeCompile)
  expect(front.customProgramCacheKey()).toBe('retaining')
  expect(source.side).toBe(DoubleSide)
  expect(probes.objects[0]!.material.transparent).toBe(true)
  expect(probes.objects[2]!.material.side).toBe(DoubleSide)
  const fitness = probes.objects[3]!
  expect(fitness).toBeInstanceOf(InstancedMesh)
  expect(fitness).toHaveProperty('instanceColor', null)
  expect((fitness.material as MeshLambertMaterial).vertexColors).toBe(false)
  const selected: unknown[] = []
  const renderer = { compile: (objects: Scene) => objects.traverse(object => selected.push(object)),
    getContext: () => ({ getExtension: () => null, isContextLost: () => false }),
  } as unknown as WebGLRenderer
  await prepareVisibleScenePrograms(renderer, scene, new PerspectiveCamera(), () => true, probes.objects)
  for (const probe of probes.objects) expect(selected).toContain(probe)
  const disposed = probes.objects.map(object => vi.spyOn(object.material, 'dispose'))
  const sourceDispose = vi.spyOn(source, 'dispose')
  probes.dispose(); probes.dispose()
  for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce()
  expect(sourceDispose).not.toHaveBeenCalled()
  expect(scene.children).toEqual([mesh])
  source.dispose(); geometry.dispose()
})
