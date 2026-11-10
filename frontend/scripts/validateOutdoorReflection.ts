import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {REVISION,HalfFloatType,RGBAFormat,CubeUVReflectionMapping,LinearFilter,LinearSRGBColorSpace} from 'three'
import captured from '../src/park-renewal/static/baked/outdoor-reflection.json'
import {outdoorReflection} from '../src/world/art/ornamentTextures'

const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
export async function validateOutdoorReflection(root:string){
  const source=outdoorReflection()
  try {
    const sourcePixels=source.image.data
    if(!(sourcePixels instanceof Uint8Array))throw Error('Unsupported outdoor reflection source')
    const generator=(await readFile(resolve(root,'node_modules/three/src/extras/PMREMGenerator.js'),'utf8')).replace(/\r\n?/g,'\n')
    const threeVersion=JSON.parse(await readFile(resolve(root,'node_modules/three/package.json'),'utf8')).version
    const data=Buffer.from(captured.dataBase64,'base64')
    if(captured.format!=='ontop.outdoor-pmrem.v1'||captured.threeRevision!==REVISION
      ||captured.threeVersion!==threeVersion||captured.generatorSha256!==hash(generator)
      ||captured.sourceSha256!==hash(sourcePixels)
      ||captured.dataSha256!==hash(data)
      ||data.byteLength!==captured.width*captured.height*4*2||captured.type!==HalfFloatType
      ||captured.formatId!==RGBAFormat||captured.mapping!==CubeUVReflectionMapping
      ||captured.minFilter!==LinearFilter||captured.magFilter!==LinearFilter
      ||captured.colorSpace!==LinearSRGBColorSpace||captured.flipY!==false)
      throw Error('Outdoor reflection bake is stale; run node scripts/bake-outdoor-reflection.mjs')
  }finally {source.dispose()}
}
