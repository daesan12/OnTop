import { expect, test } from 'vitest'
import { Matrix4, Plane, Quaternion, Ray, Vector3 } from 'three'
import { intersectAlkkagiBoard } from '../../src/game/alkkagi/boardSpace'
import { draggedShot } from '../../src/game/alkkagi/aimInput'

test('이동·회전·테이블 배율이 달라도 같은 판 좌표와 발사 힘을 얻는다',()=>{
  const plane=new Plane(new Vector3(0,1,0),-.36)
  for(const scale of [.14,.21,.3]) {
    const world=new Matrix4().compose(new Vector3(10,1.12,-20),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.8),new Vector3(scale,scale,scale*1.1))
    const ray=new Ray(new Vector3(1.5,10,2),new Vector3(0,-1,0)).applyMatrix4(world)
    const point=intersectAlkkagiBoard(ray,world,plane)!
    expect(point.x).toBeCloseTo(1.5);expect(point.y).toBeCloseTo(.36);expect(point.z).toBeCloseTo(2)
    const shot=draggedShot({x:0,y:0},{x:60,y:60},{x:0,z:0},point)!
    expect(shot.power).toBeCloseTo(1)
  }
})
