import { expect, it } from 'vitest'
import { BoxGeometry, Color, Frustum, InstancedMesh, LOD, Group, Matrix4, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3 } from 'three'
import { BoundaryBatches, boundaryNear } from '../../src/world/art/boundaryBatches'
import { createWallRoof, createWallCorner, WALL } from '../../src/world/art/boundaryGeometry'
import { FadeBatchedMesh } from '../../src/world/art/FadeBatchedMesh'
import { CameraOcclusionFader } from '../../src/world/cameraOcclusion'
import { WORLD } from '../../src/config'

it('matches Three LOD selection and hysteresis in both directions', () => {
  const lod = new LOD(), near = new Group(), far = new Group(), camera = new PerspectiveCamera()
  lod.addLevel(near, 0); lod.addLevel(far, WALL.nearDistance, .16)
  let selected = false
  for (const distance of [80, 47, 45, 40, 38, 40, 45, 47, 40, 30]) {
    camera.position.set(0, 0, distance); camera.updateMatrixWorld(true); lod.update(camera)
    selected = boundaryNear(selected, distance)
    expect(selected).toBe(near.visible)
  }
})

it('packs the original wall geometry, colour and transforms into five submissions with stable near/far slots', () => {
  const near = createWallRoof(), far = createWallRoof(false), corner = createWallCorner()
  const batches = new BoundaryBatches(near, far, corner), matrix = new Matrix4()
  expect(batches.meshes).toHaveLength(5); expect(batches.sections).toHaveLength(32)
  expect(batches.meshes.map(m => m.instanceCount)).toEqual([36, 64, 324, 320, 164])
  const body = batches.meshes[0]!, span = (WORLD.halfSize * 2 - .9) / 8
  body.getMatrixAt(0, matrix)
  expect(matrix.elements[12]).toBeCloseTo(-WORLD.halfSize + .45 + span / 2, 5)
  expect(matrix.elements[13]).toBeCloseTo((WALL.bodyTop + WALL.base) / 2, 5)
  expect(matrix.elements[14]).toBeCloseTo(-WORLD.halfSize, 5)
  expect(matrix.elements[0]).toBeCloseTo(span, 5)
  const colors = new Color(); batches.meshes[1]!.getColorAt(0, colors)
  expect(colors.toArray()).toEqual(new Color('#999b95').toArray().map(Math.fround))
  const clay = batches.meshes[2]!
  expect(clay.sourceGeometryAt(0).attributes.position!.array).toEqual(near.clay.attributes.position!.array)
  expect(clay.sourceGeometryAt(5).attributes.position!.array).toEqual(far.clay.attributes.position!.array)
  batches.update(batches.sections[0]!.center)
  for (const v of batches.sections[0]!.variants) expect(v.mesh.getVisibleAt(v.id)).toBe(v.near !== false)
  batches.update(new Vector3(10000, 0, 0))
  for (const v of batches.sections[0]!.variants) expect(v.mesh.getVisibleAt(v.id)).toBe(v.near !== true)
  const camera = new PerspectiveCamera(55, 16 / 9, .1, 300)
  camera.position.set(0, 5, 0); camera.lookAt(0, 5, -WORLD.halfSize); camera.updateMatrixWorld(true)
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  batches.update(camera.position, 1, frustum)
  const inside = batches.sections.filter(s => s.visible), outside = batches.sections.filter(s => !s.visible)
  expect(inside.length).toBeGreaterThan(0); expect(outside.length).toBeGreaterThan(0)
  for (const s of outside) for (const v of s.variants) expect(v.mesh.getVisibleAt(v.id)).toBe(false)
  // Every original part fits the section bound, including both roof LODs.
  for (const s of batches.sections) for (const v of s.variants) {
    v.mesh.getMatrixAt(v.id, matrix)
    const geometry = v.mesh.sourceGeometryAt(v.id)
    geometry.computeBoundingBox()
    const bound = geometry.boundingBox!.clone().applyMatrix4(matrix)
    expect(s.bounds.clone().expandByScalar(.0001).containsBox(bound)).toBe(true)
  }
  batches.dispose(); batches.dispose()
  for (const g of [near.clay, near.timber, near.ends!, far.clay, far.timber, corner.clay, corner.ends]) g.dispose()
})

it('fades one batched part, hides the proxy with its LOD, restores its transform and survives cleanup order', () => {
  const source = new BoxGeometry(2, 2, 2), material = new MeshLambertMaterial()
  const mesh = new FadeBatchedMesh(2, 24, 36, material)
  const geometry = mesh.addGeometry(source), a = mesh.addInstance(geometry), b = mesh.addInstance(geometry)
  const original = new Matrix4(), distant = new Matrix4().makeTranslation(30, 0, 0), saved = new Matrix4()
  mesh.setMatrixAt(a, original); mesh.setMatrixAt(b, distant); mesh.setColorAt(a, new Color('#abcdef'))
  const scene = new Scene(); scene.add(mesh)
  const fader = new CameraOcclusionFader(); fader.refresh(scene)
  fader.update(new Vector3(0, 0, 5), new Vector3(0, 0, -5), true, 1)
  const proxy = mesh.children.find(o => o.userData.cameraFadeProxy) as InstancedMesh
  expect(proxy.visible).toBe(true); expect(mesh.children.filter(o => o.visible)).toHaveLength(1)
  mesh.getMatrixAt(a, saved); expect(saved.elements[0]).toBe(0)
  mesh.getMatrixAt(b, saved); expect(saved.equals(distant)).toBe(true)
  mesh.setVisibleAt(a, false); expect(proxy.visible).toBe(false)
  fader.update(new Vector3(), new Vector3(), false, 3)
  mesh.getMatrixAt(a, saved); expect(saved.equals(original)).toBe(true)
  mesh.setVisibleAt(a, true); expect(proxy.visible).toBe(false)
  fader.update(new Vector3(0, 0, 5), new Vector3(0, 0, -5), true, 1)
  mesh.dispose(); expect(() => fader.dispose()).not.toThrow(); material.dispose()
})
