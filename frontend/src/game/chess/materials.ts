import { DataTexture, LinearFilter, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, RGBAFormat } from 'three'

/** A small deterministic bump texture, shared by the set; no downloaded textures or provider assets. */
export function createChessMaterials() {
  const size = 128, pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * .49 + Math.sin(y * Math.PI * 2 / size) * 1.8)
      + .3 * Math.sin(x * 1.18 + Math.sin(y * Math.PI * 4 / size))
    const value = Math.round(128 + grain * 24), offset = (y * size + x) * 4
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value; pixels[offset + 3] = 255
  }
  const grain = new DataTexture(pixels, size, size, RGBAFormat)
  grain.wrapS = grain.wrapT = RepeatWrapping; grain.magFilter = grain.minFilter = LinearFilter; grain.needsUpdate = true
  const white = new MeshPhysicalMaterial({ color: '#efdfbd', metalness: 0, roughness: .31,
    clearcoat: .2, clearcoatRoughness: .35, bumpMap: grain, bumpScale: .002 })
  const black = new MeshPhysicalMaterial({ color: '#59402b', metalness: 0, roughness: .3,
    clearcoat: .25, clearcoatRoughness: .32, bumpMap: grain, bumpScale: .005 })
  const gold = new MeshStandardMaterial({ color: '#b58d4d', roughness: .35, metalness: .65 })
  const eye = new MeshStandardMaterial({ color: '#21180f', roughness: .25 })
  const whiteMane = new MeshStandardMaterial({ color: '#d7c19b', roughness: .44 })
  const blackMane = new MeshStandardMaterial({ color: '#3c281c', roughness: .44 })
  return { white, black, gold, eye, whiteMane, blackMane, dispose() {
    grain.dispose(); for (const material of [white, black, gold, eye, whiteMane, blackMane]) material.dispose()
  } }
}
