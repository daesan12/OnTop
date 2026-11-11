import {decodeStaticPark} from './codec'
import {installStaticPark} from './store'
import {installReflectionData} from '../original/world/art/outdoorReflectionData.ts'

/** Import the app only after hydration, so no eager scene dependency can run
 * its original builder before the exact build-time data is installed. */
export async function loadStaticPark(url:string):Promise<void> {
  performance.mark('park-static-load-start')
  try {
    const response=await fetch(url,{cache:'force-cache',signal:AbortSignal.timeout(15000)})
    if(!response.ok)throw Error('Static park HTTP '+response.status)
    let buffer=await response.arrayBuffer()
    const magic=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength))
    if(magic[0]===0x1f&&magic[1]===0x8b)buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    const snapshot=decodeStaticPark(buffer)
    installReflectionData({outdoor:snapshot.outdoorReflection,gacha:snapshot.gachaReflection})
    installStaticPark(snapshot)
    performance.mark('park-static-ready')
  }catch(error){
    // Network/cache/decoder failure keeps the original authoring path usable.
    performance.mark('park-static-fallback')
    console.warn('[park-static] Using procedural fallback',error)
  }
}
