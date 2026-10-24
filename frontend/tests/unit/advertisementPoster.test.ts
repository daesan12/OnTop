import { afterEach, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import {
  disposeAdvertisementPoster,
  prepareAdvertisementPoster,
  advertisementPosterSize,
} from '../../src/world/art/advertisementPoster'

afterEach(() => vi.unstubAllGlobals())
function source() {
  const image = { width: 466, height: 659, decode: vi.fn().mockResolvedValue(undefined) }
  const texture = new Texture(image as unknown as HTMLImageElement)
  const disposed = vi.fn()
  texture.addEventListener('dispose', disposed)
  return { image, texture, disposed }
}

it('prepares original pixels asynchronously with the former orientation and closes the shared bitmap once', async () => {
  const { texture, image, disposed } = source(), bitmap = { close: vi.fn() }
  const decode = vi.fn().mockResolvedValue(bitmap)
  vi.stubGlobal('createImageBitmap', decode)
  expect(await prepareAdvertisementPoster(texture, () => true)).toBe(texture)
  expect(decode).toHaveBeenCalledWith(image, {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  })
  expect(texture.image).toBe(bitmap)
  expect(texture.flipY).toBe(false)
  expect(disposed).not.toHaveBeenCalled()
  disposeAdvertisementPoster(texture)
  expect(bitmap.close).toHaveBeenCalledOnce()
  expect(disposed).toHaveBeenCalledOnce()
})

it('closes a pending decode after unmount without publishing or retaining its texture', async () => {
  const { texture, disposed } = source(), bitmap = { close: vi.fn() }
  let resolve!: (value: unknown) => void, live = true
  vi.stubGlobal('createImageBitmap', () => new Promise(r => { resolve = r }))
  const pending = prepareAdvertisementPoster(texture, () => live)
  live = false; resolve(bitmap)
  expect(await pending).toBeNull()
  expect(bitmap.close).toHaveBeenCalledOnce()
  expect(disposed).toHaveBeenCalledOnce()
})

it('does not start decoding a loader callback that arrives after departure', async () => {
  const { texture, disposed } = source(), decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  expect(await prepareAdvertisementPoster(texture, () => false)).toBeNull()
  expect(decode).not.toHaveBeenCalled()
  expect(disposed).toHaveBeenCalledOnce()
})

it.each(['unavailable', 'rejected'])('retains the decoded HTML poster when bitmap decoding is %s', async mode => {
  const { texture, image } = source()
  vi.stubGlobal('createImageBitmap', mode === 'unavailable' ? undefined : vi.fn().mockRejectedValue(new Error('unsupported')))
  expect(await prepareAdvertisementPoster(texture, () => true)).toBe(texture)
  expect(texture.image).toBe(image)
  expect(texture.flipY).toBe(true)
  expect(image.decode).toHaveBeenCalledOnce()
  disposeAdvertisementPoster(texture)
})

it('keeps the existing labelled fallback when neither decode path can produce an image', async () => {
  const { texture, image, disposed } = source()
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
  image.decode.mockRejectedValue(new Error('decode failed'))
  expect(await prepareAdvertisementPoster(texture, () => true)).toBeNull()
  expect(disposed).toHaveBeenCalledOnce()
})

it('does not close unrelated fallback or loader-owned image data', () => {
  const { texture, disposed } = source()
  disposeAdvertisementPoster(texture)
  expect(disposed).toHaveBeenCalledOnce()
})

it.each([
  [4800, 2160, 1920, 864],
  [2160, 2880, 1440, 1920],
  [1080, 1920, 1080, 1920],
  [466, 659, 466, 659],
])('fits %sx%s source to the existing panel budget without cropping or upscaling', (w, h, width, height) => {
  expect(advertisementPosterSize(w, h)).toEqual({ width, height })
  expect(Math.abs(width / height - w / h)).toBeLessThan(.001)
})

it('performs oversized poster resizing in the async bitmap decode, before any GPU upload', async () => {
  const { image, texture } = source()
  image.width = 4800; image.height = 2160
  const bitmap = { width: 1920, height: 864, close: vi.fn() }, decode = vi.fn().mockResolvedValue(bitmap)
  vi.stubGlobal('createImageBitmap', decode)
  expect(await prepareAdvertisementPoster(texture, () => true)).toBe(texture)
  expect(decode).toHaveBeenCalledWith(image, expect.objectContaining({ resizeWidth: 1920, resizeHeight: 864, resizeQuality: 'high' }))
  expect(texture.image).toBe(bitmap)
  disposeAdvertisementPoster(texture)
})
