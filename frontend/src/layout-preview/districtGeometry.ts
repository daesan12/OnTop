import { BufferGeometry,Float32BufferAttribute,RingGeometry } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { SITES,DRAFT_FOUNTAIN,fountainGroundHeight } from './layout'

const garden=new PropBuilder([12,8]),{x,z}=SITES.fitness
garden.cylinder('stone','#ada78f',[x,.17,z],1.3,1.45,.34,[0,0,0],32)
garden.cylinder('wood','#74553d',[x,3.3,z],.48,.8,6.4,[0,0,0],14)
for(let i=0;i<9;i++) {
  const a=i*2.39996,h=4.8+i%3*.6
  garden.curve('wood','#806148',[[x,2.6,z],[x+Math.cos(a)*1.1,h-1.2,z+Math.sin(a)*1.1],[x+Math.cos(a)*2.9,h+.5,z+Math.sin(a)*2.9]],.18,8)
  garden.ball('paint',['#597e4f','#73965a','#86a268'][i%3]!,[x+Math.cos(a)*2.8,h+1.4,z+Math.sin(a)*2.8],[2.35,2.8,2.35])
}
garden.ball('paint','#6b8b51',[x,9,z],[3.2,2.5,3.2])
// Four curved seating sections leave clear radial aisles into the shaded centre.
for(let quadrant=0;quadrant<4;quadrant++) {
  const start=quadrant*Math.PI/2+.2,arc=Math.PI/2-.4
  for(let slat=0;slat<4;slat++)garden.add('wood',new RingGeometry(2.6+slat*.19,2.76+slat*.19,28,1,start,arc),'#a78b60',[x,.62,z],[1,1,1],[-Math.PI/2,0,0])
  for(let i=0;i<=14;i++) {
    const a=start+arc*i/14,px=x+Math.cos(a)*2.55,pz=z-Math.sin(a)*2.55
    garden.box('wood','#8e734d',[px,.99,pz],[.13,.58,.12],[0,a,0])
    if(i%7===0)garden.box('metal','#45574a',[x+Math.cos(a)*3,.35,z-Math.sin(a)*3],[.17,.5,.65],[0,a,0])
  }
}
export const fitnessRestArt=garden.finish()

// The original recessed fountain terrain, translated without changing its profile.
const vertices:number[]=[],uv:number[]=[]
for(let row=0;row<48;row++)for(let i=0;i<128;i++) {
  const at=(r:number,n:number)=>{const a=n*Math.PI/64,x=SITES.fountain.x+Math.cos(a)*r,z=SITES.fountain.z+Math.sin(a)*r;return [x,fountainGroundHeight(x,z)+.008,z]}
  const a=at(row*.3*DRAFT_FOUNTAIN.scale,i),b=at((row+1)*.3*DRAFT_FOUNTAIN.scale,i),c=at(row*.3*DRAFT_FOUNTAIN.scale,i+1),d=at((row+1)*.3*DRAFT_FOUNTAIN.scale,i+1)
  for(const p of [a,c,b,b,c,d]){vertices.push(...p);uv.push(p[0]!/1.2,p[2]!/1.2)}
}
export const fountainTerrain=new BufferGeometry()
fountainTerrain.setAttribute('position',new Float32BufferAttribute(vertices,3));fountainTerrain.setAttribute('uv',new Float32BufferAttribute(uv,2));fountainTerrain.computeVertexNormals()
