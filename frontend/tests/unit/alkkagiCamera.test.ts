import { expect, test } from 'vitest'
import { ALKKAGI_FOV, alkkagiTopDownHeight } from '../../src/game/alkkagi/camera'

test('가로·세로 화면에서 HUD를 제외한 영역에 판 전체가 들어간다', () => {
  for (const [width, height] of [[1440, 960], [390, 844], [1920, 600]]) {
    const distance = alkkagiTopDownHeight(width, height, 1)
    const vertical = 2 * distance * Math.tan(ALKKAGI_FOV * Math.PI / 360)
    const fill = Math.max(.3, Math.min(.8, (height - 260) / height))
    expect(vertical * fill).toBeGreaterThanOrEqual(1.4 - 1e-10)
    expect(vertical * width / height * fill).toBeGreaterThanOrEqual(1.26 - 1e-10)
  }
  expect(alkkagiTopDownHeight(1440, 960, 2)).toBeCloseTo(alkkagiTopDownHeight(1440, 960, 1) * 2)
})
