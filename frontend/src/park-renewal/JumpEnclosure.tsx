import {PropBuilder} from '../world/art/propGeometry'
import {PropModel} from '../world/art/PropModel'
import {jumpFenceRuns} from './jumpFencePlan'
import {guardRailGeometry} from './guardLayout'
const art=(()=>{const b=new PropBuilder();for(const run of jumpFenceRuns){let travelled=2;for(let i=0;i<run.length;i++){const p=run[i]!;if(i)travelled+=Math.hypot(p[0]-run[i-1]![0],p[2]-run[i-1]![2]);if(travelled>=1.8||i===run.length-1){b.box('wood','#6e6246',[p[0],p[1]+.65,p[2]],[.14,1.3,.14]);travelled=0}}}for(const h of[.65,1.15])b.add('wood',guardRailGeometry(jumpFenceRuns,h),'#8d7d58');return b.finish()})()
export function JumpEnclosure(){return <PropModel art={art} name="jump-garden-verge-fence-with-open-south-gate"/>}
