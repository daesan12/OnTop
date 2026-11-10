import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url)),generated=path.join(root,'generated/park-renewal')
const sha=b=>createHash('sha256').update(b).digest('hex')
const readJSON=async p=>JSON.parse(await readFile(p,'utf8'))
const mapping=await readJSON(path.join(generated,'mapping.json'))
const baseline=await readJSON(path.join(root,'park-renewal-baseline.json'))
const coordinateSha256=sha(JSON.stringify({coordinates:mapping.coordinates,world:mapping.world}))
if(mapping.coordinates.length!==baseline.anchors||coordinateSha256!==baseline.coordinatesSha256)throw Error('Mapped coordinates/world changed from the reviewed baseline')
const migration='V167__extend_jumpmap_to_ten_stages.sql'
const migrationBytes=await readFile(path.join(root,'../backend/src/main/resources/db/minigame',migration))
if(sha(migrationBytes)!==baseline.migrationSha256)throw Error('Reviewed V167 bytes changed')
const map=await readJSON(path.join(generated,'server-map.local.json')),manifest=await readJSON(path.join(generated,'server-manifest.local.json'))
const course=await readJSON(path.join(generated,'course.local.json')),binding=await readJSON(path.join(generated,'park-bindings.local.json'))
if(!/^[a-f0-9]{64}$/.test(mapping.mappingVersion)||[map,manifest,course].some(v=>v.mapVersion!==mapping.mappingVersion)||binding.mappingVersion!==mapping.mappingVersion)throw Error('FE/BE map identity mismatch')
if(course.courseVersion!=='park220-jump10-v1'||course.rulesVersion!=='v4'||course.colliders.length!==178||course.stages.reduce((n,s)=>n+s.reward,0)!==250)throw Error('Ten-stage course contract mismatch')
const files=[],contents=new Map()
for(const name of ['server-map.local.json','server-manifest.local.json','course.local.json','course.local.sha256','park-bindings.local.json']){
 const bytes=await readFile(path.join(generated,name))
 files.push({path:name,bytes:bytes.length,sha256:sha(bytes)})
 contents.set(name,bytes)
}
if(files.find(f=>f.path==='server-map.local.json').sha256!==manifest.artifacts[0].sha256)throw Error('Map checksum mismatch')
if((await readFile(path.join(generated,'course.local.sha256'),'utf8')).trim()!==files.find(f=>f.path==='course.local.json').sha256)throw Error('Course checksum mismatch')
const release={format:'ontop.park-renewal-release',schemaVersion:1,localOnly:false,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),mapId:map.mapId,mapVersion:mapping.mappingVersion,courseVersion:course.courseVersion,rulesVersion:course.rulesVersion,coordinateSha256,anchors:baseline.anchors,assetLockSha256:sha(await readFile(path.join(root,'park-renewal-assets.lock.json'))),migration:{version:167,path:'backend/src/main/resources/db/minigame/'+migration,sha256:baseline.migrationSha256},files}
release.releaseId=sha(JSON.stringify(release))
const output=path.join(generated,'releases',release.releaseId)
contents.set('release.json',Buffer.from(JSON.stringify(release,null,2)+'\n'))
await mkdir(output,{recursive:true})
for(const[name,bytes]of contents){
 const previous=await readFile(path.join(output,name)).catch(()=>null)
 if(previous&&!previous.equals(bytes))throw Error('Existing immutable release differs: '+name)
 await writeFile(path.join(output,name),bytes)
}
await writeFile(path.join(generated,'release.json'),JSON.stringify(release,null,2)+'\n')
console.log(JSON.stringify({releaseId:release.releaseId,mapVersion:release.mapVersion,anchors:release.anchors,output:path.relative(root,output),migration:167}))
