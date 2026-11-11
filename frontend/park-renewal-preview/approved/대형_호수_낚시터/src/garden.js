import{THREE}from'./primitives.js';
import{closedRoll}from'./pavilion-roof.js';
const TAU=Math.PI*2;
export function rock(b,p=[0,0,0],s=[1,.7,.8],color='#a9aaa6',seed=0){
  const g=new THREE.IcosahedronGeometry(1,b.quality==='light'?0:1),a=g.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),r=1+.07*Math.sin(x*3.2+z*2.7+seed*.71)*Math.cos(y*3+seed);a.setXYZ(i,x*r,Math.max(-.63,y*r),z*r);}g.rotateY(seed*.81);b.add('stone',g,color,p,s);
}
export function rockCluster(b){for(const[i,p]of[[0,[-.63,.30,0]],[1,[.18,.45,-.18]],[2,[.72,.24,.20]],[3,[-.12,.18,.48]]])rock(b,p,[[.68,.52,.58],[.73,.74,.64],[.45,.4,.48],[.43,.3,.42]][i],['#a8aaa3','#bbbcb2','#929e97','#c4c1b7'][i],i);}
/** A pointed, bowed leaf/petal, with enough curvature to catch the light. */
function blade(length,width,arch=.03,steps=4){const p=[],ix=[];for(let j=0;j<=steps;j++){const t=j/steps,w=Math.sin(t*Math.PI)*width;for(const side of[-1,0,1])p.push(side*w,Math.sin(t*Math.PI)*arch+(1-side*side)*arch*.35,t*length);}for(let j=0;j<steps;j++)for(let i=0;i<2;i++){const a=j*3+i,z=a+3;ix.push(a,z,a+1,a+1,z,z+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;}
function leaf(b,pos,len,width,color,rotation,arch=.04,steps=4){b.add('leaf',blade(len,width,arch,steps),color,pos,[1,1,1],rotation);}
function bloom(b,pos,size,color,rotation=0){
  b.at(pos,[0,rotation,0],()=>{for(let j=0;j<5;j++)b.add('cloth',blade(size,.060*size/.13,.025,3),color,[0,0,0],[1,1,1],[0,j/5*TAU,0]);b.add('gold',new THREE.SphereGeometry(1,6,4),'#e8c56f',[0,.032,0],[.026,.018,.026]);});
}
export function flowerBed(b){
  b.add('leaf',new THREE.SphereGeometry(1,10,5),'#5f7f3b',[0,.19,0],[.49,.21,.43]);
  for(let i=0;i<10;i++){const a=i/10*TAU;leaf(b,[Math.sin(a)*.07,.08,Math.cos(a)*.07],.65+(i%3)*.08,.15,i%2?'#4e7637':'#74923b',[.24,a,0],.14);}
  for(let i=0;i<9;i++){const a=i*2.4,r=.15+(i%4)*.105,x=Math.sin(a)*r,z=Math.cos(a)*r,y=.31+(i%3)*.11;b.beam('leaf','#597d38',[x,.08,z],[x,y,z],.014);bloom(b,[x,y,z],.15+(i%2)*.025,['#d77ca2','#e7abc3','#eee0c8'][i%3],a);}
}
function cloud(b,pos,s,color,seed){const g=new THREE.IcosahedronGeometry(1,b.quality==='light'?0:1);g.rotateY(seed*.7);b.add('leaf',g,color,pos,s);}
function branch(b,points,radius,color='#785237'){b.add('wood',closedRoll(points.map(p=>new THREE.Vector3(...p)),radius,7,6),color);}
export function cherry(b){
  branch(b,[[0,0,0],[.06,1.2,.02],[-.12,2.3,.04],[.10,3.35,0]],.145);
  for(let i=0;i<7;i++){const a=i/7*TAU;branch(b,[[0,1.6,0],[Math.sin(a)*.60,2.5,Math.cos(a)*.50],[Math.sin(a)*1.43,3.25+(i%3)*.18,Math.cos(a)*1.12]],.055);}
  const count=b.quality==='light'?24:34;
  for(let i=0;i<count;i++){const a=i*2.3999,r=.15+Math.sqrt(i/count)*1.40;cloud(b,[Math.sin(a)*r,3.16+.55*(1-r/1.65)+(i%3)*.10,Math.cos(a)*r*.85],[.44+(i%3)*.05,.36+(i%2)*.05,.45],['#e29ab9','#eab2cb','#f0c5d4','#d48ba9'][i%4],i);}
  if(b.quality!=='light')for(let i=0;i<12;i++){const a=i*2.4;bloom(b,[Math.sin(a)*1.15,3.07+(i%3)*.16,Math.cos(a)*1.1],.095,'#f3cdda',a);}
}
export function willow(b){
  branch(b,[[0,0,0],[-.11,1.5,0],[.09,2.65,-.05],[0,3.75,0]],.18);
  for(let i=0;i<8;i++){const a=i/8*TAU;branch(b,[[0,2.1,0],[Math.sin(a)*.85,3.40,Math.cos(a)*.75],[Math.sin(a)*1.63,3.75,Math.cos(a)*1.38]],.05);}
  for(let i=0;i<14;i++){const a=i*2.4;cloud(b,[Math.sin(a)*1.02,3.62+(i%3)*.16,Math.cos(a)*.9],[.66,.35,.62],['#829b3c','#9aab45','#aeb94d'][i%3],i);}
  cloud(b,[0,3.92,0],[.95,.56,.83],'#9eae49',0);
  const count=b.quality==='light'?30:48;
  for(let i=0;i<count;i++){const a=i/count*TAU,r=1.25+(i%4)*.16,top=3.67+(i%3)*.10,len=1.90+(i%4)*.23;
    const at=t=>[Math.sin(a)*r*(.72+.40*Math.sin(t*Math.PI/2))+.07*Math.sin(t*5+i),top-(.6*t+.4*t*t)*len,Math.cos(a)*r*.86*(.72+.40*Math.sin(t*Math.PI/2))];
    const pts=Array.from({length:8},(_,j)=>at(j/7));branch(b,pts,.009,'#798d39');
    for(let j=0;j<10;j++){const[x,y,z]=at((j+.3)/10);for(const sign of[-1,1])leaf(b,[x,y,z],.23,.039,j%2?'#a9b94a':'#829a39',[1.1,a+sign*.72,sign*.25],.012,2);}
  }
}
export function lotus(b){
  const s=new THREE.Shape();s.moveTo(0,0);for(let i=0;i<=28;i++){const a=.13+i/28*(TAU-.26);s.lineTo(Math.sin(a)*.38,Math.cos(a)*.32);}s.closePath();const g=new THREE.ShapeGeometry(s,1);g.rotateX(-Math.PI/2);b.add('leaf',g,'#6e9b3c',[0,.018,0]);
  for(let layer=0;layer<3;layer++)for(let i=0;i<7;i++){const a=(i/7+layer*.07)*TAU;b.add('cloth',blade(.15-layer*.024,.063-layer*.009,.06,4),['#df86aa','#eda9c4','#f6c7d8'][layer],[Math.sin(a)*.012,.045+layer*.027,Math.cos(a)*.012],[1,1,1],[-layer*.28,a,0]);}
  b.add('gold',new THREE.SphereGeometry(1,8,5),'#edcf75',[0,.14,0],[.044,.03,.044]);
}
export function koi(b,color='#e79451'){
  b.add('cloth',new THREE.SphereGeometry(1,12,7),'#eddfc5',[0,0,0],[.14,.045,.44]);
  for(const[z,x,s]of[[-.22,.02,.10],[.02,-.035,.11],[.22,.03,.08]])b.add('food',new THREE.SphereGeometry(1,8,5),color,[x,.032,z],[s,.018,.105]);
  for(const side of[-1,1]){b.add('cloth',blade(.18,.07,.01,2),'#e4d1b3',[side*.10,-.012,.04],[1,1,1],[0,side*Math.PI*.45,0]);b.add('cloth',blade(.23,.08,.015,2),'#ecdbc2',[0,-.008,-.37],[1,1,1],[0,Math.PI+side*.36,0]);b.add('ink',new THREE.SphereGeometry(1,6,4),'#3d342c',[side*.06,.030,.32],[.013,.008,.016]);}
}
