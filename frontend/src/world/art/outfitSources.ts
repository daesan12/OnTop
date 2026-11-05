import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from './assetLoader'

/** Outfit files are fetched when someone first wears one, not with the park: most visitors never need them. */
export const outfitUrl = (name: string) => `/art/characters/outfits/${name}.glb?rig=11`

const loaded = new Map<string, GLTF>()
const requested = new Set<string>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function request(name: string) {
  if (requested.has(name)) return
  requested.add(name)
  new ParkAssetLoader().loadAsync(outfitUrl(name)).then(gltf => {
    loaded.set(name, gltf)
    listeners.forEach(listener => listener())
  }, () => {
    // A missing or broken file leaves that slot on the default outfit (no retry loop per frame).
  })
}

/** Which of `key`'s files have arrived ("gat,general" → "gat"): unchanged when some other file arrives. */
const arrived = (key: string) => (key ? key.split(',') : []).filter(name => loaded.has(name)).join(',')

/** The requested outfit files that have arrived. Re-renders, with a new map, only when one of these arrives: another
 * avatar's outfit arriving keeps this map, so this avatar's rig is not rebuilt for nothing. */
export function useOutfitSources(names: readonly string[]): ReadonlyMap<string, GLTF> {
  const key = names.join(',')
  const ready = useSyncExternalStore(subscribe, () => arrived(key))
  useEffect(() => { for (const name of key ? key.split(',') : []) request(name) }, [key])
  return useMemo(() => new Map((ready ? ready.split(',') : []).map(name => [name, loaded.get(name)!] as const)), [ready])
}
