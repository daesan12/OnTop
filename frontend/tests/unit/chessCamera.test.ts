import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { CHESS_BOARD_SCALE, CHESS_FOV, chessCameraActive, chessCameraFrame } from '../../src/game/chess/camera'

describe('체스 테이블 집중 카메라', () => {
  it('결과 화면에서는 게임 카메라를 유지하지 않는다', () => {
    expect(chessCameraActive('PLAYING', false)).toBe(true)
    expect(chessCameraActive('PLAYING', true)).toBe(false)
    expect(chessCameraActive('FINISHED', false)).toBe(false)
    expect(chessCameraActive(undefined, false)).toBe(false)
  })
  it.each([[1440, 1000], [390, 844], [844, 390], [320, 568], [1280, 720]])('%i×%i에서 회전·반대편·탑뷰의 모든 칸과 킹이 HUD 안쪽에 들어간다', (w, h) => {
    for (const scale of [.7, 1, 1.4]) for (const yaw of [0, Math.PI, Math.PI / 4, -Math.PI / 3]) for (const overhead of [false, true]) {
      const frame = chessCameraFrame(w, h, scale, yaw, overhead)
      const camera = new PerspectiveCamera(CHESS_FOV, w / h, .01, 100)
      camera.position.set(...frame.position); camera.up.set(...frame.up); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
      const xLimit = Math.max(.3, (w - (w >= 1120 ? 504 : 40)) / w)
      const yLimit = Math.max(.28, (h - (w >= 1120 ? 144 : h < 500 ? 192 : h < 650 ? 364 : 344)) / h)
      const bounds = [{ half: 4.55 * CHESS_BOARD_SCALE * scale, heights: [-.085, 0] },
        { half: 4 * CHESS_BOARD_SCALE * scale, heights: [.205] }]
      for (const { half, heights } of bounds) for (const x of [-half, half]) for (const z of [-half, half]) for (const y of heights) {
        const p = new Vector3(x, y, z).project(camera)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(xLimit)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(yLimit)
        expect(p.z).toBeLessThan(1)
      }
    }
  })
})
