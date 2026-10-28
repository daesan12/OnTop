import { Loader, TextureLoader, type Texture } from 'three'

/** Decode the original pixels before renderer preparation. ImageBitmap ignores
 * WebGL's unpack orientation/premultiplication, so bake those settings here.
 * No resizing or colour-space conversion is performed. */
export async function prepareParkTexture(texture: Texture): Promise<boolean> {
  const image = texture.image as HTMLImageElement
  let disposed = false, bitmap: ImageBitmap | undefined
  const dispose = () => {
    disposed = true
    bitmap?.close()
    bitmap = undefined
    texture.removeEventListener('dispose', dispose)
  }
  texture.addEventListener('dispose', dispose)
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const decoded = await createImageBitmap(image, {
          imageOrientation: texture.flipY ? 'flipY' : 'none',
          premultiplyAlpha: texture.premultiplyAlpha ? 'premultiply' : 'none',
          colorSpaceConversion: 'none',
        })
        if (disposed) { decoded.close(); return false }
        bitmap = decoded
        texture.image = decoded
        texture.flipY = false
        texture.premultiplyAlpha = false
        texture.needsUpdate = true
        return true
      } catch {
        // Browsers without this bitmap path retain Three's HTML-image upload.
      }
    }
    await image.decode?.()
    texture.removeEventListener('dispose', dispose)
    return !disposed
  } catch (error) {
    texture.removeEventListener('dispose', dispose)
    throw error
  }
}

/** Share this loader class between useLoader.preload and useLoader consumers. */
export class ParkTextureLoader extends Loader<Texture> {
  override load(
    url: string, onLoad?: (texture: Texture) => void,
    onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void,
  ): Texture {
    const loader = new TextureLoader(this.manager).setCrossOrigin(this.crossOrigin).setPath(this.path)
    return loader.load(url, texture => {
      void prepareParkTexture(texture).then(ready => {
        if (ready) onLoad?.(texture)
        else onError?.(new Error('Texture disposed before decoding completed'))
      }).catch(error => onError?.(error))
    }, onProgress, onError)
  }
}
