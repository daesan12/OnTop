import {THREE} from './primitives.js';
import {box,fish,lantern as hangingLantern} from './details.js';
import {tiledRoof as shopRoof} from './shop-roof.js';
import {tiledRoof as pavilionRoof,closedRoll} from './pavilion-roof.js';
import {rock} from './garden.js';
const TAU=Math.PI*2;
export function rope(b,a,z,height=.0){const pts=Array.from({length:9},(_,i)=>{const t=i/8;return new THREE.Vector3(a[0]*(1-t)+z[0]*t,a[1]*(1-t)+z[1]*t-Math.sin(t*Math.PI)*.10+height,a[2]*(1-t)+z[2]*t);});b.add('cloth',closedRoll(pts,.037,8,5),'#dcc39a');}
export function post(b,x,z,y=0){box(b,'wood','#8d5f35',[x,y+.54,z],[.14,1.08,.14],.02);box(b,'stone','#d7c6b1',[x,y+1.07,z],[.19,.12,.19],.02);box(b,'wood','#b88343',[x,y+.11,z],[.25,.16,.25],.025);}
export function fence(b){for(const x of [-1.2,0,1.2])post(b,x,0);for(const [a,z]of [[-1.2,0],[0,1.2]])for(const y of [.48,.92])rope(b,[a,y,0],[z,y,0]);}
export function lamp(b){
  box(b,'stone','#77776c',[0,.12,0],[.47,.24,.47],.025);box(b,'wood','#63482f',[0,1.07,0],[.14,1.76,.14],.018);
  hangingLantern(b,[0,2.00,0],.95);box(b,'wood','#755332',[0,1.54,0],[.22,.12,.22],.02);
}
export function bench(b){for(const x of [-.62,.62])for(const z of [-.21,.21])box(b,'wood','#7e4b28',[x,.24,z],[.10,.48,.10],.014);for(const z of [-.22,0,.22])box(b,'wood','#bd8042',[0,.50,z],[1.58,.10,.205],.02);for(const x of [-.62,.62])box(b,'wood','#92592d',[x,.32,0],[.1,.10,.66],.015);}
function fishingRod(b,base,tip,color){const a=new THREE.Vector3(...base),z=new THREE.Vector3(...tip),direction=z.clone().sub(a).normalize(),points=Array.from({length:5},(_,i)=>a.clone().lerp(z,i/4).add(new THREE.Vector3(0,0,-.08*Math.sin(i/4*Math.PI))));b.add('wood',closedRoll(points,.012,b.quality==='light'?8:12,5),color);const grip=new THREE.CylinderGeometry(.022,.025,.32,8);grip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction));grip.translate(...a.clone().addScaledVector(direction,.19).toArray());b.add('wood',grip,'#66503a');const reel=a.clone().addScaledVector(direction,.42).add(new THREE.Vector3(.045,0,.012));b.ring('metal','#bcb7a7',reel.toArray(),.044,.012,[0,0,0],12);b.curve('cloth','#bfc4ab',[tip,[tip[0]+.06,tip[1]-.28,tip[2]-.14],[tip[0]+.08,base[1],tip[2]-.20]],.0025,7,3);}
export function rodRack(b){
  bench(b);for(const y of [.59,.91])box(b,'wood','#9b612d',[0,y,0],[1.55,.10,.18],.015);
  for(let i=0;i<4;i++){const x=(i-1.5)*.36;fishingRod(b,[x,.58,.05],[x+.18,2.33+i*.09,-.30],i%2?'#aa8148':'#775d3b');}
}
export function deck(b,{openBack=false,sideGate=0,frontGap=2.10}={}){
  const width=7.2,depth=5.2,top=.48,n=26;
  b.box('wood','#805b36',[0,top-.14,0],[width,.10,depth]);
  for(let i=0;i<n;i++)box(b,'wood',i%2?'#b77c42':'#c58a4e',[(i+.5)/n*width-width/2,top-.07,0],[width/n-.010,.14,depth],.009);
  for(const x of[-3.25,0,3.25])for(const z of[-2.25,0,2.25]){b.cylinder('wood','#71502e',[x,-.045,z],.12,.15,.82,[0,0,0],8);box(b,'wood','#946336',[x,.22,z],[.30,.13,.30],.02);}
  const posts=new Set();
  function rail(a,z,gap=0){const length=Math.hypot(z[0]-a[0],z[1]-a[1]),g=gap/length/2,intervals=gap?[[0,.5-g],[.5+g,1]]:[[0,1]];for(const[t0,t1]of intervals){const n=Math.ceil(length*(t1-t0)/1.65),ps=[];for(let i=0;i<=n;i++){const t=t0+(t1-t0)*i/n,x=a[0]+(z[0]-a[0])*t,zz=a[1]+(z[1]-a[1])*t,key=x.toFixed(4)+','+zz.toFixed(4);if(!posts.has(key)){post(b,x,zz,top);posts.add(key);}ps.push([x,zz]);}for(let i=1;i<ps.length;i++)for(const h of[.48,.92])rope(b,[ps[i-1][0],top+h,ps[i-1][1]],[ps[i][0],top+h,ps[i][1]]);}}
  if(!openBack)rail([-3.45,-2.50],[3.45,-2.50]);
  rail([-3.45,2.50],[3.45,2.50],frontGap);
  rail([-3.45,-2.50],[-3.45,2.50],sideGate===-1?1.85:0);
  rail([3.45,-2.50],[3.45,2.50],sideGate===1?1.85:0);
}
export function bridge(b){
  const length=4.8,curve=x=>.45+1.00*(1-(x/(length/2))**2);
  const skin=new THREE.BoxGeometry(5.02,.10,1.48,32,1,1),sp=skin.attributes.position;for(let i=0;i<sp.count;i++)sp.setY(i,sp.getY(i)+curve(sp.getX(i))-.11);skin.computeVertexNormals();b.add('wood',skin,'#885e35');
  for(let i=0;i<22;i++){const x=(i/21-.5)*length;box(b,'wood',i%2?'#bd8043':'#cc8e4f',[x,curve(x),0],[.225,.12,1.48],.015,[0,0,Math.atan(-2*x/(length/2)**2)]);}
  for(const z of [-.83,.83]){
    const pts=Array.from({length:25},(_,i)=>{const x=(i/24-.5)*length;return new THREE.Vector3(x,curve(x)-.13,z);});b.add('wood',closedRoll(pts,.085,24,6),'#78502c');
    for(let i=0;i<9;i++){const x=(i/8-.5)*length,y=curve(x);b.cylinder('wood','#8f6031',[x,y+.48,z],.055,.066,.90,[0,0,0],8);box(b,'stone','#d8c9b0',[x,y+.96,z],[.15,.09,.15],.015);}
    for(const h of [.48,.90]){const pts=Array.from({length:25},(_,i)=>{const x=(i/24-.5)*length;return new THREE.Vector3(x,curve(x)+h,z);});b.add('wood',closedRoll(pts,.04,24,5),'#ad743a');}
  }
  for(const x of [-1.95,1.95])for(const z of [-.65,.65])b.cylinder('wood','#7e5c36',[x,.07,z],.11,.15,.85,[0,0,0],8);
  for(const side of[-1,1]){box(b,'stone','#b8b5a6',[side*2.74,.13,0],[.46,.18,1.70],.025);box(b,'stone','#c7c1af',[side*2.48,.29,0],[.40,.16,1.63],.025);}
}
export function notice(b){
  for(const x of [-1.05,1.05]){box(b,'wood','#805734',[x,1.12,0],[.17,2.24,.20],.02);box(b,'stone','#b5ad9e',[x,.15,0],[.34,.30,.34],.035);}
  box(b,'wood','#a3713e',[0,1.52,0],[2.24,1.35,.16],.04);box(b,'cloth','#ecd4a9',[0,1.52,.094],[2.01,1.11,.045],.02);for(const y of [.89,2.16])box(b,'wood','#956230',[0,y,.02],[2.4,.14,.25],.025);
}
export function pavilion(b){
  b.cylinder('stone','#c5bca7',[0,.45,0],1.88,2.03,.28,[0,Math.PI/8,0],8);b.cylinder('stone','#ded1ba',[0,.64,0],1.82,1.88,.15,[0,Math.PI/8,0],8);
  for(let i=0;i<5;i++){const h=.12+i*.12;box(b,'stone',i%2?'#d2c4ac':'#e1d3bb',[0,h/2+.03,2.48-i*.23],[1.66,h,.45],.025);}
  for(let i=0;i<8;i++){const a=(i/8+.0625)*TAU,x=Math.sin(a)*1.48,z=Math.cos(a)*1.48;
    b.cylinder('wood','#a5642d',[x,1.90,z],.105,.13,2.40,[0,0,0],10);box(b,'gold','#c29246',[x,2.98,z],[.30,.16,.30],.025);
    if(i<7&&i!==3){const c=(i/8+.0625+.125)*TAU,xx=Math.sin(c)*1.48,zz=Math.cos(c)*1.48;for(const y of [1.02,1.42])b.beam('wood','#98612e',[x,y,z],[xx,y,zz],.075);}
    if(i%2===0)hangingLantern(b,[x*.88,2.56,z*.88],.46);
  }
  b.cylinder('wood','#a86c35',[0,1.12,0],.11,.20,.72,[0,0,0],8);b.cylinder('wood','#c88b44',[0,1.51,0],.67,.67,.12,[0,0,0],16);
  for(let i=0;i<4;i++){const a=i/4*TAU;b.cylinder('wood','#ae7238',[Math.sin(a)*1.0,.95,Math.cos(a)*1.0],.25,.21,.53,[0,0,0],8);}
  pavilionRoof(b);
}
export function shop(b){
  box(b,'stone','#b6b0a3',[0,.19,0],[3.3,.38,2.28],.045);
  box(b,'wood','#80512a',[0,1.53,-.90],[2.95,2.5,.12],.02);
  for(const side of [-1,1]){box(b,'wood','#925e2d',[side*1.40,1.53,0],[.14,2.5,1.84],.02);for(const z of [-.91,.91])box(b,'wood','#aa6c30',[side*1.43,1.55,z],[.17,2.70,.17],.025);}
  for(let i=0;i<13;i++)box(b,'wood',i%2?'#a4672d':'#b57433',[(i-6)*.22,.80,.95],[.21,.93,.14],.015);
  box(b,'wood','#d29146',[0,1.30,.83],[3.15,.14,.73],.03);fish(b,[0,.86,1.05],.42,[0,0,0],'#f2c57b');
  for(const [row,y] of [1.58,2.03,2.48].entries()){box(b,'wood','#bc7b36',[0,y,-.65],[2.75,.08,.47],.018);for(let i=0;i<5;i++){const x=(i-2)*.46;if((i+row)%3===0){box(b,'wood','#617b62',[x,y+.13,-.66],[.30,.18,.28],.018);box(b,'gold','#bc9959',[x,y+.23,-.66],[.32,.035,.29],.008);box(b,'cloth','#e1c79a',[x,y+.13,-.51],[.16,.065,.012],.004);}else{const h=.18+(i%3)*.055;b.cylinder('food',['#d5be8d','#bc825b','#a8b49a'][i%3],[x,y+.04+h/2,-.66],.10,.11,h,[0,0,0],10);b.cylinder('wood','#6e5134',[x,y+.055+h,-.66],.116,.116,.035,[0,0,0],10);}}}
  // Two shallow counter trays keep the display readable through the awning.
  for(const x of[-.42,.60]){box(b,'wood','#81572f',[x,1.435,.80],[.70,.15,.44],.018);box(b,'cloth','#b29a68',[x,1.515,.80],[.60,.025,.35],.01);for(let i=0;i<4;i++){const xx=x+(i-1.5)*.13;b.cylinder('wood','#cfb56e',[xx,1.56,.80],.038,.038,.075,[Math.PI/2,0,0],8);b.ring('cloth',i%2?'#bd6758':'#e8d3a8',[xx,1.60,.80],.032,.009,[Math.PI/2,0,0],8);}}
  shopRoof(b,3.85,2.60,3.35,.60);
  box(b,'gold','#bc8641',[0,2.70,1.49],[2.85,.60,.11],.08);box(b,'wood','#8c572a',[0,2.70,1.565],[2.65,.46,.06],.05);
  for(const x of [-1.54,1.54])hangingLantern(b,[x,2.30,1.0],.55);
  for(let i=0;i<6;i++){const x=(i-2.5)*.45,nx=4,nv=5,p=[],ix=[];for(let j=0;j<=nv;j++)for(let k=0;k<=nx;k++){const u=k/nx,v=j/nv;p.push(x+(u-.5)*.435,2.40-.17*v-.04*Math.sin(v*Math.PI)-.065*Math.sin(u*Math.PI)*v**5,1.25+v*.67);}for(let j=0;j<nv;j++)for(let k=0;k<nx;k++){const a=j*(nx+1)+k,b=a+nx+1;ix.push(a,b,a+1,a+1,b,b+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();b.add('cloth',g,['#b56f5c','#e1c188','#ca9869'][i%3]);const hem=Array.from({length:9},(_,k)=>{const u=k/8;return new THREE.Vector3(x+(u-.5)*.435,2.23-.065*Math.sin(u*Math.PI),1.923);});b.add('gold',closedRoll(hem,.009,8,4),'#e4ca93');}
  for(let i=0;i<3;i++){const x=-1.18+i*.16;fishingRod(b,[x,.45,1.32],[x+.10,2.24,1.28],'#ba9459');}
}
export {waterfall} from './water.js';



