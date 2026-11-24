import { Suspense, useMemo, type ReactNode } from 'react'
import { useLoader } from '@react-three/fiber'
import type { Material, Mesh, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { ParkAssetLoader } from '../src/world/art/assetLoader'

// Encounter creatures generated with Gemini (turnaround sheet) + Tripo (multiview to 3D), then decimated and
// compressed (character_work/horror_monsters: monster_prep.py + pack.mjs). S15P31B105-450.
// Each file stands on its own origin (feet at 0, or the waist / ankles for the pool and hanging figures) and faces +z.
export const ENCOUNTER_MODEL_URLS: Partial<Record<number, string>> = {
  2: new URL('./models/encounter-02.glb', import.meta.url).href,
  3: new URL('./models/encounter-03.glb', import.meta.url).href,
  4: new URL('./models/encounter-04.glb', import.meta.url).href,
  7: new URL('./models/encounter-07.glb', import.meta.url).href,
  8: new URL('./models/encounter-08.glb', import.meta.url).href,
  9: new URL('./models/encounter-09.glb', import.meta.url).href,
  10: new URL('./models/encounter-10.glb', import.meta.url).href,
  11: new URL('./models/encounter-11.glb', import.meta.url).href,
}
// Start fetching as soon as the underground code loads, so the first encounter rarely falls back.
for (const url of Object.values(ENCOUNTER_MODEL_URLS)) if (url) useLoader.preload(ParkAssetLoader, url)

/** Pale skin, eyes and bone glow a little in the dark (the texture's bright parts, squared); dark cloth stays dark. */
function glowFromTexture(strength: number) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
 { vec3 tGlow = texture2D( map, vMapUv ).rgb; totalEmissiveRadiance += tGlow * tGlow * tGlow * ${strength.toFixed(3)}; }
#endif`)
  }
}

type Place = { at?: [number, number, number]; rotation?: [number, number, number]; scale?: number }
function Model({ id, glow, at, rotation, scale }: { id: number; glow: number } & Place) {
  const gltf = useLoader(ParkAssetLoader, ENCOUNTER_MODEL_URLS[id]!)
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse(object => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const patch = (m: Material) => {
        const material = (m as MeshStandardMaterial).clone()
        material.onBeforeCompile = glowFromTexture(glow)
        material.customProgramCacheKey = () => 'encounter-glow-' + glow
        return material
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
    })
    return copy
  }, [gltf, glow])
  return <primitive object={scene} position={at} rotation={rotation} scale={scale} />
}

/** The Tripo creature for encounter `id`, or `fallback` (the sculpted one) while it loads or if there is none. */
export function TripoEncounter({ id, fallback, glow = 1.4, ...place }: { id: number; fallback: ReactNode; glow?: number } & Place) {
  if (!ENCOUNTER_MODEL_URLS[id]) return <>{fallback}</>
  return <Suspense fallback={fallback}><Model id={id} glow={glow} {...place} /></Suspense>
}
