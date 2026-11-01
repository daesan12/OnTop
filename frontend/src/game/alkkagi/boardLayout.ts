import type { OrthographicCamera } from 'three'

// 알 좌표를 바꾸지 않고 현행 서버 초기 배치의 교차점을 표시한다.
export const boardColumns = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
export const boardRows = [-4.2, -3.2, -2.2, -1.2, 0, 1.2, 2.2, 3.2, 4.2]

export function fitBoardCamera(camera: OrthographicCamera, viewportHeight: number) {
  camera.zoom = viewportHeight / (2 * 14 * Math.tan(23 * Math.PI / 180))
  camera.updateProjectionMatrix()
}
