import { expect, it } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import { characterSource } from '../fixtures/characterRig'
import { createTabletPortrait, fitTabletPortrait } from '../../src/features/tableLobby/portraitFraming'

it.each(['man', 'girl'] as const)('keeps both %s hands and the posed upper body inside every portrait aspect', async character => {
  const { rig, bounds } = createTabletPortrait(await characterSource(character))
  for (const side of ['L', 'R'] as const) {
    const hand = rig.bones[`hand_${side}`].getWorldPosition(new Vector3())
    const shoulder = rig.bones[`upperArm_${side}`].getWorldPosition(new Vector3())
    expect(hand.z - shoulder.z).toBeGreaterThan(.08)
    expect((hand.x - shoulder.x) * (side === 'L' ? 1 : -1)).toBeGreaterThan(.05)
  }
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 10)
  for (const [width, height] of [[300, 244], [270, 190], [150, 170], [600, 488]]) {
    fitTabletPortrait(camera, bounds, width!, height!)
    for (const hand of [rig.bones.hand_L, rig.bones.hand_R]) {
      const p = hand.getWorldPosition(new Vector3()).project(camera)
      expect(Math.abs(p.x)).toBeLessThan(.94); expect(Math.abs(p.y)).toBeLessThan(.94)
    }
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      const p = new Vector3(x, y, bounds.max.z).project(camera)
      expect(Math.abs(p.x)).toBeLessThan(.9); expect(Math.abs(p.y)).toBeLessThan(.9)
    }
  }
  fitTabletPortrait(camera, bounds, 300, 244)
  const zoom = camera.zoom
  fitTabletPortrait(camera, bounds, 600, 488)
  expect(camera.zoom).toBeCloseTo(zoom)
  rig.dispose()
})
