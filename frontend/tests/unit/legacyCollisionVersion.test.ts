import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const read = (path: string) => readFileSync(new URL(path, import.meta.url))
const world = JSON.parse(read('../../../backend/src/main/resources/world/park.json').toString()) as {
  schemaVersion: number
  sourceSha256: string
  boxes: { id: string; center: number[]; half: number[] }[]
}
const facilities = JSON.parse(read('../../../backend/src/main/resources/world/facilities.json').toString()) as { mapVersion: string }

describe('approved legacy collision version', () => {
  it('pins the FE, legacy world, facilities and original manifest to the same version', () => {
    const manifest = read('../../../docs/integration/collision-feedback/source-manifest.json')
    expect(world.schemaVersion).toBe(1)
    expect(EXPECTED_MAP_VERSION).toBe(world.sourceSha256)
    expect(EXPECTED_MAP_VERSION).toBe(facilities.mapVersion)
    expect(EXPECTED_MAP_VERSION).toBe(createHash('sha256').update(manifest).digest('hex'))
  })

  it('uses the approved full dev table list and retains the frontend-test mappings', () => {
    for (const [file, source, count] of [
      ['park-bindings.dev.json', 'legacy-tables/bindings.dev.json', 16],
      ['park-bindings.frontend-test.json', 'collision-feedback/park-bindings.frontend-test.json', 4],
    ] as const) {
      const approved = JSON.parse(read('../../../docs/integration/' + source).toString())
      const deployed = JSON.parse(read('../../public/' + file).toString())
      expect(deployed.bindings).toEqual(approved.bindings)
      expect(deployed.bindings).toHaveLength(count)
    }
  })
})
