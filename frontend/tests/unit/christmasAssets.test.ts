import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { AnimationMixer, Box3, SkinnedMesh, Vector3 } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { createChristmasInstance } from '../../src/features/winter/ChristmasAssets'
import { christmasCollision } from '../../src/features/winter/christmasCollision'
import { WINTER_DECOR } from '../../src/features/winter/plan'
import manifest from '../../src/features/winter/assets/manifest.json'

const bytes = (id: string) => readFileSync(new URL(`../../src/features/winter/assets/${id}.glb`, import.meta.url))
const gltfJson = (id: string) => { const data = bytes(id); return JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12))) }

describe('승인한 크리스마스 에셋', () => {
  beforeAll(() => {
    // Geometry/skin imports use real GLB bytes. Texture pixels are covered by browser rendering.
    vi.stubGlobal('self', globalThis)
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('ProgressEvent', class { constructor(public type: string, public data: unknown) {} })
  })
  afterAll(() => vi.unstubAllGlobals())

  it('적용 파일은 승인 패키지의 해시와 일치하고 별과 줄조명은 기본 소등이다', () => {
    for (const asset of manifest.assets) expect(createHash('sha256').update(bytes(asset.id)).digest('hex')).toBe(asset.sha256)
    const tree = gltfJson('tree')
    for (const name of ['MAT_Star_Emission', 'MAT_StringBulb_Emission']) {
      const material = tree.materials.find((m: { name: string }) => m.name === name)
      expect(material).toBeDefined(); expect(material.emissiveFactor ?? [0, 0, 0]).toEqual([0, 0, 0])
    }
    expect(manifest.assets.find(a => a.id === 'tree')!.dimensions_metres[1]).toBe(12)
  })

  it('기존 장식 좌표와 눈 줍기 여유를 유지하고 새 충돌체는 모델의 지면부터 꼭대기까지 포함한다', () => {
    expect(WINTER_DECOR.map(d => [d.id, d.x, d.z, d.radius])).toEqual([
      ['plaza-tree', 0, 38, 2.5], ['santa', 4, 42, 1], ['entry-snowman', -5, 98, .85],
      ['plaza-snowman', 0, 48, .85], ['lake-snowman', 47, 33, .85],
      ['tree-gifts', -3.7, 38, 1.25], ['plaza-gifts', 3.7, 36, 1.25],
    ])
    for (const id of ['tree', 'santa', 'snowman']) {
      const hull = christmasCollision(id), height = manifest.assets.find(a => a.id === id)!.dimensions_metres[1]!
      const ys = hull.vertices.filter((_, i) => i % 3 === 1)
      expect(hull.vertices.length % 3).toBe(0)
      expect(hull.vertices.every(Number.isFinite)).toBe(true)
      expect(Math.min(...ys)).toBeCloseTo(0, 3); expect(Math.max(...ys)).toBeCloseTo(height, 3)
    }
    expect(christmasCollision('gifts')).toBeUndefined()
  })

  it('실제 루돌프 GLB 6개는 형상을 공유하고 독립 스켈레톤으로 정상 크기의 0.8초 달리기를 반복한다', async () => {
    const data = bytes('rudolph')
    const gltf = await new Promise<GLTF>((resolve, reject) => new ParkAssetLoader().parse(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', resolve, reject))
    const instances = Array.from({ length: 6 }, () => createChristmasInstance(gltf, 'rudolph'))
    const skeletons = new Set(), geometry = new Set()
    for (const root of instances) {
      root.updateMatrixWorld(true)
      expect(new Box3().setFromObject(root, true).getSize(new Vector3()).y).toBeCloseTo(2.4, 1)
      root.traverse(o => { if (o instanceof SkinnedMesh) { skeletons.add(o.skeleton); geometry.add(o.geometry) } })
    }
    expect(skeletons.size).toBe(6); expect(geometry.size).toBe(5)
    const clip = gltf.animations[0]!
    expect(clip.duration).toBeCloseTo(.8, 3)
    const root = instances[0]!, mixer = new AnimationMixer(root)
    mixer.clipAction(clip).play(); mixer.setTime(.2); root.updateMatrixWorld(true)
    const first = root.getObjectByName('tripoRoot') ?? root.getObjectByName('tripo::Root')
    expect(first).toBeDefined()
    const at = first?.position.clone()
    expect(new Box3().setFromObject(root, true).getSize(new Vector3()).y).toBeLessThan(3)
    mixer.setTime(1); root.updateMatrixWorld(true)
    if (first && at) expect(first.position.distanceTo(at)).toBeLessThan(.0001)
    mixer.stopAllAction()
  }, 20000)
})
