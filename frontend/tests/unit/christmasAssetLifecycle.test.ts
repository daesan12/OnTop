import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, extend, type RootState } from '@react-three/fiber'
import { readFileSync } from 'node:fs'
import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type WebGLRenderer } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { ChristmasAsset, ChristmasRudolph } from '../../src/features/winter/ChristmasAssets'
import { Reins } from '../../src/features/winter/sleigh/Reins'
import { createReinAnchors } from '../../src/features/winter/sleigh/reinAnchors'

extend({ Group, InstancedMesh, CylinderGeometry, MeshStandardMaterial })
const cleanups: (() => Promise<void>)[] = []
let rudolph: GLTF, sleigh: GLTF
beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
  vi.stubGlobal('ProgressEvent', class { constructor(public type: string, public data: unknown) {} })
  const parse = async (id: string) => {
    const data = readFileSync(new URL(`../../src/features/winter/assets/${id}.glb`, import.meta.url))
    return new Promise<GLTF>((resolve, reject) => new ParkAssetLoader().parse(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', resolve, reject))
  }
  ;[rudolph, sleigh] = await Promise.all([parse('rudolph'), parse('sleigh')])
}, 20000)
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
afterAll(() => vi.unstubAllGlobals())

async function renderer() {
  const root = createRoot({ width: 1, height: 1 } as HTMLCanvasElement)
  let state!: RootState
  await root.configure({
    gl: { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() } as unknown as WebGLRenderer,
    size: { width: 1, height: 1, top: 0, left: 0 }, frameloop: 'never', dpr: 1,
    onCreated: value => { state = value },
  })
  cleanups.push(async () => { await act(async () => root.unmount()) })
  return { get state() { return state },
    async mount(node: ReactNode) { await act(async () => { root.render(node) }) },
    // Deliberately do not refresh world matrices: callbacks must be correct
    // before WebGLRenderer performs its normal end-of-frame matrix update.
    async tick(time: number) { await act(async () => { state.advance(time) }) },
  }
}
const placeholder = () => h('group', { name: 'asset-fallback' })
const fakeGltf = () => ({ scene: new Group(), animations: [] }) as unknown as GLTF

describe('크리스마스 모델 로딩과 연결점 수명주기', () => {
  it('공유 요청이 실패하면 재마운트에서 한 번 다시 요청하고 성공 결과를 재사용한다', async () => {
    let reject!: (error: Error) => void
    const load = vi.spyOn(ParkAssetLoader.prototype, 'loadAsync')
      .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
      .mockResolvedValue(fakeGltf())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = await renderer()
    const pair = () => h('group', null, ...[0, 1].map(key => h(ChristmasAsset, { key, id: 'tree', fallback: placeholder() })))
    await view.mount(pair())
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('temporary network failure')))
    expect(view.state.scene.getObjectsByProperty('name', 'asset-fallback')).toHaveLength(2)
    await view.mount(null); await view.mount(pair())
    expect(load).toHaveBeenCalledTimes(2)
    expect(view.state.scene.getObjectsByProperty('name', 'approved-christmas-tree')).toHaveLength(2)
    await view.mount(null); await view.mount(pair())
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('컴포넌트가 먼저 언마운트된 뒤 거부된 요청도 다음 마운트를 막지 않는다', async () => {
    let reject!: (error: Error) => void
    const load = vi.spyOn(ParkAssetLoader.prototype, 'loadAsync')
      .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
      .mockResolvedValue(fakeGltf())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = await renderer()
    const model = () => h(ChristmasAsset, { id: 'snowman', fallback: placeholder() })
    await view.mount(model()); await view.mount(null)
    await act(async () => reject(new Error('late failure')))
    expect(warn.mock.calls.filter(([message]) => String(message).includes('크리스마스 모델'))).toHaveLength(0)
    await view.mount(model())
    expect(load).toHaveBeenCalledTimes(2)
    expect(view.state.scene.getObjectByName('approved-christmas-snowman')).toBeDefined()
  })

  it('늦게 로드된 실제 GLB 앵커를 등록하고 프레임 검색 없이 스키닝 표면과 고삐를 연결한다', async () => {
    let finish!: (value: GLTF) => void
    const request = new Promise<GLTF>(resolve => { finish = resolve })
    vi.spyOn(ParkAssetLoader.prototype, 'loadAsync').mockImplementation(url =>
      String(url).includes('rudolph') ? request : Promise.resolve(sleigh))
    const view = await renderer(), anchors = createReinAnchors()
    const team = { current: null as Group | null }
    const actors = () => h('group', { name: 'carrier' },
      h(ChristmasAsset, { id: 'sleigh', anchors: anchors.tow, fallback: placeholder() }),
      h(Reins, { team, anchors }),
      h('group', { ref: team }, ...Array.from({ length: 6 }, (_, index) => h('group', {
        key: index, position: [index % 2 ? .85 : -.85, 0, [3.4, 5.9, 8.4][Math.floor(index / 2)]!],
        userData: { moving: false, elapsed: 0 },
      }, h(ChristmasRudolph, { index, anchors: anchors.harness[index]!, fallback: placeholder() })))),
    )
    await view.mount(actors()); await view.tick(0)
    expect(anchors.tow.left).not.toBeNull()
    expect(anchors.harness.every(pair => !pair.left && !pair.right)).toBe(true)
    await act(async () => finish(rudolph)); await view.tick(.01)
    expect(anchors.harness.every(pair => pair.left && pair.right)).toBe(true)
    const carrier = view.state.scene.getObjectByName('carrier')!
    const reins = carrier.getObjectByName('sleigh-curved-reins') as InstancedMesh
    const bindings: { scene: Object3D; mesh: SkinnedMesh; index: number; marker: Object3D; side: number }[] = []
    for (const pair of anchors.harness) for (const side of [-1, 1]) {
      const marker = (side < 0 ? pair.left : pair.right)!, scene = marker.parent!
      const target = marker.position.clone(); target.x -= side * .025
      let nearest: { mesh: SkinnedMesh; index: number; distance: number } | undefined
      scene.traverse(o => {
        if (!(o instanceof SkinnedMesh)) return
        let parent: Object3D | null = o, harness = false
        while (parent && parent !== scene) { if (parent.name.includes('Christmas_Chest_Harness')) harness = true; parent = parent.parent }
        if (!harness) return
        for (let index = 0; index < o.geometry.attributes.position.count; index++) {
          const point = scene.worldToLocal(o.localToWorld(o.getVertexPosition(index, new Vector3())))
          const distance = point.distanceTo(target)
          if (!nearest || distance < nearest.distance) nearest = { mesh: o, index, distance }
        }
      })
      expect(nearest!.distance).toBeLessThan(.00001)
      bindings.push({ scene, mesh: nearest!.mesh, index: nearest!.index, marker, side })
    }
    const search = vi.spyOn(Object3D.prototype, 'getObjectByName')
    let skinDisplacement = 0
    for (const [frame, elapsed] of [200, 400, 600].entries()) {
      carrier.position.set(8 + frame * 3, 30 + frame, -10 - frame * 5)
      carrier.rotation.set(.15, .7 + frame * .3, -.1)
      for (const animal of team.current!.children) Object.assign(animal.userData, { moving: true, elapsed })
      await view.tick(elapsed / 1000)
      // Match the matrix state that the GPU sees, independently after callbacks.
      carrier.updateMatrixWorld(true)
      for (const { scene, mesh, index, marker, side } of bindings) {
        const deformed = mesh.getVertexPosition(index, new Vector3())
        skinDisplacement = Math.max(skinDisplacement, deformed.distanceTo(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index)))
        const expected = scene.worldToLocal(mesh.localToWorld(deformed)); expected.x += side * .025
        expect(marker.position.distanceTo(expected)).toBeLessThan(.00001)
      }
      for (let line = 0; line < 4; line++) for (let knot = 0; knot < 4; knot++) {
        const column = line < 2 ? 0 : 1, pair = knot ? anchors.harness[(knot - 1) * 2 + column]! : anchors.tow
        const anchor = knot ? (line % 2 ? pair.right : pair.left)! : (column ? pair.right : pair.left)!
        const matrix = new Matrix4(); reins.getMatrixAt(line * 81 + (knot ? knot * 27 - 1 : 0), matrix)
        const endpoint = new Vector3(0, knot ? .5 : -.5, 0).applyMatrix4(matrix).applyMatrix4(reins.matrixWorld)
        expect(endpoint.distanceTo(anchor.getWorldPosition(new Vector3()))).toBeLessThan(.00001)
      }
    }
    expect(search).not.toHaveBeenCalled()
    expect(skinDisplacement).toBeGreaterThan(.001)
    search.mockRestore()
    await view.mount(null)
    expect(anchors.tow).toEqual({ left: null, right: null })
    expect(anchors.harness.every(pair => !pair.left && !pair.right)).toBe(true)
    await view.mount(actors()); await view.tick(1)
    expect(anchors.harness.every(pair => pair.left && pair.right)).toBe(true)
  })
})
