import {it,expect} from 'vitest'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import checkpoint from '../fixtures/parkVisualCheckpoint.json'

it('keeps the accepted new-map models, placement and removed-ad state when syncing functions',()=>{
 const changed=Object.entries(checkpoint.files).filter(([file,hash])=>createHash('sha256').update(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex')!==hash).map(([file])=>file)
 expect(changed).toEqual([])
})
