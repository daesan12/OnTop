import { Group, Mesh, ObjectLoader } from 'three'
import { decodeBakedProps } from '../../src/world/art/bakedProps'
import type { createArcadeArt } from './arcadeArt'

export const entryMeshNames = ['tower-frame', 'tower-frame-distant', 'wall-body', 'wall-foot', 'wall-clay', 'wall-timber'] as const
type EntryMeshName = typeof entryMeshNames[number]

export const bakedFacilityKinds = ['bridge', 'lake-fence', 'lake-access', 'fishing-deck', 'station'] as const
let facilities: Group | undefined

export async function decodeBakedFacilities(buffer: ArrayBuffer) {
  const headerSize = new DataView(buffer).getUint32(0, true)
  if (!headerSize || headerSize >= buffer.byteLength - 4) throw new Error('Invalid static facilities header')
  const { object, materials } = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerSize)))
  const entries = await decodeBakedProps(buffer.slice(4 + headerSize))
  const geometries = Object.fromEntries(Array.from(entries, ([id, art]) => {
    const geometry = art.stone!
    geometry.uuid = id
    return [id, geometry]
  }))
  const loader = new ObjectLoader()
  const group = loader.parseObject(object, geometries, loader.parseMaterials(materials, {}), {})
  if (!(group instanceof Group) || group.name !== 'renewal-static-facilities-v1') throw new Error('Invalid static facilities')
  return group
}

export async function loadBakedFacilities(response: Response) {
  if (!response.ok) throw new Error('Static facilities HTTP ' + response.status)
  let buffer = await response.arrayBuffer()
  // Vite can deliver a precompressed asset with Content-Encoding already applied.
  const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  }
  facilities = await decodeBakedFacilities(buffer)
  performance.mark('park-static-facilities-ready')
}

export function cloneBakedFacility(name: string) {
  return facilities?.getObjectByName(name)?.children[0]?.clone(true) as Group | undefined
}

export function bakedEntryMesh(name: EntryMeshName) {
  const mesh = facilities?.getObjectByName('entry-meshes')?.getObjectByName(name)
  return mesh instanceof Mesh ? mesh.geometry : undefined
}

export function bakedArcadeArt(): ReturnType<typeof createArcadeArt> | undefined {
  const arcade = facilities?.getObjectByName('arcade')
  if (!arcade) return undefined
  const art = {} as ReturnType<typeof createArcadeArt>
  for (const part of ['body', 'roof', 'walls'] as const) {
    const group = arcade.getObjectByName(part)
    if (!group) return undefined
    art[part] = Object.fromEntries(group.children.filter(child => child instanceof Mesh).map(child => [child.name, child.geometry]))
  }
  return art
}
