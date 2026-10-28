import { expect, it } from 'vitest'
import { BoxGeometry, BufferGeometry, SphereGeometry, Scene, InstancedMesh, MeshLambertMaterial, Object3D, Matrix4, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { lowPolyPrimitive } from '../../src/world/art/lowPolyPrimitive'
import { propRenderBatches } from '../../src/world/art/propRenderBatches'
import { PropBuilder } from '../../src/world/art/propGeometry'
import { buildingParts } from '../../src/world/art/buildingParts'
import { capturePropBuilds } from '../../src/world/art/bakedProps'
import { parkTreeBatches } from '../../src/world/art/SimpleParkTrees'
import { CameraOcclusionFader } from '../../src/world/cameraOcclusion'

const triangles = (g: BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3
it('fades only the obstructing low-poly crown and restores its exact shared-batch transform', () => {
  const { parts, geometry } = parkTreeBatches[1]!, part = parts[0]!
  const scene = new Scene(), material = new MeshLambertMaterial()
  const mesh = new InstancedMesh(geometry, material, 2), transform = new Object3D()
  transform.position.set(...part.p); transform.scale.set(...part.s); transform.rotation.set(...(part.r ?? [0, 0, 0])); transform.updateMatrix()
  const original = transform.matrix.clone(), distant = original.clone().setPosition(part.p[0] + 40, part.p[1], part.p[2])
  mesh.setMatrixAt(0, original); mesh.setMatrixAt(1, distant); scene.add(mesh)
  const fader = new CameraOcclusionFader(), saved = new Matrix4()
  fader.refresh(scene)
  fader.update(new Vector3(part.p[0], part.p[1], part.p[2] + 10), new Vector3(part.p[0], part.p[1], part.p[2] - 10), true, 1)
  expect(mesh.children.filter(child => child.userData.cameraFadeProxy && child.visible)).toHaveLength(1)
  mesh.getMatrixAt(0, saved); expect(saved.elements[0]).toBe(0)
  mesh.getMatrixAt(1, saved); expect(saved.elements).toEqual(distant.elements.map(Math.fround))
  fader.update(new Vector3(), new Vector3(), false, 3)
  mesh.getMatrixAt(0, saved); expect(saved.elements).toEqual(original.elements.map(Math.fround))
  expect(mesh.children.every(child => !child.visible)).toBe(true)
  fader.dispose(); mesh.dispose(); material.dispose()
})
it('caps curved prop surfaces while retaining dimensions and partial-sphere coverage', () => {
  const sphere = new SphereGeometry(2, 32, 16, 0.3, 1.4, 0.2, 1.7)
  const simple = lowPolyPrimitive(sphere) as SphereGeometry
  expect(triangles(simple)).toBeLessThanOrEqual(64)
  for (const key of ['radius', 'phiStart', 'phiLength', 'thetaStart', 'thetaLength'] as const)
    expect(simple.parameters[key]).toBe(sphere.parameters[key])
  const small = new SphereGeometry(1, 6, 3)
  expect(lowPolyPrimitive(small)).toBe(small)
  sphere.dispose(); simple.dispose(); small.dispose()
})
it('uses twelve triangles for a prop block and leaves authored custom surfaces intact', () => {
  const source = new RoundedBoxGeometry(2, 3, 4, 2, 0.1)
  const block = lowPolyPrimitive(source) as BoxGeometry
  expect(triangles(block)).toBe(12)
  expect([block.parameters.width, block.parameters.height, block.parameters.depth]).toEqual([2, 3, 4])
  const custom = new BufferGeometry()
  expect(lowPolyPrimitive(custom)).toBe(custom)
  source.dispose(); block.dispose(); custom.dispose()
})
it('shares merged opaque finishes without absorbing two-sided roofs, solid stone or night glow', () => {
  const b = new PropBuilder()
  for (const kind of ['wood', 'metal', 'gold', 'paint', 'stone', 'tile', 'glow'] as const)
    b.box(kind, '#abcdef', [0, 0, 0], [1, 1, 1])
  const art = b.finish(), merged = propRenderBatches(art)
  expect(propRenderBatches(art)).toBe(merged)
  expect(Object.keys(merged).sort()).toEqual(['glow', 'paint', 'stone', 'tile'])
  expect(triangles(merged.paint!)).toBe(48)
  for (const kind of ['stone', 'tile', 'glow'] as const) expect(merged[kind]).toBe(art[kind])
  expect(Object.keys(art)).toHaveLength(7)
  Object.values(art).forEach(g => g.dispose()); merged.paint!.dispose()
})
it('keeps background facades within a fixed geometry budget as buildings get taller', () => {
  const parts = buildingParts({ w: 60, d: 40, h: 60 })
  expect(parts.stone).toHaveLength(4)
  expect(parts.metal.length + parts.glass.length + parts.stone.length).toBeLessThan(60)
  expect(parts.stone[0]!.s).toEqual([60, 60, 40])
})
it('keeps every baked pavilion roof and pagoda below the simplified surface budget', async () => {
  const records = capturePropBuilds()
  const pavilion = await import('../../src/world/art/Pavilion')
  const pagoda = await import('../../src/world/art/StonePagoda')
  pavilion.prebuildStaticSurfaces(); pagoda.prebuildStaticSurfaces()
  const roofs = [...records].filter(([name]) => name.startsWith('pavilion-roof-'))
  const pagodas = [...records].filter(([name]) => name.startsWith('pagoda-stone-'))
  expect(roofs).toHaveLength(2); expect(pagodas.length).toBeGreaterThan(0)
  for (const [, art] of roofs) expect(triangles(art.stone!)).toBeLessThanOrEqual(512)
  // The complete ten-storey silhouette is 6,012 triangles (previously 44,860).
  for (const [, art] of pagodas) expect(triangles(art.stone!)).toBeLessThanOrEqual(6500)
})
