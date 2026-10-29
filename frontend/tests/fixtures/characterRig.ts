import fs from 'node:fs'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'

/** Actual shipped compressed geometry/skin; omit images for CPU-only Node tests. */
export async function characterSource(name: 'man' | 'girl') {
  const bytes = fs.readFileSync(`public/art/characters/${name}.glb`)
  const jsonLength = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  delete doc.materials
  delete doc.images
  delete doc.textures
  delete doc.samplers
  doc.extensionsUsed = doc.extensionsUsed.filter((name: string) => name !== 'EXT_texture_webp')
  doc.extensionsRequired = doc.extensionsRequired.filter((name: string) => name !== 'EXT_texture_webp')
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material
  const json = Buffer.from(JSON.stringify(doc))
  const padded = Buffer.alloc((json.length + 3) & ~3, 0x20)
  padded.set(json)
  const binaryChunk = bytes.subarray(20 + jsonLength)
  const output = Buffer.alloc(20 + padded.length + binaryChunk.length)
  bytes.copy(output, 0, 0, 20)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(padded.length, 12)
  padded.copy(output, 20)
  binaryChunk.copy(output, 20 + padded.length)
  return new ParkAssetLoader().parseAsync(new Uint8Array(output).buffer, '')
}
