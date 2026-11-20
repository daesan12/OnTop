import { it,expect } from 'vitest'
import { createHash } from 'node:crypto'
import checkpoint from '../fixtures/parkCheckpoint.json'
import * as layout from '../../src/layout-preview/layout'
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
it('preserves the circular plaza review layout data',()=>{
 const keys=['DRAFT_PARK','SITES','DRAFT_PAVILIONS','DRAFT_TABLES','DRAFT_BOXES','FENCE_RUNS','CENTRAL_RAIL_RUNS','STAIR_RAIL_RUNS','DRAFT_LAMPS','PATHS','PERIMETER','MARKERS','DRAFT_JUMP_PADS','DRAFT_FITNESS_STATIONS','DRAFT_TOWER_BENCHES'] as const
 const data=Object.fromEntries(keys.map(k=>[k,hash(layout[k])]))
 expect(data).toEqual(checkpoint.data)
})
