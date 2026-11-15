import { expect, it, vi } from 'vitest'
import { MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three'
import { createStoneMaterial, renderStoneScene } from '../../src/game/stone-rumble/visibility'

it('경기 재질만 공원 안개와 환경 반사에서 분리하고 원본은 유지한다', () => {
  const source = new MeshStandardMaterial({ fog: true, envMapIntensity: .7 })
  const copy = createStoneMaterial(source)
  expect(copy.fog).toBe(false)
  expect(copy.envMapIntensity).toBe(0)
  expect(source.fog).toBe(true)
  expect(source.envMapIntensity).toBe(.7)
  copy.dispose(); source.dispose()
})

it.each([false, true])('공원 색을 유지하고 깊이만 비운 뒤 경기장을 합성하며 설정을 복원한다: 오류 %s', failed => {
  const background = new Scene(), play = new Scene(), camera = new PerspectiveCamera()
  const calls: { scene: Scene; clear: boolean; reset: boolean }[] = []
  const operations: string[] = []
  const renderer = {
    autoClear: false, info: { autoReset: true, reset: vi.fn() },
    clearDepth: vi.fn(() => operations.push('depth')),
    resetState: vi.fn(() => operations.push('bindings')),
    render(scene: Scene) {
      operations.push(scene === play ? 'play' : 'background')
      calls.push({ scene, clear: this.autoClear, reset: this.info.autoReset })
      if (scene === play && failed) throw new Error('context lost')
    },
  }
  const render = () => renderStoneScene(renderer as unknown as WebGLRenderer, background, play, camera)
  if (failed) expect(render).toThrow('context lost')
  else render()
  expect(calls).toEqual([{ scene: background, clear: true, reset: false }, { scene: play, clear: false, reset: false }])
  expect(renderer.info.reset).toHaveBeenCalledOnce()
  expect(renderer.clearDepth).toHaveBeenCalledOnce()
  expect(renderer.resetState).toHaveBeenCalledOnce()
  expect(operations).toEqual(['background', 'depth', 'bindings', 'play'])
  expect(renderer.autoClear).toBe(false)
  expect(renderer.info.autoReset).toBe(true)
})
