import {
  DataTexture,
  RepeatWrapping,
  RGBAFormat,
  EquirectangularReflectionMapping,
  LinearFilter,
  HalfFloatType,
  CubeUVReflectionMapping,
  LinearSRGBColorSpace,
} from 'three'
import {getOutdoorReflectionData,type OutdoorReflectionData} from './outdoorReflectionData'

/** Small, deterministic material detail shared by all instruments/lanterns. */
function grain(paper: boolean) {
  const size = 128,
    data = new Uint8Array(size * size * 4)
  let seed = 7319
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = seed / 4294967296
      const fiber = Math.sin(x * 1.9 + Math.sin(y * 0.13) * 2)
      const value = Math.round(
        paper
          ? 209 + noise * 29 + fiber * 12
          : 178 + noise * 18 + Math.sin(y * 2.4) * 24,
      )
      data.set([value, value, value, 255], (y * size + x) * 4)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
export const hanjiGrain = grain(true)
export const metalGrain = grain(false)

/** Shared low-resolution outdoor reflection lighting, not a scene capture. */
export function outdoorReflection() {
  const w = 256,
    h = 128,
    data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const elevation = Math.sin((y / h - 0.5) * Math.PI),
        sky = Math.max(0, elevation)
      const cloud =
        Math.exp(-(((elevation - 0.35) / 0.16) ** 2)) *
        (0.5 + 0.5 * Math.sin((x / w) * Math.PI * 8)) ** 4
      const ground = elevation < 0
      const c = ground
        ? [0.17, 0.16, 0.13]
        : [
            0.36 + sky * 0.14 + cloud * 0.4,
            0.46 + sky * 0.17 + cloud * 0.3,
            0.58 + sky * 0.19 + cloud * 0.2,
          ]
      data.set(
        [...c.map((v) => Math.round(Math.min(1, v) * 255)), 255],
        (y * w + x) * 4,
      )
    }
  const texture = new DataTexture(data, w, h, RGBAFormat)
  texture.mapping = EquirectangularReflectionMapping
  texture.magFilter = texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Exact HalfFloat pixels captured from the original PMREM generator. CubeUV
 * mapping tells Three that filtering is complete; material settings stay intact. */
export function restoreOutdoorReflection(value:OutdoorReflectionData){
  const texture=new DataTexture(value.data,value.width,value.height,RGBAFormat,HalfFloatType)
  texture.mapping=CubeUVReflectionMapping
  texture.minFilter=texture.magFilter=LinearFilter
  texture.colorSpace=LinearSRGBColorSpace
  texture.flipY=false;texture.generateMipmaps=false;texture.needsUpdate=true
  return texture
}
const bakedReflection=getOutdoorReflectionData()
export const outdoorReflectionMap=bakedReflection?restoreOutdoorReflection(bakedReflection):outdoorReflection()
if(bakedReflection)performance.mark('park-static-reflection-ready')
