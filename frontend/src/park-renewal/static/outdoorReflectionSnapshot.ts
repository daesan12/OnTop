import captured from './baked/outdoor-reflection.json'
import gacha from './baked/gacha-reflection.json'
import type {OutdoorReflectionData} from '../../world/art/outdoorReflectionData'

/** Build-time data only. The application receives these pixels in the archive. */
export function createOutdoorReflectionSnapshot():OutdoorReflectionData {
  return restore(captured)
}
export const createGachaReflectionSnapshot=():OutdoorReflectionData=>restore(gacha)
function restore(value:{width:number;height:number;dataBase64:string}){
  const bytes=Uint8Array.from(atob(value.dataBase64),character=>character.charCodeAt(0))
  return {width:value.width,height:value.height,data:new Uint16Array(bytes.buffer)}
}
