import { describe, expect, it } from 'vitest'
import { constrainSecretExitCamera } from '../../src/world/cameraCollision'

describe('공포맵 출구 3인칭 카메라', () => {
  it('복귀 지점을 보는 카메라가 언덕 위로 올라가 시선을 가리지 않는다', () => {
    const focus = { x: -60.2, y: 13.2, z: -88 }
    const camera = { x: -53.4, y: 22.385, z: -88 }
    constrainSecretExitCamera(camera, focus)
    expect(camera.x).toBeCloseTo(-58.6)
    expect(camera.y).toBeLessThan(16)
    expect(camera.z).toBe(-88)
  })

  it('벽 가까이 걸어가도 초점과 카메라 사이를 막지 않는 여유를 둔다', () => {
    for (const x of [-58.4, -58.65, -60.2, -63]) {
      const focus = { x, y: 13.2, z: -88 }
      const camera = { x: x + 6.8, y: 22.385, z: -87 }
      constrainSecretExitCamera(camera, focus)
      expect(camera.x).toBeLessThanOrEqual(-58.22)
      expect(camera.x).toBeGreaterThan(x)
      const once = { ...camera }
      constrainSecretExitCamera(camera, focus)
      expect(camera).toEqual(once)
    }
  })

  it('출구에서 멀어지거나 정상 외부 시점과 언덕 위 시점을 선택하면 바꾸지 않는다', () => {
    for (const focus of [{ x: -68, y: 13.2, z: -88 }, { x: -60.2, y: 13.2, z: -80 },
      { x: -60.2, y: 24, z: -88 }, { x: -57, y: 13.2, z: -88 }]) {
      const camera = { x: focus.x + 6.8, y: 24, z: focus.z }
      const original = { ...camera }
      constrainSecretExitCamera(camera, focus)
      expect(camera).toEqual(original)
    }
    const camera = { x: -64, y: 14, z: -88 }, original = { ...camera }
    constrainSecretExitCamera(camera, { x: -60.2, y: 13.2, z: -88 })
    expect(camera).toEqual(original)
  })
})
