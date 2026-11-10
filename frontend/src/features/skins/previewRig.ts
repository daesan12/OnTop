import { SkinnedMesh } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { defaultLook, pieceShown, type CharacterVariant } from '../../world/art/characterLook'
import { createCharacterRig } from '../../world/art/CharacterRig'
import type { SkinDefinition } from './api'

/** 공용 의상은 남녀 모두 실제 표시할 조각을 가져야 한다. 빈 geometry도 검수 성공으로 처리하지 않는다. */
export function assertSkinPreviewPieces(model: GLTF, definition: Pick<SkinDefinition, 'wearMode' | 'slots'>, variant: CharacterVariant) {
  if (definition.wearMode === 'WHOLE') return
  const look = defaultLook(variant), covered = new Set<string>()
  for (const slot of definition.slots) look[slot] = { source: 'preview', id: 'a' }
  model.scene.traverse(object => {
    if (!(object instanceof SkinnedMesh) || !Array.isArray(object.userData.pieces)) return
    for (const piece of object.userData.pieces) {
      if (!Array.isArray(piece) || typeof piece[0] !== 'string' || !Number.isInteger(piece[1]) || !Number.isInteger(piece[2]) || piece[1] < 0 || piece[2] <= 0
        || piece[1] + piece[2] > (object.geometry.index?.count ?? 0)) continue
      const slot = piece[0].match(/^item__([A-Z]+)__a(?:__|$)/)?.[1]
      if (slot && pieceShown(piece[0], 'preview', variant, look)) covered.add(slot)
    }
  })
  if (definition.slots.some(slot => !covered.has(slot))) throw new Error('해당 캐릭터에서 보이지 않는 의상 조각이 있어요.')
}

export function createSkinPreviewRig(model: GLTF, base: GLTF, definition: SkinDefinition, variant: CharacterVariant) {
  assertSkinPreviewPieces(model, definition, variant)
  if (definition.wearMode === 'WHOLE') return createCharacterRig(model)
  const look = defaultLook(variant)
  for (const slot of definition.slots) look[slot] = { source: 'preview', id: 'a' }
  return createCharacterRig(base, look, new Map([['preview', model]]))
}
