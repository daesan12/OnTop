import {build} from 'vite'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import {createHash} from 'node:crypto'
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'generated/park-renewal'),check=process.argv.includes('--check')
const result=await build({root,configFile:false,publicDir:false,logLevel:'silent',build:{ssr:path.join(root,'src/park-renewal/mapping/backendExport.ts'),write:false,minify:false}})
const chunks=result.output.filter(o=>o.type==='chunk');if(chunks.length!==1)throw Error('Unexpected backend handoff bundle')
const temporary=path.join(root,'.vite-cache/renewal-backend-export.mjs');await mkdir(path.dirname(temporary),{recursive:true});await writeFile(temporary,chunks[0].code)
const {backendHandoff}=await import(pathToFileURL(temporary).href+'?'+Date.now()),base=JSON.parse(await readFile(path.join(root,'../backend/src/main/resources/world/park.json'),'utf8')),handoff=backendHandoff(base)
const sha=s=>createHash('sha256').update(s).digest('hex'),world=JSON.stringify(handoff.world)+'\n',course=JSON.stringify(handoff.course,null,2)+'\n'
const files={'server-map.local.json':world,'course.local.json':course,'course.local.sha256':sha(course)+'\n','server-manifest.local.json':JSON.stringify({format:'ontop.park-map-manifest',hashAlgorithm:'sha256',mapId:'park-renewal-local',schemaVersion:2,mapVersion:handoff.world.mapVersion,localOnly:true,artifacts:[{path:'generated/park-renewal/server-map.local.json',bytes:Buffer.byteLength(world),sha256:sha(world)}]},null,2)+'\n'}
const changed=[];for(const[name,content]of Object.entries(files)){const p=path.join(out,name);if(await readFile(p,'utf8').catch(()=>null)!==content){changed.push(name);if(!check)await writeFile(p,content)}}
console.log(JSON.stringify({mapVersion:handoff.world.mapVersion,stages:handoff.course.stages.length,colliders:handoff.course.colliders.length,bytes:Buffer.byteLength(world),changed},null,2));if(check&&changed.length)process.exitCode=1
