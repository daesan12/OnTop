import {execFile} from 'node:child_process'
import {mkdtemp,readFile,rm,rmdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {promisify} from 'node:util'

const run=promisify(execFile)

/** Keep temporary Vite/Three graphs out of the bundler process. Only compressed
 * bytes cross this boundary, after the child has closed its server and exited. */
export async function bakeRenewalStatic(root:string,mode:string){
  const directory=await mkdtemp(join(tmpdir(),'ontop-renewal-static-'))
  const output=join(directory,'park.bin.gz')
  try {
    const {stdout}=await run(process.execPath,[resolve(root,'scripts/bake-renewal-static.mjs'),resolve(root),mode,output],
      {cwd:root,windowsHide:true,maxBuffer:1024*1024})
    const summary=JSON.parse(stdout.trim()) as {rawBytes:number;compressedBytes:number;peakRssBytes:number}
    const compressed=await readFile(output)
    if(summary.compressedBytes!==compressed.byteLength)throw Error('Incomplete static park build')
    return {compressed,...summary}
  }finally {
    // Delete only the single file this invocation owns; no recursive cleanup.
    await rm(output,{force:true})
    await rmdir(directory)
  }
}
