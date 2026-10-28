import { expect, it } from 'vitest'
import { BoxGeometry, Color, Float32BufferAttribute, SphereGeometry } from 'three'
import { PropBuilder } from '../../src/world/art/propGeometry'

it('keeps independent transforms, colors, seams and triangle order when reusing primitive sources', () => {
  const reused = new PropBuilder([8, 4]), reference = new PropBuilder([8, 4])
  for (const x of [-2, 0, 3]) {
    const p: [number, number, number] = [x, x * .3, 1], s: [number, number, number] = [1, 2, .5]
    const r: [number, number, number] = [.2, -.3, .4], color = x < 0 ? '#123456' : '#cbaa91'
    reused.box('wood', color, p, s, r)
    reference.add('wood', new BoxGeometry(1, 1, 1), color, p, s, r)
    reused.ball('paint', color, p, s)
    const sphere = new SphereGeometry(1, 8, 4)
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

it('keeps custom colored geometry while retaining the dev primitive reuse contract', () => {
  const builder = new PropBuilder(), source = new SphereGeometry(1, 16, 8)
  const count = source.getAttribute('position').count
  source.setAttribute('color', new Float32BufferAttribute(new Float32Array(count * 3).fill(.5), 3))
  source.scale(1, 1.7, 1)
  let disposed = 0
  source.addEventListener('dispose', () => disposed++)
  builder.add('paint', source, '#808080', [0, 0, 0], [1, 1, 1], [0, 0, 0], true, true)
  expect(disposed).toBe(0)
  const retained = builder.parts.paint[0]!, positions = retained.getAttribute('position'), colors = retained.getAttribute('color')
  expect(positions.count).toBe(count)
  const tint = new Color('#808080')
  for (let i = 0; i < colors.count; i++) {
    expect(colors.getX(i)).toBeCloseTo(.5 * tint.r)
    expect(colors.getY(i)).toBeCloseTo(.5 * tint.g)
    expect(colors.getZ(i)).toBeCloseTo(.5 * tint.b)
  }
  const art = builder.finish()
  expect(art.paint!.index).not.toBeNull()
  art.paint!.dispose(); source.dispose()
  expect(disposed).toBe(1)
})
