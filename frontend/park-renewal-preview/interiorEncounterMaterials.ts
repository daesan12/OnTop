import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three'

export type Finish = 'stone' | 'cloth' | 'metal' | 'wood' | 'water'

const size = 128

function grain(finish: Finish) {
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * 2 * Math.PI, v = y / size * 2 * Math.PI
      const salt = Math.imul(x + 173, 374761393) ^ Math.imul(y + 97, 668265263)
      const speckle = (((salt ^ (salt >>> 15)) >>> 0) & 255) / 255 - .5
      const cloud = Math.sin(u*3 + Math.cos(v*4)) * Math.cos(v*3 - u*2)
      const striation = finish === 'cloth' ? Math.cos(u*39) * Math.cos(v*35)
        : finish === 'wood' ? Math.sin(u*13 + .8*Math.sin(v*2)) + .38*Math.cos(u*44)
        : finish === 'metal' ? Math.sin(u*21 + Math.sin(v)) * .38
        : finish === 'water' ? Math.sin(u*4 + Math.sin(v*3)) * Math.cos(v*4) : 0
      const detail = finish === 'water' ? 3 : finish === 'cloth' ? 12 : 23
      const value = Math.round(146 + 25*cloud + 24*striation + detail*speckle)
      const offset = (y * size + x) * 4
      pixels.set([value, value, value, 255], offset)
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export const encounterFinishes = {
  stone: { roughness: .91, metalness: 0, bumpScale: .061, texture: grain('stone') },
  cloth: { roughness: .96, metalness: 0, bumpScale: .022, texture: grain('cloth') },
  wood: { roughness: .81, metalness: 0, bumpScale: .041, texture: grain('wood') },
  metal: { roughness: .63, metalness: .37, bumpScale: .019, texture: grain('metal') },
  water: { roughness: .26, metalness: .16, bumpScale: .066, texture: grain('water') },
}
