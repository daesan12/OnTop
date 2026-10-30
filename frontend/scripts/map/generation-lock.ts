import { mkdir,open,readFile,stat,unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
/** Coordinate the dev watcher and a manually invoked generator in this frontend checkout. */
export async function withGenerationLock<T>(root:string,task:()=>Promise<T>,timeoutMs=10000):Promise<T> {
  const directory=path.join(root,'.park-map-cache'),file=path.join(directory,'generation.lock'),token=randomUUID(),started=Date.now()
  await mkdir(directory,{recursive:true})
  for(;;) {
    try {
      const handle=await open(file,'wx')
      try{await handle.writeFile(JSON.stringify({pid:process.pid,token}))}finally{await handle.close()}
      break
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error
      try {
        const owner=JSON.parse(await readFile(file,'utf8')) as {pid:number}
        if(!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error('Invalid lock owner')
        try{process.kill(owner.pid,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH'){await unlink(file);continue}}
      } catch(e) {
        if((e as NodeJS.ErrnoException).code==='ENOENT')continue
        // A new lock can still be receiving its owner record. Only reclaim an old malformed lock.
        try{if(Date.now()-(await stat(file)).mtimeMs>30000){await unlink(file);continue}}catch(missing){if((missing as NodeJS.ErrnoException).code==='ENOENT')continue;throw missing}
      }
      if(Date.now()-started>=timeoutMs)throw new Error('Another map generator is running; retry after it finishes')
      await pause(100)
    }
  }
  try{return await task()}finally{
    try{const owner=JSON.parse(await readFile(file,'utf8')) as {token:string};if(owner.token===token)await unlink(file)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  }
}
