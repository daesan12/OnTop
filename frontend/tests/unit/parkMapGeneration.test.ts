import { describe,it,expect } from 'vitest'
import { mkdtemp,readFile,writeFile,rm,stat,unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PARK_DATA,PARK_DEFINITION,resolveParkLayout } from '../../src/map/park'
import { canonicalJson,createMapArtifacts,sha256,FE_VERSION_PATH,SERVER_MAP_PATH,MANIFEST_PATH } from '../../scripts/map/artifacts'
import { syncArtifacts } from '../../scripts/map/write-artifacts'
import { withGenerationLock } from '../../scripts/map/generation-lock'
import { generationQueue } from '../../scripts/map/generation-queue'
const sources=[{path:'src/map/park/definition.ts',sha256:sha256('definition')},{path:'src/map/park/resolve.ts',sha256:sha256('rules')}]
const artifact=()=>createMapArtifacts(PARK_DATA,sources)
const removeTemp=async(directory:string)=>{
  if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep+'ontop-map-'))throw new Error('Unexpected test cleanup directory')
  await rm(directory,{recursive:true,force:true})
}
describe('park map generation',()=>{
  it('produces byte-identical files independent of key and source-list order',()=>{
    const reordered=JSON.parse(JSON.stringify(PARK_DATA,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v))
    expect(createMapArtifacts(reordered,[...sources].reverse())).toEqual(artifact())
    expect(canonicalJson({b:1,a:-0})).toBe('{"a":0,"b":1}')
  })
  it('changes one shared version when placement or calculation source changes',()=>{
    const d=structuredClone(PARK_DEFINITION);d.sites.drink.x+=.25
    const moved=createMapArtifacts(resolveParkLayout(d).data,sources),original=artifact()
    expect(moved.mapVersion).not.toBe(original.mapVersion)
    expect(moved.server.data.tables.map(t=>t.id)).toEqual(PARK_DATA.tables.map(t=>t.id))
    expect(moved.server.data.collision.obstacles.find(o=>o.id==='layout-drink')).toMatchObject({x:PARK_DEFINITION.sites.drink.x+.25})
    const changedSource=createMapArtifacts(PARK_DATA,[{...sources[0]!,sha256:sha256('new rules')},sources[1]!])
    expect(changedSource.mapVersion).not.toBe(original.mapVersion)
    expect(changedSource.manifest.hashes.dataHash).toBe(original.manifest.hashes.dataHash)
  })
  it('links the server document, FE literal, checksums and manifest',()=>{
    const result=artifact(),server=JSON.parse(result.artifacts.find(a=>a.path===SERVER_MAP_PATH)!.content)
    const {data,mapVersion,...identity}=server
    expect(sha256(canonicalJson(identity))).toBe(mapVersion)
    expect(sha256(canonicalJson(data))).toBe(identity.hashes.dataHash)
    expect(result.artifacts.find(a=>a.path===FE_VERSION_PATH)!.content).toContain(result.mapVersion)
    for(const file of result.manifest.artifacts) {
      const actual=result.artifacts.find(a=>a.path===file.path)!
      expect(sha256(actual.content)).toBe(file.sha256);expect(Buffer.byteLength(actual.content,'utf8')).toBe(file.bytes)
    }
    expect(result.manifest.counts.tables).toBe(18)
    expect(server.semantics.additionalPlayerInflation).toBe('server-capsule-only')
    expect(server.semantics.previewCollision.serverPhysics).toBe(false)
    expect(server.schemaVersion).toBe(2)
    expect(result.manifest.validation.backendIntegration).toBe('pending')
  })
  it.each([NaN,Infinity,()=>0,new Date(),[undefined]])('rejects non-JSON values: %s',value=>{
    expect(()=>canonicalJson(value)).toThrow()
  })
  it('rejects duplicate source records and host-dependent paths',()=>{
    expect(()=>createMapArtifacts(PARK_DATA,[sources[0]!,sources[0]!])).toThrow(/duplicated/)
    expect(()=>createMapArtifacts(PARK_DATA,[{path:'C:/repo/source.ts',sha256:sha256('x')}])).toThrow(/Invalid/)
  })
  it('fails stale/missing checks without changing files, then repairs all artifacts',async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'ontop-map-artifacts-')),files=artifact().artifacts
    try {
      await expect(syncArtifacts(directory,[{path:'../backend/forbidden.json',content:'x'}],false)).rejects.toThrow(/Unexpected map artifact path/)
      await expect(syncArtifacts(directory,files,true)).rejects.toThrow(/Stale or missing/)
      await expect(stat(path.join(directory,'generated'))).rejects.toThrow()
      expect(await syncArtifacts(directory,files,false)).toHaveLength(3)
      const before=await stat(path.join(directory,FE_VERSION_PATH))
      expect(await syncArtifacts(directory,files,false)).toEqual([])
      expect((await stat(path.join(directory,FE_VERSION_PATH))).mtimeMs).toBe(before.mtimeMs)
      for(const file of files) {
        const target=path.join(directory,file.path)
        await writeFile(target,'tampered\n')
        await expect(syncArtifacts(directory,files,true)).rejects.toThrow(file.path)
        expect(await readFile(target,'utf8')).toBe('tampered\n')
        await syncArtifacts(directory,files,false)
      }
      await unlink(path.join(directory,MANIFEST_PATH))
      await expect(syncArtifacts(directory,files,true)).rejects.toThrow(MANIFEST_PATH)
      await expect(stat(path.join(directory,MANIFEST_PATH))).rejects.toThrow()
      await syncArtifacts(directory,files,false)
      expect(await syncArtifacts(directory,files,true)).toEqual([])
    } finally {await removeTemp(directory)}
  })
  it('serialises generator writers in the same checkout',async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'ontop-map-lock-')),events:string[]=[]
    let release!:()=>void,entered!:()=>void
    try {
      const gate=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{entered=resolve})
      const first=withGenerationLock(directory,async()=>{events.push('first');entered();await gate;events.push('first done')})
      await started
      const second=withGenerationLock(directory,async()=>{events.push('second')})
      await new Promise(resolve=>setTimeout(resolve,30));expect(events).toEqual(['first'])
      release();await Promise.all([first,second]);expect(events).toEqual(['first','first done','second'])
    } finally {release?.();await removeTemp(directory)}
  })
  it('lets a later save recover after a failed queued generation',async()=>{
    let attempt=0
    const run=generationQueue(async()=>{attempt++;if(attempt===1)throw new Error('bad definition');return attempt})
    await expect(run()).rejects.toThrow('bad definition');await expect(run()).resolves.toBe(2)
  })
})
