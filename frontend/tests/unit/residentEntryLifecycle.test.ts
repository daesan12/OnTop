import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, extend, type RootState } from '@react-three/fiber'
import * as THREE from 'three'
import { ResidentModel } from '../../src/features/ai/ParkNpcModel'
import { ResidentLoading } from '../../src/features/ai/residentLoading'
import { instantiateResident } from '../../src/features/ai/residentRig'

const assets = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../../src/features/bungeoppang/customerModelV5', () => ({ CustomerModelPoolV5: class { acquire = assets.acquire } }))
vi.mock('../../src/ai-lab/CharacterModel', () => ({ CharacterModel: () => h('group', { name: 'resident-placeholder' }) }))
vi.mock('../../src/features/ai/residentRig', async () => ({
  RESIDENT_LOOKS: { CHILD: { height: 1.48 }, ELDER: { height: 1.98 } },
  instantiateResident: vi.fn(),
}))

extend({ Group: THREE.Group })
const cleanups: (() => Promise<void>)[] = []
beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('window', { location: { search: '' }, devicePixelRatio: 1 })
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  assets.acquire.mockReset(); vi.mocked(instantiateResident).mockReset()
})

async function renderer() {
  let state!: RootState
  const root = createRoot({ width: 100, height: 100 } as HTMLCanvasElement)
  await root.configure({ gl: { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(), xr: { isPresenting: false } } as unknown as THREE.WebGLRenderer,
    size: { width: 100, height: 100, top: 0, left: 0 }, frameloop: 'never', dpr: 1, onCreated: value => { state = value } })
  cleanups.push(async () => { await act(async () => root.unmount()) })
  return { get state() { return state }, async mount(children: ReactNode) { await act(async () => { root.render(children) }) },
    async tick(time: number) { await act(async () => { state.scene.updateMatrixWorld(true); state.advance(time) }) } }
}
const resident = () => h(ResidentModel, { kind: 'CHILD', speed: { current: 0 } })

describe('주민의 첫 화면 이후 로딩', () => {
  it('첫 화면 전에는 요청하지 않고 준비 중에는 대체 주민을 유지한다', async () => {
    const view = await renderer()
    let finish!: (source: never) => void
    const release = vi.fn(), dispose = vi.fn(), actor = { root: new THREE.Group(), update: vi.fn(), dispose }
    assets.acquire.mockReturnValue({ ready: new Promise(resolve => { finish = resolve as typeof finish }), release })
    vi.mocked(instantiateResident).mockReturnValue(actor as unknown as ReturnType<typeof instantiateResident>)
    const tree = (ready: boolean) => h(ResidentLoading.Provider, { value: ready }, resident())
    await view.mount(tree(false)); await view.tick(.01)
    expect(assets.acquire).not.toHaveBeenCalled()
    await view.mount(tree(true))
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeDefined()
    expect(assets.acquire).not.toHaveBeenCalled()
    await view.tick(.02)
    await vi.waitFor(() => expect(assets.acquire).toHaveBeenCalledOnce())
    await act(async () => { finish({} as never) })
    expect(instantiateResident).toHaveBeenCalledOnce()
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    await view.mount(null)
    expect(release).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce()
  })

  it('90m 밖과 경계 이동에서도 대체 주민을 유지하고 해제된 상세 모델은 복제하지 않는다', async () => {
    const view = await renderer()
    let finish!: (source: never) => void
    const release = vi.fn()
    assets.acquire.mockReturnValue({ ready: new Promise(resolve => { finish = resolve as typeof finish }), release })
    await view.mount(h('group', { position: [200, 0, 0] }, resident()))
    const placeholder = view.state.scene.getObjectByName('resident-placeholder')
    expect(placeholder).toBeDefined()
    await view.tick(.01)
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBe(placeholder)
    expect(assets.acquire).not.toHaveBeenCalled()
    view.state.camera.position.x = 111 // 89m: only the detailed request becomes eligible.
    await view.tick(.02)
    await vi.waitFor(() => expect(assets.acquire).toHaveBeenCalledOnce())
    view.state.camera.position.x = 109 // 91m: keep the same lightweight actor.
    await view.tick(.03)
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBe(placeholder)
    expect(assets.acquire).toHaveBeenCalledOnce()
    await view.mount(null)
    await act(async () => { finish({} as never) })
    expect(release).toHaveBeenCalledOnce()
    expect(instantiateResident).not.toHaveBeenCalled()
  })
})
