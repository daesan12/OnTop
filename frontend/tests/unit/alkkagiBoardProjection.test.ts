import { expect, it } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import { fitBoardCamera } from '../../src/game/alkkagi/boardLayout'

it('정면 투영에서 바닥 교차점과 알 윗면 중심은 같은 화면 위치다', () => {
  for (const height of [430, 750]) {
    const camera = new OrthographicCamera(-560, 560, height / 2, -height / 2, .1, 100)
    camera.position.set(0, 14, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0)
    fitBoardCamera(camera, height); camera.updateMatrixWorld()
    for (const [x, z] of [[-4, 4.2], [0, 3.2], [3, -2.2]]) {
      const floor = new Vector3(x, 0, z).project(camera), top = new Vector3(x, .271, z).project(camera)
      expect(top.x).toBeCloseTo(floor.x, 10); expect(top.y).toBeCloseTo(floor.y, 10)
    }
  }
})
