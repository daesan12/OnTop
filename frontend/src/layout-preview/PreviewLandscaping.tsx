
import { Shape,ShapeGeometry } from 'three'
import { Instances,seeded,type Part } from '../world/art/Instances'
import { PropBuilder } from '../world/art/propGeometry'
import { PropModel } from '../world/art/PropModel'
import { GardenFoliageMaterial,crownGeometry } from '../world/art/ReferenceGarden'
import { SurfaceMaterial } from '../world/art/SurfaceMaterial'
import { PERIMETER_TREE_SITES } from './sceneGeometry'
import { PLAZA_REST_GARDENS,PLAZA_BINS,VR_EDGE_TREE_SITES } from './layout'

const wood=new PropBuilder([12,8]),shrubs:Part[]=[],crowns:Part[]=[],leaves:Part[]=[],vrCrowns:Part[]=[]
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
for(const [i,p] of VR_EDGE_TREE_SITES.entries()){
  const h=4.8+i%3*.45
  wood.cylinder('wood','#776449',[p.x,h*.34,p.z],.085,.15,h*.68,[0,0,0],9)
  for(let j=0;j<5;j++){
    const a=j*2.4+i,dx=Math.cos(a)*.67,dz=Math.sin(a)*.67,y=h*.48+j*.18
    wood.curve('wood','#806a4e',[[p.x,h*.32,p.z],[p.x+dx*.4,y,p.z+dz*.4],[p.x+dx,y+.65,p.z+dz]],.025,10)
    vrCrowns.push({p:[p.x+dx,y+1,p.z+dz],s:[.78,1.25,.8],c:['#5d824c','#7b9758','#476f49'][i%3]!})
  }
}
const furnitureArt=wood.finish()
// Pave the full south wall apron; the original avenue is slightly above this single surface.
const south=new Shape();south.moveTo(-90,-84);south.absarc(-84,-84,6,Math.PI,Math.PI*1.5,false);south.lineTo(84,-90);south.absarc(84,-84,6,Math.PI*1.5,Math.PI*2,false);south.lineTo(82.25,-82);south.lineTo(-82.25,-82);south.closePath()
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
  <group name="layout-vr-green-belt"><Instances parts={vrCrowns} shadow={false} material={<GardenFoliageMaterial/>}><primitive object={crownGeometry} attach="geometry" dispose={null}/></Instances></group>
  <Instances parts={leaves} shadow={false} material={<meshStandardMaterial roughness={.86} side={2}/>}><primitive object={leafGeometry} attach="geometry" dispose={null}/></Instances>
  <mesh name="layout-gate-stone-promenade" geometry={gatePromenadeGeometry} dispose={null} receiveShadow><SurfaceMaterial kind="stone" mapping="box" paving color="#c8c1ad" meters={1.7} strength={.1}/></mesh>
  <PropModel art={grateArt} name="layout-south-tree-grates"/>
</group>}
