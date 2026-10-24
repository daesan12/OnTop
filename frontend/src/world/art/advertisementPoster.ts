import type { Texture } from 'three'
import { ADVERTISEMENT_FORMATS } from './advertisementFormats'

const maxPosterDimension = Math.max(
  ...Object.values(ADVERTISEMENT_FORMATS).flatMap(format => [...format.pixels]),
)
export function advertisementPosterSize(width: number, height: number) {
  const scale = Math.min(1, maxPosterDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// Keep decoded pixels available until the shared poster is disposed. An HTML
// image may defer (or evict) its decode and then block the first WebGL upload.
const decodedPosters = new WeakMap<Texture, ImageBitmap>()

export async function prepareAdvertisementPoster(
  texture: Texture,
  live: () => boolean,
): Promise<Texture | null> {
  if (!live()) {
    texture.dispose()
    return null
  }
  const image = texture.image as HTMLImageElement
  let bitmap: ImageBitmap | undefined
  if (typeof createImageBitmap === 'function') {
    try {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      const size = advertisementPosterSize(width, height)
      bitmap = await createImageBitmap(image, {
        // ImageBitmap ignores Texture.flipY/premultiplyAlpha. Match the former
        // HTML-image upload here, including the existing sRGB treatment.
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
        // Source artwork stays unchanged. Avoid uploading 4800px posters to
        // panels whose confirmed format budgets never exceed 1920px.
        ...(size.width !== width || size.height !== height ? {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high' as const,
        } : {}),
      })
    } catch {
      // Keep the HTML-image path on browsers that cannot create this bitmap.
    }
  }
  if (!bitmap) {
    try {
      await image.decode?.()
    } catch {
      texture.dispose()
      return null
    }
  }
  if (!live()) {
    bitmap?.close()
    texture.dispose()
    return null
  }
  if (bitmap) {
    texture.image = bitmap
    texture.flipY = false
    texture.needsUpdate = true
    decodedPosters.set(texture, bitmap)
  }
  return texture
}

export function disposeAdvertisementPoster(texture: Texture) {
  texture.dispose()
  decodedPosters.get(texture)?.close()
  decodedPosters.delete(texture)
}
