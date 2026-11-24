import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { createChristmasTreeArt } from '../../src/features/winter/christmasTreeArt'
import { bulbCentres, setTreeLighting, treeLighting, TREE_WARM_WHITE } from '../../src/features/winter/community/treeLighting'

let tree: GLTF
beforeAll(async () => {
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
  const data = readFileSync(new URL('../../src/features/winter/community/assets/tree.glb', import.meta.url))
  tree = await new Promise<GLTF>((resolve, reject) => new ParkAssetLoader().parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', resolve, reject))
})
afterAll(() => vi.unstubAllGlobals())

describe('트리 웜화이트 발광', () => {
  it('실제 전구와 별 좌표를 트리 로컬 공간에서 찾아 배치나 부모 변환에 흔들리지 않는다', () => {
    const root = tree.scene.clone(true), parent = new Group()
    parent.position.set(12, 30, -40); parent.rotation.y = 1.1; parent.scale.setScalar(2)
    parent.add(root); parent.updateMatrixWorld(true)
    const lights = treeLighting(root), bounds = new Box3().setFromObject(tree.scene)
    expect(lights.bulbs.length).toBeGreaterThan(40)
    expect(new Set(lights.bulbs.map(p => p.toArray().join(','))).size).toBe(lights.bulbs.length)
    expect(lights.bulbs.every(p => bounds.containsPoint(p))).toBe(true)
    expect(lights.star!.y).toBeGreaterThan(11)
    expect(lights.star!.y).toBeLessThan(12.1)
    for (const material of lights.materials) material.dispose()
  })
  it('점등·소등이 인스턴스 재질에만 적용되고 원본과 다른 트리에 전파되지 않는다', () => {
    const a = treeLighting(tree.scene.clone(true)), b = treeLighting(tree.scene.clone(true))
    setTreeLighting(a.materials, true)
    expect(a.materials.every(m => m.emissive.getHexString() === TREE_WARM_WHITE.slice(1) && m.emissiveIntensity > 0 && !m.toneMapped)).toBe(true)
    expect(a.materials.some(m => m.name === 'Fine silver woven wire')).toBe(true)
    expect(b.materials.every(m => m.emissiveIntensity === 0)).toBe(true)
    tree.scene.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.name.includes('Emission')) {
        expect(object.material.emissive.getHex()).toBe(0)
      }
    })
    setTreeLighting(a.materials, false)
    expect(a.materials.every(m => m.emissiveIntensity === 0 && m.emissive.getHex() === 0 && m.toneMapped)).toBe(true)
    for (const material of [...a.materials, ...b.materials]) material.dispose()
  })
  it('기본 트리의 면별로 분리된 전구도 전구 하나당 광채 하나로 묶는다', () => {
    const art = createChristmasTreeArt(), centres = bulbCentres(art.glow!)
    expect(centres).toHaveLength(91)
    expect(centres.every(p => p.distanceTo(new Vector3(0, p.y, 0)) > .1)).toBe(true)
    for (const geometry of Object.values(art)) geometry?.dispose()
  })
})
