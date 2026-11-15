import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from './assetLoader'
import { wholeSkinUrl } from './wholeSkin'
import { catalogSourceUrl } from './skinCatalog'

/** Outfit files are fetched when someone first wears one, not with the park: most visitors never need them. */
export const outfitUrl = (name: string) => catalogSourceUrl(name) ?? wholeSkinUrl(name) ?? `/art/characters/outfits/${name}.glb?rig=27`

const loaded = new Map<string, GLTF>()
const requested = new Set<string>()
const failed = new Set<string>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function request(name: string) {
  if (requested.has(name)) return
  requested.add(name)
  const timeout = window.setTimeout(() => {
    failed.add(name)
    listeners.forEach(listener => listener())
  }, 15000)
  new ParkAssetLoader().loadAsync(outfitUrl(name)).then(gltf => {
    window.clearTimeout(timeout)
    failed.delete(name)
    loaded.set(name, gltf)
    listeners.forEach(listener => listener())
  }, () => {
    window.clearTimeout(timeout)
    failed.add(name)
    listeners.forEach(listener => listener())
  })
}

/** Which of `key`'s files have arrived ("gat,general" → "gat"): unchanged when some other file arrives. */
const arrived = (key: string) => (key ? key.split(',') : []).filter(name => loaded.has(name)).join(',')

/** The requested outfit files that have arrived. Re-renders, with a new map, only when one of these arrives: another
 * avatar's outfit arriving keeps this map, so this avatar's rig is not rebuilt for nothing. */
export function useOutfitSources(names: readonly string[]) {
  const key = names.join(',')
  const ready = useSyncExternalStore(subscribe, () => arrived(key))
  const pending = useSyncExternalStore(subscribe, () => !!key &&
    key.split(',').some(name => !loaded.has(name) && !failed.has(name)))
  useEffect(() => { for (const name of key ? key.split(',') : []) request(name) }, [key])
  const outfits = useMemo(() => new Map((ready ? ready.split(',') : []).map(name => [name, loaded.get(name)!] as const)), [ready])
  return { outfits, pending }
}
