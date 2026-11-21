import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { QUORIDOR_FOV, quoridorCameraActive, quoridorCameraPose, quoridorYaw } from '../../src/game/quoridor/camera'
import { BOARD_SPAN, CELL_PITCH, cellPoint, coordinate, wallDimensions, wallPoint } from '../../src/game/quoridor/presentation'

it('3D 칸과 두 칸 장벽의 중심이 서버 0~8·0~7 좌표와 일치한다', () => {
  expect(cellPoint({ x: 4, y: 4 })).toEqual([0, .034, 0])
  expect(coordinate({ x: 0, y: 0 })).toBe('A9')
  expect(coordinate({ x: 8, y: 8 })).toBe('I1')
  const a = cellPoint({ x: 2, y: 3 }), b = cellPoint({ x: 3, y: 4 })
  for (const orientation of ['HORIZONTAL', 'VERTICAL'] as const) {
    const wall = { x: 2, y: 3, orientation }, p = wallPoint(wall)
    expect(p[0]).toBeCloseTo((a[0] + b[0]) / 2)
    expect(p[2]).toBeCloseTo((a[2] + b[2]) / 2)
    expect(Math.max(...wallDimensions(wall).filter((_, i) => i !== 1))).toBeCloseTo(2 * CELL_PITCH - .012)
  }
})

it.each([[1536,1024,140,160,16,16],[390,844,190,190,16,16],[800,450,68,32,252,212]])('%ix%i 화면에서 네 출발 방향의 판과 솟은 말이 HUD 밖에 맞춰진다', (width,height,top,bottom,left,right) => {
  const insets = { top, bottom, left, right }
  for (const scale of [.8, 1, 1.3]) for (const goal of ['NORTH','EAST','SOUTH','WEST'] as const) {
    const frame = quoridorCameraPose(width,height,scale,quoridorYaw(goal),insets)
    const camera = new PerspectiveCamera(QUORIDOR_FOV,width/height,.01,100)
    camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateMatrixWorld()
    const half = BOARD_SPAN / 2 * scale
    for (const x of [-half,half]) for (const z of [-half,half]) for (const y of [-.12,.16]) {
      const p = new Vector3(x,y,z).project(camera), screenX=(p.x+1)*width/2, screenY=(1-p.y)*height/2
      expect(screenX).toBeGreaterThanOrEqual(insets.left)
      expect(screenX).toBeLessThanOrEqual(width-insets.right)
      expect(screenY).toBeGreaterThanOrEqual(insets.top)
      expect(screenY).toBeLessThanOrEqual(height-insets.bottom)
    }
    expect(Math.hypot(frame.position[0]-frame.target[0],frame.position[2]-frame.target[2])).toBeGreaterThan(.1)
  }
})

it('참가자의 종료·정산 뒤에는 카메라를 반환하고 관전 최종 판은 해제할 때까지 보존한다', () => {
  expect(quoridorCameraActive(undefined,false)).toBe(false)
  expect(quoridorCameraActive('PLAYING',false)).toBe(true)
  expect(quoridorCameraActive('PLAYING',true)).toBe(false)
  expect(quoridorCameraActive('FINISHED',false)).toBe(false)
  expect(quoridorCameraActive('FINISHED',false,true)).toBe(true)
})
