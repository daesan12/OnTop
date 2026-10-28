import { afterEach, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { prepareParkTexture } from '../../src/world/art/ParkTextureLoader'

afterEach(() => vi.unstubAllGlobals())
function source() {
  const image = { width: 1024, height: 512, decode: vi.fn().mockResolvedValue(undefined) }
  return { image, texture: new Texture(image as unknown as HTMLImageElement) }
}
it.each([true,false])('retains original pixels and upload orientation flipY=%s without resizing', async flipY => {
  const { image, texture } = source(), bitmap = {close:vi.fn()}
  texture.flipY = flipY
  const decode = vi.fn().mockResolvedValue(bitmap)
  vi.stubGlobal('createImageBitmap',decode)
  expect(await prepareParkTexture(texture)).toBe(true)
  expect(decode).toHaveBeenCalledWith(image,{
    imageOrientation:flipY?'flipY':'none',premultiplyAlpha:'none',colorSpaceConversion:'none',
  })
  expect(texture.image).toBe(bitmap)
  expect(texture.flipY).toBe(false)
  texture.dispose(); texture.dispose()
  expect(bitmap.close).toHaveBeenCalledOnce()
})
it('does not publish a decode after disposal and releases the pending bitmap',async()=>{
  const {texture}=source(), bitmap={close:vi.fn()}
  let release!: (bitmap:unknown)=>void
  vi.stubGlobal('createImageBitmap',()=>new Promise(resolve=>{release=resolve}))
  const pending=prepareParkTexture(texture)
  texture.dispose(); release(bitmap)
  expect(await pending).toBe(false)
  expect(bitmap.close).toHaveBeenCalledOnce()
})
it.each(['absent','unsupported'])('keeps the HTML-image fallback when bitmap decoding is %s',async mode=>{
  const {image,texture}=source()
  vi.stubGlobal('createImageBitmap',mode==='absent'?undefined:vi.fn().mockRejectedValue(new Error('unsupported')))
  expect(await prepareParkTexture(texture)).toBe(true)
  expect(texture.image).toBe(image)
  expect(texture.flipY).toBe(true)
  expect(image.decode).toHaveBeenCalledOnce()
})
it('propagates a failed fallback decode to the existing loading error path',async()=>{
  const {image,texture}=source()
  vi.stubGlobal('createImageBitmap',undefined)
  image.decode.mockRejectedValue(new Error('invalid image'))
  await expect(prepareParkTexture(texture)).rejects.toThrow('invalid image')
})
