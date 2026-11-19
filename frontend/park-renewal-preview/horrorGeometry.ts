import {BufferGeometry,Float32BufferAttribute} from 'three'
import {PropBuilder} from '../src/world/art/propGeometry'
import {HORROR as h,HORROR_OUTLINE,HORROR_PORTALS,HORROR_SOLIDS,HORROR_CRYPT,inHorror,horrorGround} from './horrorPlan'

/** All structural surfaces are volumes, including floor, roof and door lintels. */
export const horrorShell=(()=>{
 const b=new PropBuilder(),bottom=h.floor-.35,top=h.ceiling+.7
 for(const [x,z,w,d]of[[0,-76.5,52,57],[-42,-71,32,46]]){b.box('stone','#333b3a',[x!,h.floor-.25,z!],[w!,.5,d!]);b.box('stone','#282d2d',[x!,h.ceiling+.55,z!],[w!,1.1,d!])}
 for(let i=0;i<HORROR_OUTLINE.length;i++){
  const a=HORROR_OUTLINE[i]!,c=HORROR_OUTLINE[(i+1)%HORROR_OUTLINE.length]!,dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz),horizontal=dz===0,mid=[(a[0]+c[0])/2,(a[1]+c[1])/2],normal=[-dz/length,dx/length];if(!inHorror(mid[0]!+normal[0]!*.2,mid[1]!+normal[1]!*.2))normal.forEach((v,k)=>normal[k]=-v)
  const portal=HORROR_PORTALS.find(p=>!horizontal&&p.x===a[0]&&p.z>Math.min(a[1],c[1])&&p.z<Math.max(a[1],c[1]))
  const cuts=[0,length];if(portal)cuts.push(Math.abs(portal.z-a[1])-portal.width/2,Math.abs(portal.z-a[1])+portal.width/2);cuts.sort((a,b)=>a-b)
  const wall=(start:number,end:number,lo:number,hi:number)=>{if(hi<=lo||end<=start)return;const t=(start+end)/2/length;b.box('stone','#39413e',[a[0]+dx*t+normal[0]!*.45,(lo+hi)/2,a[1]+dz*t+normal[1]!*.45],[horizontal?end-start+.02:.9,hi-lo,horizontal?.9:end-start+.02])}
  for(let j=1;j<cuts.length;j++){const start=cuts[j-1]!,end=cuts[j]!,z=a[1]+dz*((start+end)/2/length);if(portal&&Math.abs(z-portal.z)<portal.width/2){wall(start,end,bottom,portal.floor);wall(start,end,portal.floor+portal.height,top)}else wall(start,end,bottom,top)}
 }
 return b.finish()
})()
export const horrorRamp=(()=>{
 const p:number[]=[],ix:number[]=[],bottom=h.floor-.35,exitY=HORROR_PORTALS[1].floor
 const quad=(a:number,b:number,c:number,d:number)=>ix.push(a,b,c,a,c,d)
 for(let i=0;i<=60;i++){const z=-55-i*29.3/60,y=horrorGround(-52,z);p.push(-54.5,y,z,-49.5,y,z,-54.5,bottom,z,-49.5,bottom,z);if(i<60){const k=i*4;quad(k,k+1,k+5,k+4);quad(k,k+4,k+6,k+2);quad(k+1,k+3,k+7,k+5);quad(k+2,k+6,k+7,k+3)}}
 quad(0,2,3,1);quad(240,241,243,242)
 const base=p.length/3;for(const y of[exitY,bottom])for(const [x,z]of[[-58,-94],[-49,-94],[-49,-84.3],[-58,-84.3]])p.push(x!,y,z!)
 quad(base,base+3,base+2,base+1);quad(base+4,base+5,base+6,base+7);for(let i=0;i<4;i++)quad(base+i,base+(i+1)%4,base+(i+1)%4+4,base+i+4)
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g
})()
export const HORROR_LAMPS=[[-20,-98],[20,-97],[19,-60],[-20,-55],[-36,-56],[-46.2,-79],[-30,-88],[-52,-64],[-52,-80],[-56.4,-91],[24.5,-78.4]] as const
export const HORROR_PENDANTS=[[5,-80],[-25,-76],[-38,-75]] as const
export const horrorArt=(()=>{
 const b=new PropBuilder([8,5]),f=h.floor
 // Large straight stone courses under the pagoda; intentionally sparse floor dressing.
 for(let x=-56;x<25;x+=2)for(let z=-103;z< -49;z+=2)if(inHorror(x,z,1.2)&&horrorGround(x,z)===f)b.box('stone',(Math.round(x+z)%3)?'#424845':'#363e3e',[x,f+.015,z],[1.95,.03,1.95])
 for(const s of HORROR_SOLIDS){const x=(s.x0+s.x1)/2,z=(s.z0+s.z1)/2,w=s.x1-s.x0,d=s.z1-s.z0
  if(s.id==='machinery-core'||s.id==='lift-cage')continue
  b.box('stone',s.id.startsWith('pillar')?'#4c534c':'#363d3b',[x,f+s.height/2,z],[w,s.height,d])
  // The labyrinth's walls (horrorMaze): a footing, a band of darker courses and a coping stone along the top.
  if(s.id.startsWith('maze')){b.box('stone','#2b3230',[x,f+.18,z],[w+.1,.36,d+.1]);b.box('stone','#2f3634',[x,f+2.3,z],[w+.03,.5,d+.03]);b.box('stone','#4a504a',[x,f+s.height+.08,z],[w+.16,.16,d+.16])}
  if(s.id.startsWith('pillar')){for(const y of[.25,3.15,6.25,10.2])b.box('stone','#555b50',[x,f+y,z],[w+.26,.24,d+.26]);for(let y=.8;y<9;y+=.7)b.box('stone','#303b36',[x,f+y,z],[w+.015,.035,d+.015])}
 }
 // The central dark cistern is sealed and unwalkable, with two broad bypasses.
 const c=HORROR_CRYPT;b.cylinder('stone','#41463c',[c.x,f+c.height/2,c.z],c.rx,c.rx,c.height,[0,0,0],24)
 // (the dark water itself is HorrorDressing's animated cistern surface)
 for(let i=0;i<18;i++){const a=i/18*Math.PI*2;b.box('stone','#5a5b4b',[c.x+Math.cos(a)*6.2,f+c.height+.12,c.z+Math.sin(a)*6.2],[1.5,.3,.9],[0,-a,0])}
 // Engine loop under the balloon: a winch, flywheels, pipes and an empty freight cage.
 b.box('metal','#333c37',[-38,f+.45,-71],[12,.9,10]);b.box('metal','#485047',[-38,f+2,-71],[7,3.1,5.4]);b.cylinder('metal','#6b6251',[-38,f+2.6,-71],1.8,1.8,7.8,[0,0,Math.PI/2],16)
 for(let i=0;i<12;i++)b.ring('metal','#242f2a',[-41.5+i*.63,f+2.6,-71],1.82,.07,[0,Math.PI/2,0])
 for(const x of[-42.5,-33.5]){b.box('metal','#736849',[x,f+2,-67],[1.4,3.7,1.8]);for(let j=0;j<3;j++)b.box('glow',j===1?'#7aa18a':'#a47b46',[x-.42+j*.42,f+2.9,-66.05],[.15,.15,.08])}
 for(const x of[-39.8,-34.2])for(const z of[-87.2,-82.8])b.box('metal','#675d45',[x,f+3.9,z],[.22,7.8,.22])
 b.box('metal','#3e453c',[-37,f+.15,-85],[6,.3,5]);b.box('metal','#484d43',[-37,f+7.7,-85],[6,.3,5])
 for(let i=0;i<12;i++)for(const z of[-87.4,-82.6])b.box('metal','#5c614e',[-39.75+i*.5,f+3.8,z],[.06,7.4,.06])
 // Suspended roots and rusted services stay well above the running clearance.
 for(let i=0;i<18;i++){const x=-46+i*3.7,z=-61-(i%4)*8.2;b.curve('wood','#4d4936',[[x,16.9,z],[x-2,15.7,z+1],[x+1,15.1,z+3],[x+4,16.8,z+4]],.13+(i%3)*.04)}
 for(let i=0;i<8;i++){const x=-44+i*8;b.box('wood','#353c31',[x,16.5,-73],[.32,.55,38]);b.curve('metal','#484b3a',[[x,16.4,-92],[x,14.7,-76],[x+3,16.4,-55]],.075)}
 // Small backed stone effigies are set against the hall walls, outside the loops.
 for(const z of[-95,-61]){b.box('stone','#2e3833',[23.4,f+1,z],[2.5,2,3.5]);b.ball('stone','#596050',[23.5,f+3,z],[.7,.9,.7]);b.ball('stone','#525b4c',[23.5,f+1.95,z],[.95,1.2,.8]);b.box('stone','#626754',[23.5,f+.75,z],[2.3,.4,2.4])}
 for(const [x,z]of HORROR_LAMPS){const y=horrorGround(x,z)+2.9;b.box('metal','#3c3c2d',[x,y,z],[.35,.72,.35]);b.box('glow','#d29c54',[x,y+.1,z],[.2,.4,.2]);b.box('metal','#454334',[x,y+.51,z],[.55,.12,.55])}
 for(const [x,z]of HORROR_PENDANTS){b.box('metal','#5a533e',[x,14.8,z],[.08,4,.08]);b.box('metal','#494b3b',[x,12.8,z],[1.1,.8,1.1]);b.box('glow','#bb9457',[x,12.55,z],[.7,.6,.7])}
 // Low green light marks the final turn, only from the underground side.
 b.box('glow','#63a883',[-56.9,exitFloor()+2.6,-88],[.08,.28,.6])
 return b.finish()
})()
function exitFloor(){return HORROR_PORTALS[1].floor}
