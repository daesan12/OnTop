import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {REVISION,HalfFloatType,RGBAFormat,CubeUVReflectionMapping,LinearFilter,LinearSRGBColorSpace} from 'three'
import outdoor from '../src/park-renewal/static/baked/outdoor-reflection.json'
import gacha from '../src/park-renewal/static/baked/gacha-reflection.json'
import {outdoorReflection} from '../src/world/art/ornamentTextures'
import {createGachaReflection} from '../src/features/gacha/parkAsset/gachaReflection'

const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
export async function validateOutdoorReflection(root:string){
  const generator=(await readFile(resolve(root,'node_modules/three/src/extras/PMREMGenerator.js'),'utf8')).replace(/\r\n?/g,'\n')
  const threeVersion=JSON.parse(await readFile(resolve(root,'node_modules/three/package.json'),'utf8')).version
  for(const [captured,factory,textureName] of [[outdoor,outdoorReflection,'outdoor'],[gacha,createGachaReflection,'gacha']] as const){
  const source=factory()
  try {
    const sourcePixels=source.image.data
    if(!(sourcePixels instanceof Uint8Array))throw Error('Unsupported outdoor reflection source')
    const data=Buffer.from(captured.dataBase64,'base64')
    if(captured.format!=='ontop.park-pmrem.v1'||captured.textureName!==textureName||captured.threeRevision!==REVISION
      ||captured.sourceColorSpace!==source.colorSpace||captured.sourceWidth!==source.image.width||captured.sourceHeight!==source.image.height
      ||captured.sourceType!==source.type||captured.sourceFormat!==source.format||captured.sourceMapping!==source.mapping
      ||captured.sourceMinFilter!==source.minFilter||captured.sourceMagFilter!==source.magFilter||captured.sourceFlipY!==source.flipY
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
}
