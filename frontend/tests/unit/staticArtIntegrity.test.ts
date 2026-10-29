import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type { BufferGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

const checked = vi.hoisted(() => ({ batches: 0, vertices: 0 }))
function fingerprint(geometry: BufferGeometry) {
  const hash = createHash('sha256')
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    hash.update(JSON.stringify([name, attribute.itemSize, attribute.normalized, attribute.array.constructor.name]))
    hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))
  }
  hash.update(geometry.index!.array.constructor.name)
  hash.update(new Uint8Array(geometry.index!.array.buffer, geometry.index!.array.byteOffset, geometry.index!.array.byteLength))
  return hash.digest('hex')
}
vi.mock('../../src/world/art/weldStaticVertices', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/world/art/weldStaticVertices')>()
  return { weldStaticVertices: (geometry: BufferGeometry, tolerance: number) => {
    const result = original.weldStaticVertices(geometry, tolerance)
    const reference = mergeVertices(geometry, tolerance)
    expect(fingerprint(result)).toBe(fingerprint(reference))
    checked.batches++
    checked.vertices += geometry.getAttribute('position').count
    reference.dispose()
    return result
  } }
})

it('keeps the actual park art vertex/index buffers identical to the original welding', async () => {
  await import('../../src/world/art/fishCartGeometry')
  const beforeMailbox = checked.vertices
  await import('../../src/world/art/mailboxGeometry')
  const mailboxVertices = checked.vertices - beforeMailbox
  await import('../../src/world/art/activityPropGeometry')
  await import('../../src/world/pigeons/pigeonGeometry')
  await import('../../src/world/art/LandmarkRefinements')
  await import('../../src/world/art/TelescopeModel')
  await import('../../src/world/art/TraditionalPavilionLanterns')
  await import('../../src/world/art/ReferenceBenchFrames')
  await import('../../src/world/art/ReferenceStreetProps')
  await import('../../src/world/art/Pavilion')
  expect(checked.batches).toBeGreaterThan(30)
  // The surrounding simplified park retains its original budget. The newly
  // detailed mailbox is separately bounded; its collider/LOD/triangle limits
  // are also checked by heritagePropsGeometry.test.ts.
  expect(checked.vertices).toBeGreaterThan(50000)
  expect(checked.vertices - mailboxVertices).toBeLessThan(100000)
  expect(mailboxVertices).toBeLessThan(18000)
}, 20000)
