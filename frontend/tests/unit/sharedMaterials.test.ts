import { expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, Vector3 } from 'three'
import { attachSharedMaterial, sharedInstanceMaterial, sharedOutdoorMetal, sharedSurfaceMaterial } from '../../src/world/art/sharedMaterials'
import { CameraOcclusionFader } from '../../src/world/cameraOcclusion'

it('shares equal immutable surface settings and separates rendering variants', () => {
  const source = sharedSurfaceMaterial('wood', '#ffffff', 0, false, false)
  expect(sharedSurfaceMaterial('wood', '#ffffff', 0, false, false)).toBe(source)
  for (const other of [
    sharedSurfaceMaterial('stone', '#ffffff', 0, false, false),
    sharedSurfaceMaterial('wood', '#aabbcc', 0, false, false),
    sharedSurfaceMaterial('wood', '#ffffff', 2, false, false),
    sharedSurfaceMaterial('wood', '#ffffff', 0, true, false),
    sharedSurfaceMaterial('wood', '#ffffff', 0, false, true),
  ]) expect(other).not.toBe(source)
  const expected = new MeshLambertMaterial({ color: '#ffffff', side: 0, vertexColors: false, polygonOffset: false, polygonOffsetFactor: 0, polygonOffsetUnits: -1 })
  const settings = (m: MeshLambertMaterial) => { const {uuid: _id, ...json} = m.toJSON(); return json }
  expect(settings(source)).toEqual(settings(expected)); expected.dispose()
  expect(sharedInstanceMaterial.roughness).toBe(.88)
  expect(sharedOutdoorMetal('iron', false)).toBe(sharedOutdoorMetal('iron', false))
  expect(sharedOutdoorMetal('brass', false).metalness).toBe(.15)
  expect(sharedOutdoorMetal('painted', true).vertexColors).toBe(true)
})

it('fades one mesh without mutating its shared surface or disposing it during cleanup', () => {
  for (const material of [sharedSurfaceMaterial('wood', '#ffffff', 0, false, false), sharedInstanceMaterial, sharedOutdoorMetal('iron', false)]) {
    const geometry = new BoxGeometry(2, 2, 2), scene = new Group()
    const first = new InstancedMesh(geometry, material, 1), second = new InstancedMesh(geometry, material, 1)
    first.setMatrixAt(0, new Matrix4()); second.setMatrixAt(0, new Matrix4().makeTranslation(20, 0, 0)); scene.add(first, second)
    const fader = new CameraOcclusionFader(); fader.refresh(scene)
    fader.update(new Vector3(0, 0, 5), new Vector3(0, 0, -5), true, 1)
    const proxy = first.children.find(o => o.userData.cameraFadeProxy) as InstancedMesh
    expect(proxy.visible).toBe(true); expect(proxy.material).not.toBe(material)
    expect(first.material).toBe(material); expect(second.material).toBe(material)
    expect(material.transparent).toBe(false); expect(material.opacity).toBe(1)
    let disposed = false; const listener = () => { disposed = true }; material.addEventListener('dispose', listener)
    fader.dispose(); first.dispose(); second.dispose(); geometry.dispose()
    expect(disposed).toBe(false); material.removeEventListener('dispose', listener)
    expect(material).toBeInstanceOf(material.type === 'MeshLambertMaterial' ? MeshLambertMaterial : MeshStandardMaterial)
  }
})

it('separates mesh shader variants, shares equal variants and restores the prior attachment', () => {
  const source = sharedSurfaceMaterial('wood', '#ffffff', 0, false, false), geometry = new BoxGeometry()
  const plain = new Mesh(geometry), first = new InstancedMesh(geometry, undefined, 1), second = new InstancedMesh(geometry, undefined, 1)
  const prior = plain.material, restore = attachSharedMaterial(plain, source)
  const releaseFirst = attachSharedMaterial(first, source), releaseSecond = attachSharedMaterial(second, source)
  expect(first.material).toBe(second.material); expect(first.material).not.toBe(plain.material)
  const otherGeometry = geometry.clone(), other = new InstancedMesh(otherGeometry, undefined, 1)
  const releaseOther = attachSharedMaterial(other, source)
  expect(other.material).not.toBe(first.material)
  second.receiveShadow = true; const releaseShadow = attachSharedMaterial(second, source)
  expect(second.material).not.toBe(first.material)
  expect((first.material as MeshLambertMaterial).color.toArray()).toEqual(source.color.toArray())
  releaseShadow(); expect(second.material).toBe(first.material)
  restore(); expect(plain.material).toBe(prior)
  releaseFirst(); releaseSecond(); geometry.dispose()
  for (const material of Array.isArray(prior) ? prior : [prior]) material.dispose()
  releaseOther(); other.dispose(); otherGeometry.dispose(); first.dispose(); second.dispose()
})
