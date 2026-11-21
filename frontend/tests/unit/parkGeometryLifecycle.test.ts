import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, Fragment, lazy, Suspense, type ReactNode } from 'react'
import { createRoot, extend, useLoader, type RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { WinterFirInstances } from '../../src/features/winter/WinterFirInstances'
import { FacilityGeometry } from '../../park-renewal-preview/FacilityGeometry'
import { GeometrySourceReady } from '../../park-renewal-preview/geometrySourceReady'
import catalog from '../../park-renewal-preview/models/geometry-catalog.json'

vi.mock('@react-three/fiber', async importOriginal => ({
  ...await importOriginal<typeof import('@react-three/fiber')>(),
  useLoader: vi.fn(),
}))

extend({ Group: THREE.Group, InstancedMesh: THREE.InstancedMesh })
const cleanups: (() => Promise<void>)[] = []
beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('window', { location: { search: '' }, devicePixelRatio: 1 })
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.mocked(useLoader).mockReset()
})

async function renderer() {
  const canvas = { width: 1, height: 1 } as HTMLCanvasElement
  const render = vi.fn()
  const root = createRoot(canvas)
  let state!: RootState
  await root.configure({
    gl: { render, setSize: vi.fn(), setPixelRatio: vi.fn() } as unknown as THREE.WebGLRenderer,
    size: { width: 1, height: 1, top: 0, left: 0 },
    frameloop: 'never', dpr: 1, onCreated: current => { state = current },
  })
  cleanups.push(async () => { await act(async () => root.unmount()) })
  return {
    render,
    get state() { return state },
    async mount(children: ReactNode) { await act(async () => { root.render(children) }) },
    tick(time: number) {
      state.scene.updateMatrixWorld(true)
      state.advance(time)
    },
  }
}

function asset(file: keyof typeof catalog) {
  const sources = catalog[file].parts.map(part => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(part.vertices * 3), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(part.vertices * 3), 3))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.triangles * 3), 1))
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  })
  const optimized = new THREE.Group()
  sources.forEach((mesh, index) => {
    const part = new THREE.Mesh(mesh.geometry.clone(), mesh.material)
    part.name = 'part-' + index
    part.userData = { sourceVertices: mesh.geometry.attributes.position!.count,
      sourceTriangles: mesh.geometry.index!.count / 3 }
    optimized.add(part)
  })
  cleanups.push(async () => {
    for (const mesh of [...sources, ...optimized.children as THREE.Mesh[]]) mesh.geometry.dispose()
    sources.forEach(mesh => (mesh.material as THREE.Material).dispose())
  })
  return { sources, optimized }
}

describe('공원 geometry 마운트와 프레임 수명주기', () => {
  it('입구 GLB가 모두 준비되기 전에는 절차적 나무와 겨울 장식을 반복 생성하지 않는다', async () => {
    const { EntranceAssetsReady } = await import('../../park-renewal-preview/EntrancePavilion')
    const view = await renderer()
    let ready = false, finish!: () => void, builds = 0
    const pending = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(useLoader).mockImplementation((_loader, input) => {
      if (String(input).includes('lottery') && !ready) throw pending
      return { scene: new THREE.Group() }
    })
    function EntranceArt() { builds++; return h('group', { name: 'critical-entrance-art' }) }
    await view.mount(h(Suspense, { fallback: null }, h(EntranceAssetsReady, { children: h(EntranceArt) })))
    expect(builds).toBe(0)
    await act(async () => { ready = true; finish() })
    expect(builds).toBe(1)
    expect(view.state.scene.getObjectByName('critical-entrance-art')).toBeDefined()
  })

  it('침엽수는 자동 렌더를 유지하고 계산된 인스턴스 경계로 LOD와 히스테리시스를 적용한다', async () => {
    const view = await renderer()
    const near = new THREE.ConeGeometry(2, 5, 12), far = new THREE.ConeGeometry(2, 5, 4)
    await view.mount(h(WinterFirInstances, { parts: [{ p: [100, 0, 0], s: [1, 1, 1], c: '#fff' }],
      geometry: near, distantGeometry: far }))
    const mesh = view.state.scene.children[0]!.children[0] as THREE.InstancedMesh
    expect(mesh.boundingSphere).not.toBeNull()
    expect(mesh.boundingSphere!.center.x).toBeCloseTo(100)
    expect(view.state.internal.priority).toBe(0)
    const matrices = mesh.instanceMatrix, colors = mesh.instanceColor
    view.state.camera.position.set(0, 0, 0)
    view.tick(.01)
    expect(view.render).toHaveBeenCalledOnce()
    expect(mesh.geometry).toBe(far)
    view.state.camera.position.x = 100
    view.tick(.1)
    expect(mesh.geometry).toBe(far) // No distance calculation before .65 seconds.
    view.tick(.7)
    expect(mesh.geometry).toBe(near)
    view.state.camera.position.x = 25 // 75m retains the near side of the 72 +/- 8m band.
    view.tick(1.4)
    expect(mesh.geometry).toBe(near)
    view.state.camera.position.x = 19
    view.tick(2.1)
    expect(mesh.geometry).toBe(far)
    view.state.camera.position.x = 25
    view.tick(2.8)
    expect(mesh.geometry).toBe(far)
    expect(mesh.instanceMatrix).toBe(matrices)
    expect(mesh.instanceColor).toBe(colors)
    near.dispose(); far.dispose()
  })

  it('시설 원본이 늦거나 부분적으로 마운트되면 완료 신호 후 재검사하고 적용 후에는 유지한다', async () => {
    const view = await renderer(), { sources, optimized } = asset('facility-tower-optimized.glb')
    vi.mocked(useLoader).mockReturnValue({ scene: optimized })
    const source = new THREE.Group(); source.name = 'forty-metre-tower'
    const tree = (revision: number, mounted: boolean) => h(Fragment, null,
      h(FacilityGeometry, { id: 'tower' }),
      mounted && h(GeometrySourceReady, { revision, children: h('primitive', { object: source }) }))
    await view.mount(tree(0, false))
    expect(useLoader).not.toHaveBeenCalled()
    source.add(sources[0]!)
    await view.mount(tree(1, true))
    expect(useLoader).not.toHaveBeenCalled()
    source.add(...sources.slice(1))
    await view.mount(tree(2, true))
    expect(useLoader).toHaveBeenCalled()
    expect(sources[0]!.geometry).toBe((optimized.children[0] as THREE.Mesh).geometry)
    await view.mount(tree(3, true))
    expect(sources[0]!.geometry).toBe((optimized.children[0] as THREE.Mesh).geometry)
  })

  it('세부 모델 검사 후 Suspense 원본이 늦게 해제되어도 GLB가 적용되고 유휴 프레임에는 재검사하지 않는다', async () => {
    const { ParkDetailGeometry } = await import('../../park-renewal-preview/ParkDetailGeometry')
    const view = await renderer(), { sources, optimized } = asset('detail-lamp-optimized.glb')
    vi.mocked(useLoader).mockReturnValue({ scene: optimized })
    const source = new THREE.Group(); source.name = 'layout-original-park-lamps'; source.add(...sources)
    let ready!: (module: { default: () => ReactNode }) => void
    const LateSource = lazy(() => new Promise<{ default: () => ReactNode }>(resolve => { ready = resolve }))
    await view.mount(h(Fragment, null, h(ParkDetailGeometry, { jumpCourse: false }),
      h(Suspense, { fallback: null }, h(GeometrySourceReady, { children: h(LateSource) }))))
    expect(useLoader).not.toHaveBeenCalled()
    await act(async () => { ready({ default: () => h('primitive', { object: source }) }) })
    expect(useLoader).toHaveBeenCalled()
    expect(sources[0]!.geometry).toBe((optimized.children[0] as THREE.Mesh).geometry)
    const scan = vi.spyOn(view.state.scene, 'traverse')
    for (let frame = 0; frame < 120; frame++) view.tick(frame / 60)
    expect(scan).not.toHaveBeenCalled()
  })
})
