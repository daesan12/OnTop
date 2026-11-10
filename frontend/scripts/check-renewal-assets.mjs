import {readFile,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const lock=JSON.parse(await readFile(path.join(root,'park-renewal-assets.lock.json'),'utf8'))
if(lock.format!=='ontop.park-renewal-assets'||lock.version!==1||!lock.files.length)throw Error('Invalid approved asset lock')
for(const file of lock.files){
 const target=path.resolve(root,file.path)
 if(!target.startsWith(root)||file.path.includes('..'))throw Error('Invalid asset path')
 const bytes=await readFile(target)
 if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Asset integrity mismatch: '+file.path)
 if(!(await stat(target)).isFile())throw Error('Asset must be a regular file: '+file.path)
}
console.log(`Verified ${lock.files.length} packaged park assets`)
