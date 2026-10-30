import { BufferGeometry,Float32BufferAttribute } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { SITES } from './layout'
import { fountainPavingHeight,fountainPavingRadius,FOUNTAIN_PAVING_SEGMENTS } from './fountainPaving'

const garden=new PropBuilder([12,8]),{x,z}=SITES.fitness
garden.cylinder('stone','#ada78f',[x,.17,z],1.3,1.45,.34,[0,0,0],32)
// Backless radial timber slats on a dark shared frame, like the tree-ring bench
// reference. Keep the .62m seat top, four access gaps and existing seat anchors.
for(let quadrant=0;quadrant<4;quadrant++) {
  const start=quadrant*Math.PI/2+.2,arc=Math.PI/2-.4
  const count=12
  for(let i=0;i<count;i++) {
    const a=start+arc*(i+.5)/count
    garden.box('wood',['#b78a52','#c29a64','#a97e4c'][i%3]!,[x+Math.cos(a)*2.98,.56,z-Math.sin(a)*2.98],[.76,.12,2.6*arc/count*.94],[0,a,0])
    for(const r of [2.66,3.28])garden.box('metal','#34433e',[x+Math.cos(a)*r,.465,z-Math.sin(a)*r],[.1,.1,r*arc/count*1.02],[0,a,0])
  }
  for(const t of [.1,.5,.9]) {
    const a=start+arc*t
    for(const r of [2.67,3.27]){
      const px=x+Math.cos(a)*r,pz=z-Math.sin(a)*r
      garden.box('metal','#34433e',[px,.24,pz],[.105,.48,.105])
      garden.box('metal','#34433e',[px,.035,pz],[.2,.07,.2])
    }
    garden.box('metal','#34433e',[x+Math.cos(a)*2.97,.405,z-Math.sin(a)*2.97],[.76,.1,.12],[0,a,0])
  }
}
export const fitnessRestArt=garden.finish()

// The original recessed fountain terrain, translated without changing its profile.
const vertices:number[]=[],uv:number[]=[]
for(let row=0;row<48;row++)for(let i=0;i<FOUNTAIN_PAVING_SEGMENTS;i++) {
  const at=(r:number,n:number)=>{const a=n*Math.PI*2/FOUNTAIN_PAVING_SEGMENTS,x=SITES.fountain.x+Math.cos(a)*r,z=SITES.fountain.z+Math.sin(a)*r;return [x,fountainPavingHeight(x,z),z]}
  const a=at(row/48*fountainPavingRadius,i),b=at((row+1)/48*fountainPavingRadius,i),c=at(row/48*fountainPavingRadius,i+1),d=at((row+1)/48*fountainPavingRadius,i+1)
  for(const p of [a,c,b,b,c,d]){vertices.push(...p);uv.push(p[0]!/1.2,p[2]!/1.2)}
}
export const fountainTerrain=new BufferGeometry()
fountainTerrain.setAttribute('position',new Float32BufferAttribute(vertices,3));fountainTerrain.setAttribute('uv',new Float32BufferAttribute(uv,2));fountainTerrain.computeVertexNormals()
