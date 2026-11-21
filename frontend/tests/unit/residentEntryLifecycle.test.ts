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
  RESIDENT_LOOKS: { CHILD: { id: 'child', height: 1.48 }, ELDER: { id: 'elder', height: 1.98 } },
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
  if (vi.isFakeTimers()) {
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    vi.useRealTimers()
  }
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
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('주민의 첫 화면 이후 로딩', () => {
  it('첫 화면 전에는 요청하지 않고 실제 모델이 준비될 때 한 번만 표시한다', async () => {
    const view = await renderer()
    let finish!: (source: never) => void
    const release = vi.fn(), dispose = vi.fn(), actor = { root: new THREE.Group(), update: vi.fn(), dispose }
    assets.acquire.mockReturnValue({ ready: new Promise(resolve => { finish = resolve as typeof finish }), release })
    vi.mocked(instantiateResident).mockReturnValue(actor as unknown as ReturnType<typeof instantiateResident>)
    const tree = (ready: boolean) => h(ResidentLoading.Provider, { value: ready }, resident())
    await view.mount(tree(false)); await view.tick(.01)
    expect(assets.acquire).not.toHaveBeenCalled()
    await view.mount(tree(true))
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    expect(view.state.scene.getObjectByName('detailed-npc-CHILD')!.children).toHaveLength(0)
    expect(assets.acquire).not.toHaveBeenCalled()
    await view.tick(.02)
    await vi.waitFor(() => expect(assets.acquire).toHaveBeenCalledOnce())
    await act(async () => { finish({} as never) })
    expect(instantiateResident).toHaveBeenCalledOnce()
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    expect(view.state.scene.getObjectByName('detailed-npc-CHILD')!.children).toEqual([actor.root])
    await view.mount(null)
    expect(release).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce()
  })

  it('90m 경계에서 임시 모델 없이 상세 요청만 시작하고 해제된 모델은 복제하지 않는다', async () => {
    const view = await renderer()
    let finish!: (source: never) => void
    const release = vi.fn()
    assets.acquire.mockReturnValue({ ready: new Promise(resolve => { finish = resolve as typeof finish }), release })
    await view.mount(h('group', { position: [200, 0, 0] }, resident()))
    const host = view.state.scene.getObjectByName('detailed-npc-CHILD')!
    expect(host.children).toHaveLength(0)
    await view.tick(.01)
    expect(host.children).toHaveLength(0)
    expect(assets.acquire).not.toHaveBeenCalled()
    view.state.camera.position.x = 111 // 89m: only the detailed request becomes eligible.
    await view.tick(.02)
    await vi.waitFor(() => expect(assets.acquire).toHaveBeenCalledOnce())
    view.state.camera.position.x = 109 // Crossing back must not add a temporary actor or restart the request.
    await view.tick(.03)
    expect(host.children).toHaveLength(0)
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    expect(assets.acquire).toHaveBeenCalledOnce()
    await view.mount(null)
    await act(async () => { finish({} as never) })
    expect(release).toHaveBeenCalledOnce()
    expect(instantiateResident).not.toHaveBeenCalled()
  })

  it('다운로드 실패 때에도 다른 모습의 대체 주민을 표시하지 않는다', async () => {
    const view = await renderer(), release = vi.fn()
    assets.acquire.mockImplementation(() => ({ ready: Promise.reject(Error('offline')), release }))
    await view.mount(resident()); await view.tick(.01)
    await vi.waitFor(() => expect(view.state.scene.getObjectByName('detailed-npc-CHILD')!.userData.loadError).toBe(true))
    expect(view.state.scene.getObjectByName('detailed-npc-CHILD')!.children).toHaveLength(0)
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    expect(instantiateResident).not.toHaveBeenCalled()
    await view.mount(null)
    expect(release).toHaveBeenCalledOnce()
  })

  it('일시 실패한 lease를 해제하고 대기 후 새 모델로 복구하며 외형을 교체하지 않는다', async () => {
    const view = await renderer()
    vi.useFakeTimers()
    const failedRelease = vi.fn(), release = vi.fn(), dispose = vi.fn()
    let finish!: (source: object) => void
    const actor = { root: new THREE.Group(), update: vi.fn(), dispose }
    assets.acquire.mockImplementationOnce(() => ({ ready: Promise.reject(Error('temporary')), release: failedRelease }))
      .mockReturnValue({ ready: new Promise(resolve => { finish = resolve }), release })
    vi.mocked(instantiateResident).mockReturnValue(actor as unknown as ReturnType<typeof instantiateResident>)
    await view.mount(resident()); await view.tick(.01); await advance(0)
    const host = view.state.scene.getObjectByName('detailed-npc-CHILD')!
    expect(failedRelease).toHaveBeenCalledOnce()
    expect(host.userData.loadError).toBe(true)
    expect(host.children).toHaveLength(0)
    await advance(999)
    expect(assets.acquire).toHaveBeenCalledOnce()
    await advance(2)
    expect(assets.acquire).toHaveBeenCalledTimes(2)
    expect(host.userData).toMatchObject({ loadError: false, loadAttempts: 2 })
    expect(host.children).toHaveLength(0)
    await act(async () => { finish({}) })
    expect(host.userData).toMatchObject({ loaded: true, loadError: false, loadAttempts: 2 })
    expect(host.children).toEqual([actor.root])
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    await advance(10_000)
    expect(instantiateResident).toHaveBeenCalledOnce()
    await view.mount(null)
    expect(release).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledOnce()
  })

  it.each(['download', 'acquire'])('%s 영구 실패는 3회에서 중단하고 최종 오류를 한 번 기록한다', async failure => {
    const view = await renderer()
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}), release = vi.fn()
    assets.acquire.mockImplementation(() => {
      if (failure === 'acquire') throw Error('cannot acquire')
      return { ready: Promise.reject(Error('offline')), release }
    })
    await view.mount(resident()); await view.tick(.01); await advance(0)
    await advance(1001); await advance(2001); await advance(60_000)
    expect(assets.acquire).toHaveBeenCalledTimes(3)
    expect(release).toHaveBeenCalledTimes(failure === 'acquire' ? 0 : 3)
    const host = view.state.scene.getObjectByName('detailed-npc-CHILD')!
    expect(host.userData).toMatchObject({ loadError: true, loadAttempts: 3 })
    expect(host.children).toHaveLength(0)
    expect(view.state.scene.getObjectByName('resident-placeholder')).toBeUndefined()
    expect(warn).toHaveBeenCalledExactlyOnceWith('[park-resident] NPC model could not be loaded', { kind: 'CHILD', attempts: 3 }, expect.any(Error))
    await view.mount(null)
    expect(release).toHaveBeenCalledTimes(failure === 'acquire' ? 0 : 3)
  })

  it('재시도 대기 중 떠나면 추가 요청을 취소한다', async () => {
    const view = await renderer()
    vi.useFakeTimers()
    const release = vi.fn()
    assets.acquire.mockImplementation(() => ({ ready: Promise.reject(Error('offline')), release }))
    await view.mount(resident()); await view.tick(.01); await advance(0)
    await view.mount(null); await advance(10_000)
    expect(assets.acquire).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce()
  })

  it('요청 중 떠난 뒤 실패해도 재시도나 중복 해제하지 않는다', async () => {
    const view = await renderer()
    vi.useFakeTimers()
    let reject!: (error: Error) => void
    const release = vi.fn(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    assets.acquire.mockReturnValue({ ready: new Promise((_, fail) => { reject = fail }), release })
    await view.mount(resident()); await view.tick(.01); await advance(0)
    await view.mount(null)
    await act(async () => { reject(Error('late failure')) })
    await advance(10_000)
    expect(assets.acquire).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce()
    expect(warn).not.toHaveBeenCalled()
  })

  it('재시도 대기 시간에는 다른 주민의 준비를 계속한다', async () => {
    const view = await renderer()
    vi.useFakeTimers()
    const release = vi.fn(), actor = { root: new THREE.Group(), update: vi.fn(), dispose: vi.fn() }
    assets.acquire.mockImplementation(asset => ({ ready: asset.id === 'child' ? Promise.reject(Error('offline')) : Promise.resolve({}), release }))
    vi.mocked(instantiateResident).mockReturnValue(actor as unknown as ReturnType<typeof instantiateResident>)
    await view.mount(h('group', null, resident(), h(ResidentModel, { kind: 'ELDER', speed: { current: 0 } })))
    await view.tick(.01); await advance(10)
    expect(assets.acquire).toHaveBeenCalledTimes(2)
    expect(view.state.scene.getObjectByName('detailed-npc-ELDER')!.userData.loaded).toBe(true)
    expect(view.state.scene.getObjectByName('detailed-npc-CHILD')!.children).toHaveLength(0)
    expect(instantiateResident).toHaveBeenCalledOnce()
  })
})
