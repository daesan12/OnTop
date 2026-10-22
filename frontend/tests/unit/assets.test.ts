import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function glb(file: string) {
  const bytes = fs.readFileSync(path.resolve('public', file))
  return {
    bytes,
    doc: JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()),
  }
}
describe('imported runtime asset integrity', () => {
  it.each(['man', 'girl'])(
    'keeps %s source provenance and shared near/far meshes',
    (character) => {
      const manifest = JSON.parse(
          fs.readFileSync('public/art/characters/manifest.json', 'utf8'),
        ),
        record = manifest.records.find(
          (r: { character: string }) => r.character === character,
        ),
        { bytes, doc } = glb(`art/characters/${character}.glb`)
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(
        record.runtime.sha256,
      )
      expect(doc.materials).toHaveLength(1)
      expect(doc.meshes).toHaveLength(2)
      expect(doc.extensionsUsed).toContain('EXT_meshopt_compression')
      expect(doc.extensionsUsed).toContain('EXT_texture_webp')
      expect(doc.images).toHaveLength(1)
      expect(doc.skins[0].joints).toHaveLength(49)
    },
  )
  it('ships only the extracted compressed chair with matching manifest', () => {
    const manifest = JSON.parse(
        fs.readFileSync('public/art/props/wood-chair.manifest.json', 'utf8'),
      ),
      { bytes, doc } = glb('art/props/wood-chair.glb')
    expect(bytes.length).toBe(manifest.runtime.bytes)
    expect(bytes.length).toBeLessThan(manifest.source.bytes)
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(
      manifest.runtime.sha256,
    )
    expect(doc.materials).toHaveLength(1)
    expect(doc.meshes).toHaveLength(1)
    expect(doc.extensionsRequired).toContain('EXT_meshopt_compression')
    expect(fs.existsSync('public/art/props/wood-chair-source.glb')).toBe(false)
  })
})
