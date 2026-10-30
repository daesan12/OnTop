import { build } from 'vite'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ParkMapData } from '../../src/map/park/index.ts'
import { sha256,type MapSource } from './artifacts.ts'
const normaliseText=(text:string)=>text.replace(/\r\n?/g,'\n')

export async function sourcesAreCurrent(root:string,sources:readonly MapSource[]) {
  for(const s of sources) {
    try {if(sha256(normaliseText(await readFile(path.join(root,s.path),'utf8')))!==s.sha256)return false}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}
  }
  return true
}
/** Bundle only the pure map entry with existing Vite. Never load the app Vite config. */
export async function loadMapInput(root:string):Promise<{data:ParkMapData;sources:MapSource[]}> {
  const sources=new Map<string,MapSource>()
  const built=await build({root,configFile:false,publicDir:false,logLevel:'silent',
    plugins:[{name:'park-map-source-snapshot',async load(id){
      if(id.startsWith('\0')||id.includes('?'))return
      const relative=path.relative(root,id).replaceAll('\\','/')
      if(!/^src\/(map|config)\/.+\.ts$/.test(relative)||relative.includes('/generated/'))return
      const text=normaliseText(await readFile(id,'utf8'))
      sources.set(relative,{path:relative,sha256:sha256(text)})
      // Compile the exact source bytes represented by the fingerprint.
      return text
    }}],build:{ssr:path.join(root,'src/map/park/index.ts'),write:false,minify:false}})
  if(Array.isArray(built)||!('output' in built))throw new Error('Unexpected map bundle output')
  const chunks=built.output.filter(o=>o.type==='chunk')
  if(chunks.length!==1||chunks[0]!.imports.length||chunks[0]!.dynamicImports.length)throw new Error('Common map must bundle without external runtime dependencies')
  const module=await import('data:text/javascript;base64,'+Buffer.from(chunks[0]!.code).toString('base64')) as {PARK_DATA:ParkMapData}
  const input={data:module.PARK_DATA,sources:[...sources.values()]}
  if(!await sourcesAreCurrent(root,input.sources))throw new Error('Map sources changed during generation; retry after saving')
  return input
}
