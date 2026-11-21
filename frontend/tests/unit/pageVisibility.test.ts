import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, extend } from '@react-three/fiber'
import { Group, type WebGLRenderer } from 'three'
import { renderToString } from 'react-dom/server'
import { usePageVisible } from '../../src/park/usePageVisible'

extend({ Group })
afterEach(() => vi.unstubAllGlobals())

describe('공원 렌더 루프의 페이지 표시 상태', () => {
  it('document 없는 SSR과 클라이언트 테스트에서도 기본 표시 상태로 렌더하고 구독을 정리한다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    vi.stubGlobal('document', undefined)
    function ServerProbe() { return h('span', null, usePageVisible() ? 'visible' : 'hidden') }
    expect(renderToString(h(ServerProbe))).toBe('<span>visible</span>')
    const root = createRoot({ width: 1, height: 1 } as HTMLCanvasElement)
    const states: boolean[] = []
    function ClientProbe() {
      states.push(usePageVisible())
      return h('group')
    }
    try {
      await root.configure({ gl: { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() } as unknown as WebGLRenderer,
        size: { width: 1, height: 1, top: 0, left: 0 }, frameloop: 'never', dpr: 1 })
      await act(async () => { root.render(h(ClientProbe)) })
      expect(states.length).toBeGreaterThan(0)
      expect(states.every(Boolean)).toBe(true)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('렌더와 구독 사이에 창을 복원해 이벤트를 놓쳐도 현재 상태를 다시 확인한다', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const page = new EventTarget() as EventTarget & { hidden: boolean }
    page.hidden = true
    const add = vi.spyOn(page, 'addEventListener')
    const original = EventTarget.prototype.addEventListener
    add.mockImplementation((...args) => {
      // Restoration occurred before the new subscriber could receive its event.
      page.hidden = false
      original.apply(page, args)
    })
    const remove = vi.spyOn(page, 'removeEventListener')
    vi.stubGlobal('document', page)
    const root = createRoot({ width: 1, height: 1 } as HTMLCanvasElement)
    const states: boolean[] = []
    function Probe() {
      const visible = usePageVisible()
      states.push(visible)
      return h('group', { name: visible ? 'running' : 'paused' })
    }
    try {
      await root.configure({ gl: { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() } as unknown as WebGLRenderer,
        size: { width: 1, height: 1, top: 0, left: 0 }, frameloop: 'never', dpr: 1 })
      await act(async () => { root.render(h(Probe)) })
      expect(states[0]).toBe(false)
      expect(states.at(-1)).toBe(true)
      await act(async () => { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')) })
      expect(states.at(-1)).toBe(false)
      await act(async () => { page.hidden = false; page.dispatchEvent(new Event('visibilitychange')) })
      expect(states.at(-1)).toBe(true)
    } finally {
      await act(async () => root.unmount())
    }
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
