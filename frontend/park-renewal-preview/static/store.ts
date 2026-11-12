import {preloadRenewalTerrain} from './terrainRequest'
import type {BufferGeometry} from 'three'
import type {PropFinish} from '../../src/world/art/propGeometry'
import {installReflectionData,type OutdoorReflectionData} from '../original/world/art/outdoorReflectionData.ts'
import {RENEWAL_PARK_ENABLED} from '../../src/park/mapSelection'

export type V3 = readonly [number,number,number]
export type StaticPropArt = Partial<Record<PropFinish,BufferGeometry>>
export interface MoleShopArt {body:StaticPropArt;roof:StaticPropArt;walls:StaticPropArt}
export interface StaticPark {
  forestField: Float64Array
  plantingField: Float32Array
  ground: {
    grass: BufferGeometry; paving: BufferGeometry; retaining: BufferGeometry
    pavingBoundary: {positions:number[];indices:number[]}
  }
  groundIndex: {triangles:number[];bins:Map<number,number[]>}
  curbs: {paths:V3[][];geometry:BufferGeometry}
  hillEdges: {a:number[];z:number[]}[]
  guards: {guardRuns:V3[][];guardPosts:number[][];guardPostRailBases:number[]}
  jumpFence: {runs:V3[][];sections:{a:readonly[number,number];z:readonly[number,number]}[]}
  guardArt: {hill:Partial<Record<PropFinish,BufferGeometry>>;jump:Partial<Record<PropFinish,BufferGeometry>>}
  // Optional so an older valid archive can still use the original building path.
  buildingArt?: {mole:MoleShopArt}
  outdoorReflection?:OutdoorReflectionData
  gachaReflection?:OutdoorReflectionData
}

export let staticPark: StaticPark | undefined

export function installStaticPark(value: StaticPark) {
  installReflectionData({outdoor:value.outdoorReflection,gacha:value.gachaReflection})
  staticPark = value
}

// Browser module fetching can overlap the archive. The dependent terrain and
// material modules wait here before evaluating their snapshot or fallback.
export async function restoreStaticPark(source: string | Promise<Response>) {
  try {
    const [{readStaticPark}, archive] = await Promise.all([import('./load'), source])
    const snapshot = await readStaticPark(archive)
    installStaticPark(snapshot)
    performance.mark('park-static-ready')
  } catch (error) {
    performance.mark('park-static-fallback')
    console.warn('[park-static] Using procedural fallback', error)
  }
}

if (RENEWAL_PARK_ENABLED) await restoreStaticPark(preloadRenewalTerrain())
