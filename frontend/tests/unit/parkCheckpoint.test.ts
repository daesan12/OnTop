import { it,expect } from 'vitest'
import { createHash } from 'node:crypto'
import checkpoint from '../fixtures/parkCheckpoint.json'
import * as layout from '../../src/layout-preview/layout'
import * as lake from '../../src/layout-preview/lakeLayout'
it('preserves the circular plaza review layout and 19,881 movement/height/swimming samples',()=>{
 const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
 const movement=[]
 for(let zi=0;zi<=140;zi++)for(let xi=0;xi<=140;xi++){const x=-91+xi*1.3,z=-91+zi*1.3;movement.push([layout.canWalk(x,z),layout.walkHeight(x,z).toFixed(6),lake.swimmingAt(x,z)])}
 const keys=['DRAFT_PARK','SITES','DRAFT_PAVILIONS','DRAFT_TABLES','DRAFT_BOXES','FENCE_RUNS','CENTRAL_RAIL_RUNS','STAIR_RAIL_RUNS','DRAFT_LAMPS','PATHS','PERIMETER','MARKERS','DRAFT_JUMP_PADS','DRAFT_FITNESS_STATIONS','DRAFT_TOWER_BENCHES'] as const
 const data=Object.fromEntries(keys.map(k=>[k,hash(layout[k])]))
 expect(data).toEqual(checkpoint.data)
 expect(hash(movement)).toBe(checkpoint.movement)
})
