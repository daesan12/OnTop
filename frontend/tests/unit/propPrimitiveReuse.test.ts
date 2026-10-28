import { expect, it } from 'vitest'
import { BoxGeometry, SphereGeometry } from 'three'
import { PropBuilder } from '../../src/world/art/propGeometry'

it('keeps independent transforms, colors, seams and triangle order when reusing primitive sources', () => {
  const reused = new PropBuilder([12, 8]), reference = new PropBuilder([12, 8])
  for (const x of [-2, 0, 3]) {
    const p: [number, number, number] = [x, x * .3, 1], s: [number, number, number] = [1, 2, .5]
    const r: [number, number, number] = [.2, -.3, .4], color = x < 0 ? '#123456' : '#cbaa91'
    reused.box('wood', color, p, s, r)
    reference.add('wood', new BoxGeometry(1, 1, 1), color, p, s, r)
    reused.ball('paint', color, p, s)
    const sphere = new SphereGeometry(1, 12, 8)
    // Mixed source formats must preserve the same original triangle sequence.
    reference.add('paint', x < 0 ? sphere.toNonIndexed() : sphere, color, p, s)
    if (x < 0) sphere.dispose()
  }
  const actual = reused.finish(), expected = reference.finish()
  for (const finish of ['wood', 'paint'] as const) {
    const a = actual[finish]!, e = expected[finish]!
    expect(a.index!.array).toEqual(e.index!.array)
    for (const name of Object.keys(e.attributes)) expect(a.getAttribute(name).array).toEqual(e.getAttribute(name).array)
    expect(a.boundingSphere).toEqual(e.boundingSphere)
    a.dispose(); e.dispose()
  }
})
