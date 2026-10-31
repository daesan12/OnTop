import { expect, test } from 'vitest'
import { ALKKAGI_FOV, alkkagiTopDownFrame, alkkagiTopDownHeight } from '../../src/game/alkkagi/camera'

test('PC·작은 화면에서 판 전체가 HUD와 손패의 남은 영역에 들어간다', () => {
  for (const [width, height] of [[1440,765],[1440,960],[390,844],[1920,600]]) {
    const frame=alkkagiTopDownFrame(width,height,1), wide=width>=1280
    const vertical=2*frame.height*Math.tan(ALKKAGI_FOV*Math.PI/360)
    const boardHeight=1.4/vertical*height, boardWidth=1.26/vertical*height
    const center=height/2+frame.offset/vertical*height
    expect(center-boardHeight/2).toBeGreaterThanOrEqual((wide?128:130)-1e-8)
    expect(center+boardHeight/2).toBeLessThanOrEqual(height-(wide?32:130)+1e-8)
    expect(boardWidth).toBeLessThanOrEqual(wide?width-480:width*.88+1e-8)
  }
  expect(alkkagiTopDownHeight(1440,765,2)).toBeCloseTo(alkkagiTopDownHeight(1440,765,1)*2)
})
test('PC 기본 판은 이전 260px 하단 여백 시점보다 크게 보인다',()=>{
  const vertical=2*alkkagiTopDownHeight(1440,765,1)*Math.tan(ALKKAGI_FOV*Math.PI/360)
  expect(1.4/vertical*765).toBeCloseTo(605)
})
