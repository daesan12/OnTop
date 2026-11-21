import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { boardNodes } from '../../src/game/yutnori/Board'
import { boardWorldPoint, fitYutCamera, projectYutPoint, yutHudInsets, YUT_SURFACE_Y, YUT_TOKEN_HEIGHT } from '../../src/game/yutnori/board3dMath'

describe('3D 윷판 카메라와 클릭 투영', () => {
  it('같은 29칸을 겹치지 않는 3D 위치에 놓고 출발 칸을 유지한다', () => {
    expect(new Set(boardNodes.map(node => boardWorldPoint(node).join(','))).size).toBe(29)
    expect(boardWorldPoint(23)).toEqual([0, 0])
    expect(boardWorldPoint(20)[0]).toBeCloseTo(2.307692)
    expect(boardWorldPoint(20)[1]).toBeCloseTo(2.307692)
  })
  it.each([[920, 920], [380, 380], [840, 400]])('%ix%i에서 판과 쌓인 말이 화면 안에 있고 카메라 중심이 좌우 대칭이다', (width, height) => {
    const camera = new PerspectiveCamera()
    fitYutCamera(camera, width, height)
    for (const node of boardNodes) {
      for (const y of [YUT_SURFACE_Y, YUT_SURFACE_Y + 4 * YUT_TOKEN_HEIGHT]) {
        const p = projectYutPoint(camera, node, y)
        expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(100)
        expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(100)
      }
    }
    const left = projectYutPoint(camera, 10), right = projectYutPoint(camera, 5)
    expect(left.x + right.x).toBeCloseTo(100)
    expect(camera.position.y).toBeGreaterThan(camera.position.z)
    expect(projectYutPoint(camera, 1).y).not.toBe(projectYutPoint(camera, 1, YUT_SURFACE_Y + YUT_TOKEN_HEIGHT).y)
  })
  it.each([[1536, 1024], [1440, 960], [1024, 500], [390, 844], [390, 600]])('%ix%i에서 네 팀의 판과 업힌 말이 HUD를 피해 보인다', (width, height) => {
    const camera = new PerspectiveCamera(), safe = yutHudInsets(width, height, 4)
    fitYutCamera(camera, width, height, safe)
    for (const node of boardNodes) {
      for (const y of [YUT_SURFACE_Y, YUT_SURFACE_Y + 4 * YUT_TOKEN_HEIGHT]) {
        const p = projectYutPoint(camera, node, y)
        expect(p.x * width / 100).toBeGreaterThan(safe.left)
        expect(p.x * width / 100).toBeLessThan(width - safe.right)
        expect(p.y * height / 100).toBeGreaterThan(safe.top)
        expect(p.y * height / 100).toBeLessThan(height - safe.bottom)
      }
    }
    // Resize back to desktop must not preserve the portrait view offset.
    const original = projectYutPoint(camera, 20)
    fitYutCamera(camera, 390, 844, yutHudInsets(390, 844, 4))
    fitYutCamera(camera, width, height, safe)
    expect(projectYutPoint(camera, 20)).toEqual(original)
  })
})
