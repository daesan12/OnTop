import { useEffect, useState } from 'react'
import { ACESFilmicToneMapping, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { useShallow } from 'zustand/react/shallow'
import type { CharacterId } from '../../config'
import { emptyEquipment } from '../../network/equipment'
import { useSession } from '../../network/worldClient'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls, createCharacterRig } from '../../world/art/CharacterRig'
import { partImage } from '../wardrobe/itemArt'

const SIZE = 192
const sources = new Map<CharacterId, Promise<GLTF>>()
const portraits = new Map<string, Promise<string>>()

function source(character: CharacterId) {
  let gltf = sources.get(character)
  if (!gltf) sources.set(character, gltf = new ParkAssetLoader().loadAsync(characterUrls[character === 'girl' ? 1 : 0]!))
  return gltf
}

/** Head-and-shoulders shot of the actual park model, taken once into a still image (no live canvas in the HUD). */
async function shoot(character: CharacterId) {
  const model = createCharacterRig(await source(character))
  // The tablet portraits' relaxed arms-down pose.
  model.reset(); model.set('upperArm_L', 0, 0, -0.95); model.set('upperArm_R', 0, 0, 0.95)
  for (let i = 0; i < 12; i++) model.apply(0.1)
  const sun = new DirectionalLight('#ffffff', 2)
  sun.position.set(2, 4, 4)
  const scene = new Scene().add(model.root, new HemisphereLight('#fff7df', '#655c43', 2), sun)
  scene.updateMatrixWorld(true)
  const head = model.bones.head.getWorldPosition(new Vector3())
  const camera = new PerspectiveCamera(30, 1, 0.05, 10)
  // Framed so the girl's tied-up hair and both collars fit.
  camera.position.set(head.x, head.y + 0.27, head.z + 1.95)
  camera.lookAt(head.x, head.y + 0.27, head.z)
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  try {
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.setSize(SIZE, SIZE, false)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/webp', 0.9)
  } finally {
    renderer.dispose(); renderer.forceContextLoss(); model.dispose()
  }
}

/** The own character's profile picture. The outfit is part of the key, so worn clothes are re-shot
 * as soon as the park model shows them; until a shot is ready the pre-rendered face of the same model stands in. */
export function useOwnPortrait() {
  const { character, outfit } = useSession(useShallow(s => ({
    character: s.profiles[s.sessionId]?.character,
    outfit: (s.equipment[s.sessionId] ?? emptyEquipment).map(item => item.itemId).sort().join(','),
  })))
  const key = `${character}|${outfit}`
  const [shot, setShot] = useState<{ key: string; url: string } | null>(null)
  useEffect(() => {
    if (!character) return
    let live = true, portrait = portraits.get(key)
    if (!portrait) {
      portraits.set(key, portrait = shoot(character))
      portrait.catch(() => portraits.delete(key))
    }
    portrait.then(url => { if (live) setShot({ key, url }) }, () => {})
    return () => { live = false }
  }, [key, character])
  return shot?.key === key ? shot.url : partImage(character ?? 'man', 'FACE')!
}
