import { existingTreeModel } from './existingTreeModel'
import { FacetedParkTreeInstances } from '../world/art/FacetedParkTreeInstances'

import { Shape,ShapeGeometry } from 'three'
import { Instances,seeded,type Part } from '../world/art/Instances'
import { PropBuilder } from '../world/art/propGeometry'
import { PropModel } from '../world/art/PropModel'
import { GardenFoliageMaterial,crownGeometry } from '../world/art/ReferenceGarden'
import { WalkwayMaterial } from '../world/art/WalkwayMaterial'
import { PERIMETER_TREE_SITES } from './sceneGeometry'
import { DRAFT_PARK,SETTINGS,PAVILION_TREE_SITES,PLAZA_TREE_SITES,PLAZA_REST_GARDENS,PLAZA_BINS,VR_EDGE_TREE_SITES } from './layout'

const wood=new PropBuilder([12,8]),shrubs:Part[]=[],crowns:Part[]=[],leaves:Part[]=[]
const rand=seeded(261026)
const leaf=new Shape();leaf.moveTo(0,0);leaf.quadraticCurveTo(.44,.32,0,1);leaf.quadraticCurveTo(-.44,.32,0,0)
const leafGeometry=new ShapeGeometry(leaf,8)
for(const g of PLAZA_REST_GARDENS){
  const {x,z,width:w,depth:d}=g
  wood.box('stone','#aba58f',[x,.22,z],[w+.12,.16,d+.12])
  wood.box('paint','#544c38',[x,.67,z],[w-.18,.1,d-.18])
  for(let row=0;row<4;row++)for(const side of [-1,1]){
    const y=.34+row*.12
    wood.box('wood',row%2?'#b9a47e':'#cab891',[x+side*(w/2-.075),y,z],[.15,.105,d])
    wood.box('wood',row%2?'#b9a47e':'#cab891',[x,y,z+side*(d/2-.075)],[w,.105,.15])
  }
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const px=x+sx*(w/2-.12),pz=z+sz*(d/2-.12)
    wood.box('metal','#6b705c',[px,.51,pz],[.1,.54,.1])
    for(const y of [.33,.68])wood.cylinder('metal','#87907c',[px,y,pz],.035,.035,.018,[Math.PI/2,0,0],8)
  }
  // Layered evergreen shrubs, ground cover, two light-canopied ornamental trees.
  for(let i=0;i<18;i++){
    const px=x+(rand()-.5)*(w-1),pz=z+(rand()-.5)*(d-.8)
    shrubs.push({p:[px,.91+rand()*.24,pz],s:[.55+rand()*.25,.45+rand()*.3,.6+rand()*.3],c:['#416e43','#5d7d47','#789253'][i%3]!})
  }
  for(let i=0;i<2;i++){
    const tx=x+(i?-.4:.35),tz=z+(i?1.5:-1.4),h=i?4.6:5.9
    wood.cylinder('wood','#83745a',[tx,.75+h*.36,tz],.06,.11,h*.72,[0,0,0],10)
    for(let branch=0;branch<5;branch++){
      const a=branch*2.4+i,dx=Math.cos(a)*(i?.8:1.1),dz=Math.sin(a)*.8,dy=2.5+branch*.35
      wood.curve('wood','#88765b',[[tx,2.1,tz],[tx+dx*.4,dy,tz+dz*.4],[tx+dx,dy+1.1,tz+dz]],.027,12)
      crowns.push({p:[tx+dx,dy+1.35,tz+dz],s:[.85,1.1,.9],c:i?'#5b814c':'#78965a'})
    }
  }
  for(let plant=0;plant<7;plant++){
    const px=x+(plant%2?-.9:.9),pz=z-2.5+Math.floor(plant/2)*1.5
    for(let j=0;j<9;j++){
      const a=j*Math.PI*2/9
      leaves.push({p:[px+Math.sin(a)*.14,.72,pz+Math.cos(a)*.14],s:[.55,.9+(j%3)*.14,1],r:[Math.cos(a)*.7,a,-Math.sin(a)*.7],c:j%3?'#72974d':'#a0b35c'})
    }
  }
  // Fine fern fronds, with opposing leaflets along each bent stem.
  for(const side of [-1,1])for(let frond=0;frond<5;frond++){
    const a=frond*1.256,px=x+side*1.25,pz=z+side*2.4
    wood.curve('paint','#557b43',[[px,.73,pz],[px+Math.sin(a)*.3,1.35,pz+Math.cos(a)*.3],[px+Math.sin(a)*.7,1.15,pz+Math.cos(a)*.7]],.012,14)
    for(let n=1;n<7;n++)for(const wing of [-1,1]){
      const t=n/7
      leaves.push({p:[px+Math.sin(a)*t*.7, .73+Math.sin(t*Math.PI*.7)*.65,pz+Math.cos(a)*t*.7],s:[.16,.33*(1-t*.55),1],r:[.65,a+wing*1.03,wing*.6],c:wing<0?'#4e7c42':'#70984c'})
    }
  }
}
for(const bin of PLAZA_BINS){
  wood.box('metal','#34443a',[bin.x,.65,bin.z],[.65,1,.65])
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const t=-.24+i*.12
    wood.box('wood',i%2?'#a99166':'#bba67b',[bin.x+side*.34,.65,bin.z+t],[.06,.92,.09])
    wood.box('wood',i%2?'#a99166':'#bba67b',[bin.x+t,.65,bin.z+side*.34],[.09,.92,.06])
  }
  wood.box('metal','#283c32',[bin.x,1.18,bin.z],[.78,.12,.78])
  wood.box('metal','#172a24',[bin.x,.98,bin.z+.373],[.4,.17,.035])
}
// Use the same single-crown, seven-sided trunk style as the existing woodland.
const treeRandom=seeded(1802610)
export const simpleTreeBelts=Object.fromEntries(Object.entries({vr:VR_EDGE_TREE_SITES,plaza:PLAZA_TREE_SITES,pavilion:PAVILION_TREE_SITES}).map(([name,sites])=>{
  const trunks:Part[]=[],crowns:Part[]=[]
  for(const p of sites){
    const h=4.2+treeRandom()*3.7,r=1.05+treeRandom()*.65,pink=treeRandom()<.19
    trunks.push({p:[p.x,h*.3,p.z],s:[.22,h*.6,.22],c:'#72553c'})
    crowns.push({p:[p.x,h*.72,p.z],s:[r,h*.37,r],c:pink?'#c98f9e':['#537e55','#6f965d','#456d4c','#87a265'][Math.floor(treeRandom()*4)]!})
  }
  return [name,{trunks,crowns,...existingTreeModel(trunks,crowns)}]
}))
const furnitureArt=wood.finish()
// Pave the full south wall apron; the original avenue is slightly above this single surface.
const south=new Shape(),half=DRAFT_PARK.half,radius=SETTINGS.park.wallCornerRadius,corner=half-radius;
south.moveTo(-half,-corner);south.absarc(-corner,-corner,radius,Math.PI,Math.PI*1.5,false);south.lineTo(corner,-half);south.absarc(corner,-corner,radius,Math.PI*1.5,Math.PI*2,false);south.lineTo(half-7.75,-half+8);south.lineTo(-half+7.75,-half+8);south.closePath()
export const gatePromenadeGeometry=new ShapeGeometry(south,48);gatePromenadeGeometry.rotateX(-Math.PI/2);gatePromenadeGeometry.translate(0,.12,0)
const grates=new PropBuilder()
for(const p of PERIMETER_TREE_SITES.filter(p=>p.z>86)){
  for(let i=-4;i<=4;i++){
    if(Math.abs(i)<=1)continue
    grates.box('metal','#687064',[p.x+i*.18,.145,p.z],[.07,.035,1.65])
  }
  for(const side of [-1,1])grates.box('metal','#7d8374',[p.x,.145,p.z+side*.78],[1.65,.035,.075])
}
const grateArt=grates.finish()
export function PreviewLandscaping(){return <group name="layout-reference-rest-gardens">
  <PropModel art={furnitureArt} name="layout-timber-planters-and-bins"/>
  <Instances parts={[...shrubs,...crowns]} shadow={false} material={<GardenFoliageMaterial/>}><primitive object={crownGeometry} attach="geometry" dispose={null}/></Instances>

  {Object.entries(simpleTreeBelts).map(([name,trees])=><FacetedParkTreeInstances key={name} name={'layout-'+name+'-green-belt'} parts={trees.parts} treeCount={trees.plantings.length}/>)}
  <Instances parts={leaves} shadow={false} material={<meshStandardMaterial roughness={.86} side={2}/>}><primitive object={leafGeometry} attach="geometry" dispose={null}/></Instances>
  <mesh name="layout-gate-stone-promenade" geometry={gatePromenadeGeometry} dispose={null} receiveShadow><WalkwayMaterial color="#c8c1ad"/></mesh>
  <PropModel art={grateArt} name="layout-south-tree-grates"/>
</group>}
