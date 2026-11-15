import { Material, Mesh, Texture } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { createStoneMaterial } from './visibility'

type Appearance = ReadonlyMap<Material, Material>
type Entry = { appearance?: Appearance; pending: Promise<void> }
const appearances = new WeakMap<GLTF, Entry>()
const MAX_ATLAS_SIZE = 1024

/** 돌탑에서만 쓰는 사본. 공원과 공유하는 GLTF 재질/Texture/Source는 수정하지 않는다. */
export async function createStoneCharacterAppearance(source: GLTF): Promise<Appearance> {
  const materials = new Set<Material>(), textures = new Map<Texture, Texture>()
  const result = new Map<Material, Material>()
  source.scene.traverse(object => {
    if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  for (const material of materials) result.set(material, createStoneMaterial(material))
  if (typeof createImageBitmap !== 'function') return result
  try {
    for (const material of materials) {
      const map = (material as Material & { map?: Texture | null }).map, image = map?.source.data as ImageBitmap | undefined
      if (!map || !image || !image.width || !image.height || Math.max(image.width, image.height) <= MAX_ATLAS_SIZE) continue
      let texture = textures.get(map)
      if (!texture) {
        const scale = MAX_ATLAS_SIZE / Math.max(image.width, image.height)
        const bitmap = await createImageBitmap(image, {
          resizeWidth: Math.max(1, Math.round(image.width * scale)), resizeHeight: Math.max(1, Math.round(image.height * scale)),
          resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
        })
        // clone/copy는 Source까지 공유한다. 별도 Texture/Source에 샘플링 설정만 옮긴다.
        texture = new Texture(bitmap)
        texture.mapping = map.mapping
        texture.wrapS = map.wrapS; texture.wrapT = map.wrapT
        texture.magFilter = map.magFilter; texture.minFilter = map.minFilter
        texture.format = map.format; texture.type = map.type
        texture.anisotropy = map.anisotropy; texture.colorSpace = map.colorSpace
        texture.channel = map.channel
        texture.offset.copy(map.offset); texture.repeat.copy(map.repeat); texture.center.copy(map.center)
        texture.rotation = map.rotation; texture.matrixAutoUpdate = map.matrixAutoUpdate; texture.matrix.copy(map.matrix)
        texture.flipY = map.flipY; texture.premultiplyAlpha = map.premultiplyAlpha
        texture.generateMipmaps = map.generateMipmaps; texture.unpackAlignment = map.unpackAlignment
        texture.internalFormat = map.internalFormat
        texture.name = `${map.name}-stone-1024`
        texture.needsUpdate = true
        textures.set(map, texture)
      }
      const copy = result.get(material)! as Material & { map: Texture }
      copy.map = texture
      result.set(material, copy)
    }
    return result
  } catch {
    for (const [original, material] of result) {
      if ('map' in material) (material as Material & { map?: Texture | null }).map = (original as Material & { map?: Texture | null }).map
    }
    for (const texture of textures.values()) { texture.dispose(); (texture.source.data as ImageBitmap).close() }
    // 리사이즈가 실패해도 원본 텍스처와 경기 전용 조명 사본으로 계속 준비한다.
    return result
  }
}

/** 같은 원본을 쓰는 8명과 다음 경기에서 한 번 만든 사본을 공유한다. */
function stoneCharacterAppearance(source: GLTF): Entry {
  let entry = appearances.get(source)
  if (!entry) {
    const created: Entry = { pending: Promise.resolve() }
    created.pending = createStoneCharacterAppearance(source).then(appearance => { created.appearance = appearance })
    appearances.set(source, created)
    entry = created
  }
  return entry
}

export function readStoneCharacterAppearance(source: GLTF): Appearance {
  const entry = stoneCharacterAppearance(source)
  if (!entry.appearance) throw entry.pending
  return entry.appearance
}

export function readStoneCharacterAppearances(sources: readonly GLTF[]): readonly Appearance[] {
  const entries = sources.map(stoneCharacterAppearance)
  const pending = entries.filter(entry => !entry.appearance)
  if (pending.length) throw Promise.all(pending.map(entry => entry.pending))
  return entries.map(entry => entry.appearance!)
}
