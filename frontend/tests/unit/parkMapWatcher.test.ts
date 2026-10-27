import { it,expect,vi } from 'vitest'
import { createServer } from 'vite'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp,mkdir,mkdtemp,readFile,writeFile,rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parkMapGenerationPlugin } from '../../scripts/park-map-vite-plugin'
import { SERVER_MAP_PATH,MANIFEST_PATH,FE_VERSION_PATH } from '../../scripts/map/artifacts'
const execute=promisify(execFile)
const payloadType=(payload:unknown)=>payload&&typeof payload==='object'&&'type' in payload?payload.type:undefined
const root=fileURLToPath(new URL('../../',import.meta.url))
it('preview watcher regenerates matching server/FE versions, preserves last good data on error and recovers',async()=>{
  const cache=path.resolve(root,'.park-map-cache');await mkdir(cache,{recursive:true})
  const fixture=await mkdtemp(path.join(cache,'watch-test-'))
  let server:Awaited<ReturnType<typeof createServer>>|undefined
  const events:unknown[]=[]
  try {
    const manifest=JSON.parse(await readFile(path.join(root,MANIFEST_PATH),'utf8')) as {sources:{path:string}[]}
    for(const source of manifest.sources){await mkdir(path.dirname(path.join(fixture,source.path)),{recursive:true});await writeFile(path.join(fixture,source.path),(await readFile(path.join(root,source.path),'utf8')).replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n'))}
    await cp(path.join(root,'scripts'),path.join(fixture,'scripts'),{recursive:true})
    await writeFile(path.join(fixture,'package.json'),'{"type":"module"}')
    server=await createServer({root:fixture,configFile:false,mode:'layout-preview',plugins:[parkMapGenerationPlugin()],logLevel:'silent',server:{host:'127.0.0.1',port:0,watch:{usePolling:true,interval:50}}})
    // Polling keeps Windows file events reliable under the full parallel suite.
    // Wait for the source subscription before issuing the first saved edit.
    server.watcher.on('all',(event,file)=>events.push([event,path.relative(fixture,file)]))
    await server.listen()
    await vi.waitFor(()=>expect(Object.values(server!.watcher.getWatched()).some(files=>files.includes('definition.ts'))).toBe(true),{timeout:10000})
    await server.transformRequest('/src/map/park/definition.ts')
    const send=vi.spyOn(server.ws,'send')
    send.mockImplementation((payload:unknown)=>{events.push(payload)})
    const readServer=async()=>JSON.parse(await readFile(path.join(fixture,SERVER_MAP_PATH),'utf8'))
    const first=await readServer()
    expect(first.mapVersion).toBe(JSON.parse(await readFile(path.join(root,SERVER_MAP_PATH),'utf8')).mapVersion)
    const source=path.join(fixture,'src/map/park/definition.ts'),original=await readFile(source,'utf8')
    await writeFile(source,original.replace('shop: { x: -29, z: 35 }','shop: { x: -28.75, z: 35 }'))
    await vi.waitFor(async()=>expect((await readServer()).mapVersion).not.toBe(first.mapVersion),{timeout:10000,interval:100})
    await vi.waitFor(()=>expect(send.mock.calls.some(([payload])=>payloadType(payload)==='full-reload')).toBe(true),{timeout:10000})
    const changed=await readServer()
    expect(changed.data.facilities.find((f:{id:string})=>f.id==='layout-shop').position[0]).toBe(-28.75)
    expect(await readFile(path.join(fixture,FE_VERSION_PATH),'utf8')).toContain(changed.mapVersion)
    await writeFile(source,original.replace('shop: { x: -29, z: 35 }','shop: { x: NaN, z: 35 }'))
    await vi.waitFor(()=>expect(send.mock.calls.some(([payload])=>payloadType(payload)==='error')).toBe(true),{timeout:10000,interval:100})
    expect((await readServer()).mapVersion).toBe(changed.mapVersion)
    expect(await readFile(path.join(fixture,FE_VERSION_PATH),'utf8')).toContain(changed.mapVersion)
    await writeFile(source,original)
    await vi.waitFor(async()=>expect((await readServer()).mapVersion).toBe(first.mapVersion),{timeout:10000,interval:100})
    await vi.waitFor(async()=>expect(await readFile(path.join(fixture,FE_VERSION_PATH),'utf8')).toContain(first.mapVersion),{timeout:10000})
    await vi.waitFor(()=>expect(send.mock.calls.filter(([payload])=>payloadType(payload)==='full-reload').length).toBeGreaterThanOrEqual(2),{timeout:10000})
    await server.close();server=undefined
    const cli=path.join(fixture,'scripts/generate-park-map.mjs')
    const checked=await execute(process.execPath,[cli,'--check'],{cwd:fixture})
    expect(checked.stdout).toContain('verified')
    const fePath=path.join(fixture,FE_VERSION_PATH),tampered='// tampered version\n'
    await writeFile(fePath,tampered)
    await expect(execute(process.execPath,[cli,'--check'],{cwd:fixture})).rejects.toMatchObject({code:1,stderr:expect.stringContaining(FE_VERSION_PATH)})
    expect(await readFile(fePath,'utf8')).toBe(tampered)
    await execute(process.execPath,[cli],{cwd:fixture})
    expect(await readFile(fePath,'utf8')).toContain(first.mapVersion)
    await expect(execute(process.execPath,[cli,'--unknown'],{cwd:fixture})).rejects.toMatchObject({code:1})
  } catch(error){console.error(JSON.stringify(events));throw error} finally {
    await server?.close()
    if(!path.resolve(fixture).startsWith(cache+path.sep+'watch-test-'))throw new Error('Unexpected watcher cleanup directory')
    await rm(fixture,{recursive:true,force:true})
  }
},30000)
