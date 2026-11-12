import {fetchStaticTerrain,takeRenewalTerrain} from './terrainRequest'
import {CubeUVReflectionMapping, HalfFloatType, LinearSRGBColorSpace, type BufferGeometry} from 'three'
import type {PropFinish} from '../../src/world/art/propGeometry'
import {installReflectionData,type OutdoorReflectionData} from '../original/world/art/outdoorReflectionData.ts'
import {RENEWAL_PARK_ENABLED} from '../../src/park/mapSelection'
import {outdoorReflectionMap} from '../../src/world/art/ornamentTextures'
import type {GroundIndex} from './groundIndex'

export type V3 = readonly [number,number,number]
export type StaticPropArt = Partial<Record<PropFinish,BufferGeometry>>
export interface MoleShopArt {body:StaticPropArt;roof:StaticPropArt;walls:StaticPropArt}
export interface StaticPark {
  forestField: Float64Array
  plantingField: Float32Array
  ground: {
    grass: BufferGeometry; paving: BufferGeometry; retaining: BufferGeometry
  }
  groundIndex: GroundIndex
  curbs: {paths:V3[][]}
  hillEdges: {a:number[];z:number[]}[]
  guards: {guardRuns:V3[][];guardPosts:number[][];guardPostRailBases:number[]}
  jumpFence: {runs:V3[][];sections:{a:readonly[number,number];z:readonly[number,number]}[]}
  // Optional so an older valid archive can still use the original building path.
  buildingArt?: {mole:MoleShopArt}
  outdoorReflection?:OutdoorReflectionData
  gachaReflection?:OutdoorReflectionData
}

export let staticPark: StaticPark | undefined

export function installStaticPark(value: StaticPark) {
  installReflectionData({outdoor:value.outdoorReflection,gacha:value.gachaReflection})
  if (RENEWAL_PARK_ENABLED && value.outdoorReflection) {
    // Existing live materials keep their texture reference after the archive loads.
    const { data, width, height } = value.outdoorReflection
    outdoorReflectionMap.image = { data, width, height }
    outdoorReflectionMap.type = HalfFloatType
    outdoorReflectionMap.mapping = CubeUVReflectionMapping
    outdoorReflectionMap.colorSpace = LinearSRGBColorSpace
    outdoorReflectionMap.needsUpdate = true
  }
  staticPark = value
}

// Browser module fetching can overlap the archive. The dependent terrain and
// material modules wait here before evaluating their snapshot or fallback.
export async function restoreStaticPark(source: string | Promise<ArrayBuffer>) {
  try {
    const [{decodeStaticPark}, archive] = await Promise.all([
      import('./codec'), typeof source === 'string' ? fetchStaticTerrain(source) : source,
    ])
    const snapshot = decodeStaticPark(archive)
    performance.mark('park-static-decoded')
    installStaticPark(snapshot)
    performance.mark('park-static-ready')
  } catch (error) {
    performance.mark('park-static-fallback')
    console.warn('[park-static] Using procedural fallback', error)
  }
}

if (RENEWAL_PARK_ENABLED) await restoreStaticPark(takeRenewalTerrain())
