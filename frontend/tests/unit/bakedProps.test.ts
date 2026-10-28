import { expect, it, vi } from 'vitest'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three'
import { MeshoptEncoder } from 'meshoptimizer/encoder'
import { capturePropBuilds, decodeBakedProps, encodeBakedProps, installBakedProps } from '../../src/world/art/bakedProps'
import { PropBuilder } from '../../src/world/art/propGeometry'

it('round-trips original float bits, index order, seams, bounds and metadata through the shipped decoder', async () => {
  const original = new BoxGeometry()
  original.computeBoundingBox(); original.computeBoundingSphere()
  original.name = 'original'; original.userData.label = 'keep'
  original.addGroup(0, 3, 2); original.setDrawRange(3, 9)
  await MeshoptEncoder.ready
  const bytes = encodeBakedProps(new Map([['box', { wood: original }]]), (source, count, stride, mode) =>
    mode === 'INDICES' ? MeshoptEncoder.encodeIndexSequence(source, count, stride)
      : MeshoptEncoder.encodeVertexBufferLevel(source, count, stride, 3))
  const decoded = (await decodeBakedProps(bytes.buffer as ArrayBuffer)).get('box')!.wood!
  expect(decoded.index!.array).toEqual(original.index!.array)
  for (const name of Object.keys(original.attributes)) expect(decoded.getAttribute(name).array).toEqual(original.getAttribute(name).array)
  expect(decoded.boundingBox).toEqual(original.boundingBox)
  expect(decoded.boundingSphere).toEqual(original.boundingSphere)
  expect(decoded.groups).toEqual(original.groups)
  expect(decoded.drawRange).toEqual(original.drawRange)
  expect(decoded.name).toBe(original.name); expect(decoded.userData).toEqual(original.userData)
  original.dispose(); decoded.dispose()
})

it('skips procedural primitive construction and captures before caller transforms', async () => {
  const capture = capturePropBuilds()
  const builder = new PropBuilder([12, 8], 'cached-box')
  builder.box('wood', '#aabbcc', [1, 2, 3], [2, 3, 4])
  const original = builder.finish().wood!
  const bytes = encodeBakedProps(capture)
  original.translate(0, 100, 0)
  await installBakedProps(bytes.buffer as ArrayBuffer)
  const cached = new PropBuilder([12, 8], 'cached-box')
  const add = vi.spyOn(cached, 'add')
  cached.box('wood', '#aabbcc', [1, 2, 3], [2, 3, 4])
  expect(add).not.toHaveBeenCalled()
  const restored = cached.finish().wood!
  expect(restored.boundingSphere!.center.y).toBe(2)
  expect(restored.drawRange.count).toBe(Infinity)
  restored.translate(0, 100, 0)
  expect(restored.getAttribute('position').array).toEqual(original.getAttribute('position').array)
  expect(restored.index!.array).toEqual(original.index!.array)
  original.dispose(); restored.dispose()
})

it('does not publish a corrupt geometry cache', async () => {
  await expect(installBakedProps(new ArrayBuffer(8))).rejects.toThrow('Invalid baked prop version')
  const builder = new PropBuilder([12, 8], 'uncached-after-failure')
  builder.box('stone', '#ffffff', [0, 0, 0], [1, 1, 1])
  expect(builder.finish().stone!.getAttribute('position').count).toBeGreaterThan(0)
})

it('retains 32-bit index buffers alongside 16-bit props in the same artifact', async () => {
  const large = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    -1.25, 0, 0, 0, 2.5, 0, 0, 0, -3.75,
  ], 3)).setIndex(new Uint32BufferAttribute([2, 0, 1, 1, 0, 2], 1))
  const small = new BoxGeometry()
  const bytes = encodeBakedProps(new Map([['mixed-indices', { wood: large, stone: small }]]))
  const art = (await decodeBakedProps(bytes.buffer as ArrayBuffer)).get('mixed-indices')!
  expect(art.wood!.index!.array).toBeInstanceOf(Uint32Array)
  expect(art.stone!.index!.array).toBeInstanceOf(Uint16Array)
  expect(art.wood!.index!.array).toEqual(large.index!.array)
  expect(art.wood!.getAttribute('position').array).toEqual(large.getAttribute('position').array)
  for (const geometry of [large, small, art.wood!, art.stone!]) geometry.dispose()
})

it('decodes shared compressed streams into independent mutable geometry arrays', async () => {
  const source = new BoxGeometry()
  await MeshoptEncoder.ready
  const bytes = encodeBakedProps(new Map([['shared-streams', { wood: source, stone: source }]]), (input, count, stride, mode) =>
    mode === 'INDICES' ? MeshoptEncoder.encodeIndexSequence(input, count, stride)
      : MeshoptEncoder.encodeVertexBufferLevel(input, count, stride, 3))
  const art = (await decodeBakedProps(bytes.buffer as ArrayBuffer)).get('shared-streams')!
  art.wood!.translate(0, 10, 0)
  expect(art.stone!.getAttribute('position').array).toEqual(source.getAttribute('position').array)
  expect(art.wood!.getAttribute('position').array).not.toEqual(art.stone!.getAttribute('position').array)
  for (const geometry of [source, art.wood!, art.stone!]) geometry.dispose()
})
