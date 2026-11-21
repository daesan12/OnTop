import { describe, expect, it } from 'vitest'
import { Euler, PerspectiveCamera, Vector3 } from 'three'
import { fitThrowCamera, THROW_DURATION, STICK_RADIUS, throwPose } from '../../src/game/yutnori/throwMotion'

describe('서버 결과와 3D 윷가락의 마지막 윗면', () => {
  it.each(Array.from({length: 16}, (_, mask) => mask))('mask=%i의 네 윷이 확정된 면으로 바닥에 멈춘다', mask => {
    for (let index = 0; index < 4; index++) {
      const pose = throwPose(THROW_DURATION, index, mask, 7)
      const flatNormal = new Vector3(0, -1, 0).applyEuler(new Euler(...pose.rotation, 'YXZ'))
      expect(flatNormal.y).toBeCloseTo(mask & 1 << index ? 1 : -1)
      expect(pose.position[1]).toBeCloseTo(.055 + STICK_RADIUS / 2)
      expect(throwPose(THROW_DURATION + 100, index, mask, 7)).toEqual(pose)
    }
  })
  it('공중 회전과 바운스를 거쳐 정지하고 낙은 멍석 바깥으로 이동한다', () => {
    const air = throwPose(.4, 0, 1, 2), final = throwPose(THROW_DURATION, 0, 1, 2)
    expect(air.position[1]).toBeGreaterThan(final.position[1] + 1)
    expect(air.rotation[2]).toBeGreaterThan(final.rotation[2] + Math.PI)
    const out = throwPose(THROW_DURATION, 3, 1, 2, true)
    expect(out.position[0]).toBeGreaterThan(2.25)
  })
})

it.each([[480, 315], [220, 125], [350, 215]])('%ix%i에서 공중 회전 중인 네 윷의 외곽이 잘리지 않는다', (width, height) => {
  const camera = new PerspectiveCamera()
  fitThrowCamera(camera, width, height, true, 1, 2)
  for (let step = 0; step <= 60; step++) for (let index = 0; index < 4; index++) {
    const pose = throwPose(step / 60 * THROW_DURATION, index, 1, 2)
    const rotation = new Euler(...pose.rotation, 'YXZ')
    for (const z of [-1.14, 1.14]) for (const x of [-.195, .195]) for (const y of [-.105, .105]) {
      const point = new Vector3(x, y, z).applyEuler(rotation).add(new Vector3(...pose.position)).project(camera)
      expect(Math.abs(point.x)).toBeLessThan(1)
      expect(Math.abs(point.y)).toBeLessThan(1)
    }
  }
})
