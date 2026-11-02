import { mkdir,readFile,rename,unlink,writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { SERVER_MAP_PATH,MANIFEST_PATH,FE_VERSION_PATH,type MapArtifact } from './artifacts.ts'
const readOptional=async(file:string)=>{try{return await readFile(file,'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error}}
/** Windows readers may briefly hold the destination; keep the old file until replacement succeeds. */
export async function renameArtifact(from:string,to:string,replace:typeof rename=rename) {
  for(let attempt=0;;attempt++) {
    try { await replace(from,to);return }
    catch(error) {
      if(attempt>=4||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw error
      await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)))
    }
  }
}
/** Check mode never creates directories, rewrites files or repairs a mismatch. */
export async function syncArtifacts(root:string,artifacts:readonly MapArtifact[],check:boolean) {
  const changed:MapArtifact[]=[],allowed=new Set([SERVER_MAP_PATH,MANIFEST_PATH,FE_VERSION_PATH])
  for(const artifact of artifacts) {
    if(!allowed.has(artifact.path))throw new Error('Unexpected map artifact path: '+artifact.path)
    const target=path.resolve(root,artifact.path)
    if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('Artifact escapes frontend directory')
    if(await readOptional(target)!==artifact.content)changed.push(artifact)
  }
  if(check) {
    if(changed.length)throw new Error('Stale or missing map artifacts:\n'+changed.map(a=>'  '+a.path).join('\n')+'\nRun pnpm map:generate and commit all generated files.')
    return []
  }
  const pending:Array<{target:string;temporary:string}>=[]
  try {
    // Prepare every changed file first; the manifest is the final commit marker.
    for(const a of changed) {
      const target=path.resolve(root,a.path),temporary=target+'.'+randomUUID()+'.tmp'
      await mkdir(path.dirname(target),{recursive:true});pending.push({target,temporary})
      await writeFile(temporary,a.content,'utf8')
    }
    for(const p of pending)await renameArtifact(p.temporary,p.target)
  } finally {
    await Promise.all(pending.map(async p=>{try{await unlink(p.temporary)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}))
  }
  return changed.map(a=>a.path)
}
