import { expect, it } from 'vitest'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { creatureJumpArt } from '../../park-renewal-preview/creatureJumpArt'
import { landingGeometry } from '../../src/features/jumpmap/landingMotion'

it.each(['mole', 'pigeon'] as const)('%s는 착지 모양을 유지하면서 불필요한 세분화 정점을 제거한다', theme => {
  let before = 0, after = 0
  for (const source of Object.values(creatureJumpArt[theme])) {
    const original = new TessellateModifier(.45, 3).modify(source)
    const geometry = landingGeometry(source, theme)
    before += original.attributes.position!.count
    after += geometry.attributes.position!.count
    source.computeBoundingBox()
    // Expanded culling bounds stay intentional; the actual mesh coordinates are unchanged.
    expect(Array.from(geometry.attributes.position!.array)).toEqual(Array.from(source.attributes.position!.array))
    expect(geometry.index?.count).toBe(source.index?.count)
    expect(geometry).not.toBe(source)
    geometry.dispose(); original.dispose()
  }
  expect(after).toBeLessThan(before * .65)
})
