import type {BufferGeometry} from 'three'
import type {PropFinish} from '../../world/art/propGeometry'
import type {OutdoorReflectionData} from '../../world/art/outdoorReflectionData'

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
}

// Installed before importing the app. Node exporters and dev/HMR keep using the
// original builders; only a production build supplies this immutable snapshot.
export let staticPark: StaticPark | undefined
export function installStaticPark(value: StaticPark) { staticPark = value }
