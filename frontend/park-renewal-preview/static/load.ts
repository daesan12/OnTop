import {decodeStaticPark} from './codec'
import {fetchStaticTerrain} from './terrainRequest'

/** Read exact terrain and art without importing their scene consumers. */
export async function readStaticPark(source:string|Response) {
  const response=typeof source==='string'?await fetchStaticTerrain(source):source
  if(!response.ok)throw Error('Static park HTTP '+response.status)
  let buffer=await response.arrayBuffer()
  const magic=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength))
  if(magic[0]===0x1f&&magic[1]===0x8b)buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  return decodeStaticPark(buffer)
}
