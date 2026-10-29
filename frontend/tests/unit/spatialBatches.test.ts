import { expect, it } from 'vitest'
import { Box3, Color, Frustum, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { SpatialBatches } from '../../src/world/art/SpatialBatches'
import { parkTreeBatches } from '../../src/world/art/SimpleParkTrees'
import { CameraOcclusionFader } from '../../src/world/cameraOcclusion'

it('retains every original tree triangle, transform and colour without owning the shared art', () => {
  const material = new MeshLambertMaterial(), mesh = new SpatialBatches(parkTreeBatches, material)
  expect(mesh.instanceCount).toBe(parkTreeBatches.reduce((n, b) => n + b.parts.length, 0))
  const matrix = new Matrix4(), object = new Object3D(), color = new Color()
  let id = 0
  for (const batch of parkTreeBatches) {
    const expected = batch.geometry.index ? batch.geometry.toNonIndexed() : batch.geometry.clone()
    const actual = mesh.sourceGeometryAt(id)
    expect(actual.attributes.position!.array).toEqual(expected.attributes.position!.array)
    expect(actual.attributes.normal!.array).toEqual(expected.attributes.normal!.array)
    for (const part of batch.parts) {
      object.position.set(...part.p); object.rotation.set(...(part.r ?? [0, 0, 0])); object.scale.set(...part.s); object.updateMatrix()
      mesh.getMatrixAt(id, matrix); mesh.getColorAt(id, color)
      expect(matrix.elements).toEqual(object.matrix.elements.map(Math.fround))
      expect(color.toArray()).toEqual(new Color(part.c).toArray().map(Math.fround))
      const key = `${Math.floor(part.p[0] / 24)}:${Math.floor(part.p[2] / 24)}`
      expect(mesh.sectors.get(key)!.bounds.clone().expandByScalar(.0001).containsBox(actual.boundingBox!.clone().applyMatrix4(matrix))).toBe(true)
      id++
    }
    expected.dispose()
  }
  const disposed: string[] = [], onSourceDispose = () => disposed.push('source')
  material.addEventListener('dispose', () => disposed.push('material'))
  for (const b of parkTreeBatches) b.geometry.addEventListener('dispose', onSourceDispose)
  mesh.dispose(); mesh.dispose(); expect(disposed).toEqual([])
  for (const b of parkTreeBatches) b.geometry.removeEventListener('dispose', onSourceDispose)
  material.dispose()
})

it('culls off-screen sectors conservatively and restores all entering parts after camera turns', () => {
  const material = new MeshLambertMaterial(), mesh = new SpatialBatches(parkTreeBatches, material)
  const camera = new PerspectiveCamera(55, 16 / 9, .1, 300), matrix = new Matrix4(), frustum = new Frustum()
  for (const look of [[0, 5, -100], [100, 5, 0], [0, 5, 100], [-100, 5, 0]]) {
    camera.position.set(0, 5, 0); camera.lookAt(...look as [number, number, number]); camera.updateMatrixWorld(true)
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    mesh.updateVisibility(frustum)
    expect([...mesh.sectors.values()].some(s => s.visible)).toBe(true)
    expect([...mesh.sectors.values()].some(s => !s.visible)).toBe(true)
    for (const sector of mesh.sectors.values()) for (const id of sector.ids) {
      expect(mesh.getVisibleAt(id)).toBe(sector.visible); mesh.getMatrixAt(id, matrix)
      const bound = new Box3().copy(mesh.sourceGeometryAt(id).boundingBox!).applyMatrix4(matrix)
      if (frustum.intersectsBox(bound)) expect(mesh.getVisibleAt(id)).toBe(true)
    }
  }
  mesh.dispose(); material.dispose()
})

it('fades only the obstructing crown across sector hide/show and restores its shared-batch transform', () => {
  const source = parkTreeBatches[1]!, part = source.parts[0]!, material = new MeshLambertMaterial()
  const mesh = new SpatialBatches([{ geometry: source.geometry, parts: [part, { ...part, p: [part.p[0] + 60, part.p[1], part.p[2]] }] }], material)
  const original = new Matrix4(); mesh.getMatrixAt(0, original)
  const scene = new Scene(); scene.add(mesh)
  const fader = new CameraOcclusionFader(); fader.refresh(scene)
  fader.update(new Vector3(part.p[0], part.p[1], part.p[2] + 10), new Vector3(part.p[0], part.p[1], part.p[2] - 10), true, 1)
  const proxies = mesh.children.filter(o => o.userData.cameraFadeProxy) as InstancedMesh[]
  expect(proxies.filter(p => p.visible)).toHaveLength(1)
  const saved = new Matrix4(); mesh.getMatrixAt(0, saved); expect(saved.elements[0]).toBe(0)
  mesh.setVisibleAt(0, false); expect(proxies[0]!.visible).toBe(false)
  fader.reset(); mesh.getMatrixAt(0, saved); expect(saved.equals(original)).toBe(true)
  mesh.setVisibleAt(0, true); expect(proxies[0]!.visible).toBe(false)
  fader.dispose(); mesh.dispose(); material.dispose()
})
