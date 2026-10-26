/** Run baseline and real relocation cases against Java physics/WebSocket and the FE scene. */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const backend=path.resolve(root,'../backend'),source=path.join(root,'src/map/park/definition.ts')
const cache=path.join(root,'.park-map-cache');await fs.mkdir(cache,{recursive:true})
const lock=await fs.open(path.join(cache,'flow-verification.lock'),'wx')
const artifacts=path.resolve(process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-park-flow-'+Date.now()))
await fs.mkdir(artifacts,{recursive:true})
const original=await fs.readFile(source,'utf8')
const candidate=original.replace("'table-1': [-10, 32]","'table-1': [-12, 32]").replace('mailbox: { x: -18, z: 18 }','mailbox: { x: -16, z: 18 }')
const results=[]
let touched=false
async function run(command,args,cwd,env={}) {
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,stdio:'inherit',env:{...process.env,...env}})
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(command+' exited '+code)))
  })
}
async function generate(){await run(process.execPath,['scripts/generate-park-map.mjs'],root)}
async function verify(label) {
  const folder=path.join(artifacts,label);await fs.mkdir(folder,{recursive:true})
  const json=JSON.parse(await fs.readFile(path.join(root,'generated/park/server-map.json'),'utf8'))
  const env={PARK_LIVE_BROWSER:'true',QA_ARTIFACT_DIR:folder,PLAYWRIGHT_OUTPUT_DIR:path.join(folder,'playwright')}
  if(process.platform==='win32')await run(process.env.ComSpec??'cmd.exe',['/d','/s','/c','gradlew.bat parkMapTest --no-daemon'],backend,env)
  else await run('./gradlew',['parkMapTest','--no-daemon'],backend,env)
  await fs.copyFile(path.join(backend,'build/park-live-browser.log'),path.join(folder,'browser.log'))
  results.push({label,mapVersion:json.mapVersion,table1:json.data.tables.find(t=>t.id==='table-1').position,mailbox:json.data.interactions.mailbox.position,status:'passed'})
}
try {
  if(candidate===original||!original.includes("'table-1': [-10, 32]")||!original.includes('mailbox: { x: -18, z: 18 }'))throw Error('Relocation fixture needs review for the current authoring coordinates')
  await fs.writeFile(path.join(artifacts,'definition.before.ts'),original)
  await generate();await verify('baseline')
  if(await fs.readFile(source,'utf8')!==original)throw Error('Authoring source changed during verification')
  touched=true;await fs.writeFile(source,candidate);await generate();await verify('relocated')
  if(results[0].mapVersion===results[1].mapVersion)throw Error('Relocation did not change map version')
} finally {
  try {
    if(touched) {
      if(await fs.readFile(source,'utf8')!==candidate)throw Error('Concurrent authoring edit detected: restore manually from '+artifacts)
      await fs.writeFile(source,original);await generate()
    }
    await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({results,restored:!touched||await fs.readFile(source,'utf8')===original},null,2)+'\n')
  } finally {await lock.close();await fs.unlink(path.join(cache,'flow-verification.lock'))}
}
console.log('[park-flow] Passed both real Java + browser cases; original layout restored. '+artifacts)
