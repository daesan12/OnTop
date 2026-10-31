import { Matrix4, Plane, Ray, Vector3 } from 'three'

/** 테이블 월드 좌표·배율과 무관하게 서버의 판 좌표로 조준한다. */
export function intersectAlkkagiBoard(ray: Ray, world: Matrix4, floor: Plane) {
  return ray.clone().applyMatrix4(new Matrix4().copy(world).invert()).intersectPlane(floor, new Vector3())
}
