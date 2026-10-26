import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { generationQueue } from './map/generation-queue.ts'

/** Only the independent 180m preview watches/regenerates map artifacts. */
export function parkMapGenerationPlugin():Plugin {
  let active=false,root='',sources=new Set<string>()
  const relative=(file:string)=>path.relative(root,file).replaceAll('\\','/')
  const run=generationQueue(async()=>{
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(process.execPath,[path.join(root,'scripts/generate-park-map.mjs')],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true})
      let output=''
      child.stdout.on('data',chunk=>{output+=String(chunk)});child.stderr.on('data',chunk=>{output+=String(chunk)})
      child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(output||'Map generation failed')))
    })
    const manifest=JSON.parse(await readFile(path.join(root,'generated/park/manifest.json'),'utf8')) as {sources:{path:string}[]}
    sources=new Set(manifest.sources.map(s=>s.path))
    return [...sources].map(file=>path.join(root,file))
  })
  return {
    name:'park-map-generation',apply:'serve',
    configResolved(config){active=config.mode==='layout-preview';root=config.root},
    async configureServer(server){
      if(!active)return
      server.watcher.add(await run())
    },
    async handleHotUpdate(context){
      if(!active||!sources.has(relative(context.file)))return
      try {
        context.server.watcher.add(await run())
        // Static model batches and the generated version must be replaced together.
        context.server.ws.send({type:'full-reload',path:'*'})
      } catch(error) {
        const message=error instanceof Error?error.message:String(error)
        context.server.config.logger.error('[park-map] '+message)
        context.server.ws.send({type:'error',err:{message:'[park-map] '+message,stack:''}})
      }
      return []
    },
  }
}
