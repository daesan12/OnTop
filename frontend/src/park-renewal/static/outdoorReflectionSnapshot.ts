import captured from './baked/outdoor-reflection.json'
import type {OutdoorReflectionData} from '../../world/art/outdoorReflectionData'

/** Build-time data only. The application receives these pixels in the archive. */
export function createOutdoorReflectionSnapshot():OutdoorReflectionData {
  const bytes=Uint8Array.from(atob(captured.dataBase64),character=>character.charCodeAt(0))
  return {width:captured.width,height:captured.height,data:new Uint16Array(bytes.buffer)}
}
