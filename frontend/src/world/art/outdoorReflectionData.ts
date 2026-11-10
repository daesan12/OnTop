export interface OutdoorReflectionData {width:number;height:number;data:Uint16Array}
let baked:OutdoorReflectionData|undefined

/** Installed only by the new park bootstrap, before any shared art is imported. */
export function installOutdoorReflectionData(value:OutdoorReflectionData|undefined){
  if(value&&(!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)
    ||value.width<1||value.height<1||value.width>2048||value.height>2048
    ||!(value.data instanceof Uint16Array)||value.data.length!==value.width*value.height*4))throw Error('Invalid outdoor reflection data')
  baked=value
}
export const getOutdoorReflectionData=()=>baked
