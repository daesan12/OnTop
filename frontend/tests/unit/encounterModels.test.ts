import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The Gemini + Tripo encounter creatures (S15P31B105-450) ship as small Meshopt + WebP files; keep them that way.
const root = resolve(__dirname, '../../park-renewal-preview')
const source = readFileSync(resolve(root, 'TripoEncounter.tsx'), 'utf8')
const ids = [...source.matchAll(/^\s+(\d+): new URL\('\.\/models\/encounter-(\d+)\.glb'/gm)].map(m => [Number(m[1]), m[2]!] as const)

function glb(path: string) {
  const file = readFileSync(path)
  expect(file.readUInt32LE(0)).toBe(0x46546c67)
  const length = file.readUInt32LE(12)
  return { size: file.length, doc: JSON.parse(file.subarray(20, 20 + length).toString()) }
}

describe('encounter creature models', () => {
  it('lists the eight generated creatures, each file named after its encounter', () => {
    expect(ids.map(([id]) => id)).toEqual([2, 3, 4, 7, 8, 9, 10, 11])
    for (const [id, name] of ids) expect(Number(name)).toBe(id)
  })

  it('keeps every file compressed, small and light enough for the underground', () => {
    for (const [, name] of ids) {
      const { size, doc } = glb(resolve(root, `models/encounter-${name}.glb`))
      expect(size).toBeLessThan(900_000)
      expect(doc.extensionsRequired).toContain('EXT_meshopt_compression')
      expect(doc.images.every((i: { mimeType: string }) => i.mimeType === 'image/webp')).toBe(true)
      const triangles = doc.meshes.flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
        .reduce((n: number, p: { indices: number }) => n + doc.accessors[p.indices].count / 3, 0)
      expect(triangles).toBeLessThanOrEqual(17_000)
    }
  })
})
