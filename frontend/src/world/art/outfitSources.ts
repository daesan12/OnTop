import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from './assetLoader'

/** Outfit files are fetched when someone first wears one, not with the park: most visitors never need them. */
export const outfitUrl = (name: string) => `/art/characters/outfits/${name}.glb?rig=9`

const loaded = new Map<string, GLTF>()
const requested = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function request(name: string) {
  if (requested.has(name)) return
  requested.add(name)
  new ParkAssetLoader().loadAsync(outfitUrl(name)).then(gltf => {
    loaded.set(name, gltf)
    version++
    listeners.forEach(listener => listener())
  }, () => {
    // A missing or broken file leaves that slot on the default outfit (no retry loop per frame).
  })
}

/** The requested outfit files that have arrived; re-renders when one arrives. */
export function useOutfitSources(names: readonly string[]): ReadonlyMap<string, GLTF> {
  const key = names.join(',')
  const current = useSyncExternalStore(subscribe, () => version)
  useEffect(() => { for (const name of key ? key.split(',') : []) request(name) }, [key])
  return useMemo(() => new Map((key ? key.split(',') : []).flatMap(name => {
    const gltf = loaded.get(name)
    return gltf ? [[name, gltf] as const] : []
  })), [key, current])   // (current: a file arrived)
}
