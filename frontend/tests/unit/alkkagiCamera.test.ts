import { expect, test } from 'vitest'
import { ALKKAGI_FOV, alkkagiCameraActive, alkkagiTopDownFrame, alkkagiTopDownHeight } from '../../src/game/alkkagi/camera'
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { advanceOmokCamera } from '../../src/world/omokCamera'

test('종료·결과 도착·관전 해제는 남아 있는 알까기 데이터로 게임 카메라를 유지하지 않는다', () => {
  expect(alkkagiCameraActive('PLAYING',false)).toBe(true)
  expect(alkkagiCameraActive('FINISHED',false)).toBe(false)
  expect(alkkagiCameraActive('PLAYING',true)).toBe(false)
  expect(alkkagiCameraActive(undefined,false)).toBe(false)
})

test('양쪽 좌석의 수직 게임 시점에서 공원 시점으로 위치·회전·화각이 함께 복귀한다', () => {
  for(const up of [-1,1]) {
    const camera=new PerspectiveCamera(ALKKAGI_FOV,16/9,.01,100)
    camera.position.set(0,4,0)
    camera.quaternion.setFromRotationMatrix(new Matrix4().lookAt(camera.position,new Vector3(),new Vector3(0,0,up)))
    const destination=new Vector3(2,2.5,4), target=new Vector3(0,1,0)
    const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(destination,target,new Vector3(0,1,0)))
    let settled=false
    for(let frame=0;frame<180&&!settled;frame++)settled=advanceOmokCamera(camera,destination,rotation,76,1/60)
    expect(settled).toBe(true)
    expect(camera.position.distanceTo(destination)).toBeLessThan(.00001)
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(.00001)
    expect(camera.fov).toBeCloseTo(76,2)
  }
})

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
test('both seat orientations keep raised rim pieces inside the viewport',()=>{
  for(const [w,h] of [[1440,765],[1440,900],[1920,600],[1024,768],[390,844]]) for(const up of [-1,1]) {
    const frame=alkkagiTopDownFrame(w,h,1), camera=new PerspectiveCamera(ALKKAGI_FOV,w/h,.01,100)
    camera.up.set(0,0,up); camera.position.set(0,1.14+frame.height,up*frame.offset)
    camera.lookAt(0,1.14,up*frame.offset);camera.updateMatrixWorld()
    // A grown piece can sit with its centre at the board edge until it exits.
    for(const x of [-.705,.705]) for(const z of [-.775,.775]) {
      const projected=new Vector3(x,1.12+.271*.14,z).project(camera)
      expect(Math.abs(projected.x)).toBeLessThan(1)
      expect(Math.abs(projected.y)).toBeLessThan(1)
    }
  }
})
