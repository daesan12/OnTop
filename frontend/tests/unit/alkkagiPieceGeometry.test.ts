import { expect, it } from 'vitest'
import { createPieceGeometry } from '../../src/game/alkkagi/pieceGeometry'

it('세 크기와 확대/축소 모델은 서버 충돌 반경을 넘지 않고 기존 높이를 유지한다', () => {
  for (const radius of [.24, .32, .43, .24 * .8, .43 * 1.25]) {
    const geometry = createPieceGeometry(radius)
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(radius + 1e-7)
      expect(positions.getY(i)).toBeGreaterThanOrEqual(0)
      expect(positions.getY(i)).toBeLessThanOrEqual(.270001)
    }
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.max.y).toBeCloseTo(.27)
    geometry.dispose()
  }
})
