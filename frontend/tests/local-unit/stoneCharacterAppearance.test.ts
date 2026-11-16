import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, RepeatWrapping, Scene, SRGBColorSpace, Texture } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { createStoneCharacterAppearance, readStoneCharacterAppearance } from '../../src/game/stone-rumble/characterAppearance'

afterEach(() => vi.unstubAllGlobals())

function model(size: number) {
  const image = { width:size, height:size, close:vi.fn() } as unknown as ImageBitmap
  const texture = new Texture(image), material = new MeshBasicMaterial({map:texture}), geometry = new BoxGeometry(), scene = new Scene()
  texture.colorSpace = SRGBColorSpace; texture.wrapS = RepeatWrapping; texture.flipY = false; texture.offset.set(.1,.2)
  scene.add(new Mesh(geometry,material),new Mesh(geometry,material))
  return {source:{scene} as unknown as GLTF,image,texture,material,geometry}
}

it('keeps park material, source, source version and sampling intact while sharing a smaller game atlas', async () => {
  const m=model(2048),originalSource=m.texture.source,originalVersion=originalSource.version
  const bitmap={width:1024,height:1024,close:vi.fn()} as unknown as ImageBitmap
  const resize=vi.fn().mockResolvedValue(bitmap);vi.stubGlobal('createImageBitmap',resize)

  const appearance=await createStoneCharacterAppearance(m.source),copy=appearance.get(m.material) as MeshBasicMaterial

  expect(resize).toHaveBeenCalledOnce()
  expect(copy).not.toBe(m.material);expect(copy.map).not.toBe(m.texture)
  expect(copy.map!.source).not.toBe(originalSource);expect(copy.map!.image).toBe(bitmap)
  expect(copy.map!.colorSpace).toBe(SRGBColorSpace);expect(copy.map!.wrapS).toBe(RepeatWrapping)
  expect(copy.map!.flipY).toBe(false);expect(copy.map!.offset.toArray()).toEqual([.1,.2])
  expect(m.material.map).toBe(m.texture);expect(m.texture.source).toBe(originalSource)
  expect(originalSource.data).toBe(m.image);expect(originalSource.version).toBe(originalVersion)
  expect(m.image.close).not.toHaveBeenCalled()
  m.geometry.dispose();m.material.dispose();m.texture.dispose();copy.map!.dispose();copy.dispose()
})

it('reuses one asynchronous appearance for all consumers of the same model', async () => {
  const m=model(2048),resize=vi.fn().mockResolvedValue({width:1024,height:1024,close:vi.fn()})
  vi.stubGlobal('createImageBitmap',resize)
  let first:unknown,second:unknown
  try { readStoneCharacterAppearance(m.source) } catch(pending) { first=pending }
  try { readStoneCharacterAppearance(m.source) } catch(pending) { second=pending }
  expect(first).toBeInstanceOf(Promise);expect(second).toBe(first)
  await first
  expect(readStoneCharacterAppearance(m.source)).toBe(readStoneCharacterAppearance(m.source))
  expect(resize).toHaveBeenCalledOnce()
  m.geometry.dispose();m.material.dispose();m.texture.dispose()
})

it.each(['small','unsupported','failed'])('원본 텍스처를 재사용해도 경기 전용 안개 설정과 공원 재질은 분리한다: %s', async mode => {
  const m=model(mode==='small'?512:2048),resize=vi.fn().mockRejectedValue(new Error('resize unavailable'))
  vi.stubGlobal('createImageBitmap',mode==='unsupported'?undefined:resize)
  const appearance=await createStoneCharacterAppearance(m.source)
  const copy = appearance.get(m.material) as MeshBasicMaterial
  expect(copy).not.toBe(m.material);expect(copy.map).toBe(m.texture)
  expect(copy.fog).toBe(false);expect(m.material.fog).toBe(true)
  expect(m.material.map).toBe(m.texture);expect(m.image.close).not.toHaveBeenCalled()
  if(mode==='small')expect(resize).not.toHaveBeenCalled()
  m.geometry.dispose();m.material.dispose();m.texture.dispose();copy.dispose()
})
