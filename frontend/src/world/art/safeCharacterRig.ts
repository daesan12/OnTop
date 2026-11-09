import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { createCharacterRig } from './CharacterRig'
import type { Look } from './characterLook'

/** 한 회원의 외부 의상 오류를 기본 캐릭터로 격리한다. */
export function createSafeCharacterRig(base: GLTF, look: Look, sources: ReadonlyMap<string, GLTF>, whole?: GLTF) {
  try { return whole ? createCharacterRig(whole) : createCharacterRig(base, look, sources) }
  catch { return createCharacterRig(base) }
}
