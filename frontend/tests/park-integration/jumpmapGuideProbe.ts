import { _roots } from '@react-three/fiber'
import { Vector3 } from 'three'
import { START } from '../../src/features/jumpmap/course'

/** 바닥 문양을 실제 서비스 장면에서 가까이 촬영하고, 다음 검증에는 공원 카메라를 복원한다. */
export function frameGuideMarker() {
  const state=_roots.get(document.querySelector('canvas')!)!.store.getState()
  state.setFrameloop('never'); state.scene.updateMatrixWorld(true)
  state.camera.position.set(START.x,START.y+5,START.z+4)
  state.camera.lookAt(new Vector3(START.x,START.y,START.z)); state.camera.updateMatrixWorld(true)
  state.gl.render(state.scene,state.camera)
}
export function resumePark() {
  _roots.get(document.querySelector('canvas')!)!.store.getState().setFrameloop('always')
}
