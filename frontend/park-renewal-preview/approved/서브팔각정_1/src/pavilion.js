import {THREE,Builder,TAU,radial,anchor,handle} from './helpers.js';
const CONSTRUCTION_LAYOUT=Object.freeze({sides:8,floorY:.57,columnRadius:2.38,columnHeight:2.68,entranceWidth:1.52,roofRadius:3.42,tableHeight:.795,stoolCount:2,stoolArrangement:'front-back',flowerVase:false,ceilingLanterns:1});
const SIZE_MULTIPLIER=1.1;
export const SUB_PAVILION_LAYOUT=Object.freeze({...CONSTRUCTION_LAYOUT,...Object.fromEntries(['floorY','columnRadius','columnHeight','entranceWidth','roofRadius','tableHeight'].map(k=>[k,CONSTRUCTION_LAYOUT[k]*SIZE_MULTIPLIER])),sizeMultiplier:SIZE_MULTIPLIER});
const C={red:'#a84832',redLight:'#bf5b3d',redDark:'#803b2b',green:'#32624c',lightGreen:'#709453',mint:'#b1bc7d',gold:'#d5a55b',cream:'#e2cb9b',stone:'#c9b7a4',tile:'#4b4855'};
const vertex=i=>(i+.5)/8*TAU;
function roofPoint(face,u,t,lift=0){const a=radial(vertex(face),1),z=radial(vertex(face+1),1),f=(u+1)/2,r=.31+(3.42-.31)*t;return[(a[0]*(1-f)+z[0]*f)*r,5.03-1.65*t**.72+.35*t**5+.14*Math.abs(u)**5*t+lift,(a[2]*(1-f)+z[2]*f)*r];}
function roofPatch(b,face,u0,u1,t0,t1,{raised=false,bottom=false}={}){const nu=raised?(b.quality==='light'?3:4):8,nt=raised?(b.quality==='light'?2:3):(b.quality==='light'?5:8),p=[],idx=[];for(let j=0;j<=nt;j++)for(let i=0;i<=nu;i++){const u=u0+(u1-u0)*i/nu,t=t0+(t1-t0)*j/nt,lift=bottom?-.11:raised?.022+Math.sin(i/nu*Math.PI)*.065:0;p.push(...roofPoint(face,u,t,lift));if(j<nt&&i<nu){const k=j*(nu+1)+i;idx.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);}}b.surface('roof',bottom?'#5d4b3c':raised?['#54515e','#5e5965','#484653'][((face+Math.round(u0*11))%3+3)%3]:C.tile,p,idx);}
function buildRoof(b){
 const columns=b.quality==='light'?5:7,rows=b.quality==='light'?2:3;
 for(let face=0;face<8;face++){
  roofPatch(b,face,-1,1,0,1);roofPatch(b,face,-1,1,0,1,{bottom:true});
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const u0=-1+col/columns*2,u1=-1+(col+1)/columns*2;roofPatch(b,face,u0,u1,Math.max(.045,row/rows),Math.min(1,(row+1)/rows+.045),{raised:true});const p=roofPoint(face,(u0+u1)/2,1,.028);if(row===rows-1)b.add('roof',new THREE.SphereGeometry(1,8,3),'#71636a',p,[.087,.065,.075]);}
  // Solid fascia seals the tile underside at each eave; shared hip edges meet exactly.
  for(let j=0;j<8;j++){const u=j/4-1,z=(j+1)/4-1,a=roofPoint(face,u,1),c=roofPoint(face,z,1),d=roofPoint(face,u,1,-.11),e=roofPoint(face,z,1,-.11);b.surface('roof','#544a4c',[...a,...c,...d,...e],[0,1,2,1,3,2]);}
  const hip=Array.from({length:13},(_,i)=>roofPoint(face,-1,i/12,.075));b.tube('#484553',hip,.082,b.quality==='light'?8:12,6,'roof');b.ball('#625966',hip.at(-1),[.1,.1,.1],8,'roof');
  const eave=Array.from({length:9},(_,i)=>roofPoint(face,i/4-1,1,-.13));b.tube('#8d603e',eave,.075,10,5);
 }
 b.cyl('#b7a48e',[0,5.035,0],.36,.4,.15,8);b.cyl('#9b8574',[0,5.2,0],.24,.33,.18,8);b.cyl('#b7a48f',[0,5.34,0],.18,.26,.13,8);b.ball('#cbb5a0',[0,5.55,0],[.19,.24,.19],8);
}
function paint(b,c,points,z){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));shape.closePath();b.add('solid',new THREE.ShapeGeometry(shape,1),c,[0,0,z]);}
/** Layered lotus medallion, painted into the frieze with a shallow relief. */
function rosette(b,p,scale=1){b.at(p,[0,0,0],()=>{
 for(let i=0;i<8;i++){const a=i/8*TAU,points=[[0,.035],[.04,.083],[.036,.125],[0,.15],[-.036,.125],[-.04,.083]].map(([x,y])=>[(x*Math.cos(a)+y*Math.sin(a))*scale,(-x*Math.sin(a)+y*Math.cos(a))*scale]);paint(b,C.gold,points,.012);paint(b,i%2?'#b56544':'#be7351',points.map(([x,y])=>[x*.77,y*.77]),.027);}
 for(let i=0;i<5;i++){const a=i/5*TAU;b.add('solid',new THREE.SphereGeometry(1,6,3),C.cream,[Math.sin(a)*.057*scale,Math.cos(a)*.057*scale,.033],[.041*scale,.048*scale,.012*scale]);}
 b.cyl('#cfac67',[0,0,.051],.033*scale,.033*scale,.018,10,[Math.PI/2,0,0]);b.cyl('#668c7d',[0,0,.063],.021*scale,.021*scale,.012,10,[Math.PI/2,0,0]);
 });}
function cloudPlaque(b){
 const cloud=[[-.31,-.045],[-.34,.005],[-.30,.055],[-.23,.06],[-.22,.105],[-.13,.13],[-.055,.105],[-.01,.065],[.06,.085],[.13,.05],[.25,.05],[.31,.01],[.30,-.045],[.24,-.065],[-.24,-.065]];
 b.poly('#bbaa6d',cloud,.014,[0,-.01,.047]);b.poly('#89a977',cloud.map(([x,y])=>[x*.83,y*.78]),.014,[0,-.007,.064]);
 const points=[[-.15,.015,.083],[-.12,.055,.083],[-.065,.055,.083],[-.04,.024,.083],[-.062,.005,.083]];b.tube('#d6c68f',points,.009,6,3);
}
function friezePattern(b,length){
 // Fine inset borders keep each face legible without covering its green field.
 for(const y of[-.105,.105])b.box(C.cream,[0,y,.145],[length-.09,.014,.016]);
 for(const x of[-length/2+.075,length/2-.075])b.box(C.gold,[x,0,.15],[.018,.22,.018]);
 rosette(b,[0,0,.153],.85);
 for(const sx of[-1,1]){
  const leaf=[[-.12,-.045],[-.055,.005],[.025,.045],[.12,.05],[.035,-.015],[-.055,-.045]];
  b.poly('#b6bc7b',leaf.map(([x,y])=>[sx*(.34+x),y]),.012,[0,0,.153]);
  for(let j=0;j<3;j++)b.box(j===1?C.cream:'#c98b50',[sx*(.67+j*.105),0,.15],[.045,.17,.022],[0,0,sx*-.35]);
 }
}
function buildStructure(b){
 const floorY=CONSTRUCTION_LAYOUT.floorY;
 b.cyl('#af9d8b',[0,.2,0],2.94,3.06,.4,8,[0,Math.PI/8,0]);b.cyl(C.stone,[0,.455,0],3.02,3.02,.11,8,[0,Math.PI/8,0]);b.cyl('#ddcbb6',[0,.54,0],2.97,2.97,.06,8,[0,Math.PI/8,0]);
 // Eight floor wedges, full contact with the continuous platform beneath.
 for(let f=0;f<8;f++){const a=radial(vertex(f),2.9,floorY+.002),c=radial(vertex(f+1),2.9,floorY+.002);b.surface('solid',f%2?'#d0bfab':'#d8c8b4',[0,floorY+.002,0,...a,...c],[0,1,2]);}
 // A front opening along +Z is shared by the stairs, railing and bench.
 for(let i=0;i<3;i++){const h=(3-i)*.19;b.soft(i%2?'#cbbba5':'#d9c7af',[0,h/2,2.83+i*.34],[1.52,h,.52],.025);for(const sx of [-1,1])b.soft('#c3af98',[sx*.92,.19+(2-i)*.075,2.84+i*.35],[.26,.36+(2-i)*.15,.52],.025);}
 for(let i=0;i<8;i++){
  const a=vertex(i),p=radial(a,2.38,floorY);
  b.soft('#cbbb9f',[p[0],floorY+.1,p[2]],[.46,.2,.46],.045);b.soft('#e0cdb0',[p[0],floorY+.23,p[2]],[.37,.08,.37],.025);
  b.cyl(C.red,p.map((v,j)=>j===1?2.17:v),.145,.165,2.68,b.quality==='light'?8:12);
  b.cyl('#cf7350',[p[0],.89,p[2]],.17,.17,.07,8);b.cyl(C.redDark,[p[0],3.43,p[2]],.18,.18,.09,8);
  b.at([p[0],3.45,p[2]],[0,a,0],()=>{b.soft(C.green,[0,0,0],[.48,.18,.48],.025);b.soft(C.lightGreen,[0,.16,0],[.66,.16,.59],.025);b.box(C.gold,[0,.18,.31],[.17,.15,.045]);b.box(C.green,[0,.29,0],[.29,.3,.29]);b.beam(C.green,[-.43,-.3,0],[-.16,.16,0],.12,.14);b.beam(C.green,[.43,-.3,0],[.16,.16,0],.12,.14);});
 }
 // Eight painted crossbeams and their exterior dancheong motifs.
 for(let side=0;side<8;side++){
  const angle=(side+1)/8*TAU,center=radial(angle,3.12*Math.cos(Math.PI/8),3.44),length=2*3.12*Math.sin(Math.PI/8)+.06;
  b.at(center,[0,angle,0],()=>{b.soft(C.green,[0,0,0],[length,.26,.25],.02);b.box(C.gold,[0,-.145,.02],[length,.035,.27]);b.box(C.lightGreen,[0,.145,0],[length,.04,.29]);friezePattern(b,length);});
  const a=vertex(side),z=vertex(side+1);b.beam(C.green,radial(a,2.38,3.56),radial(z,2.38,3.56),.22,.24);
  for(const t of [.22,.5,.78]){const p=roofPoint(side,t*2-1,.77,-.17),q=roofPoint(side,t*2-1,.44,-.2);b.beam('#d5a36a',q,p,.075,.09);}
  // All side faces except the entrance face (center angle 0).
  if(side===7)continue;
  const aa=radial(a,2.38),zz=radial(z,2.38),mid=aa.map((v,j)=>(v+zz[j])/2),theta=Math.atan2(mid[0],mid[2]);
  for(const y of [floorY+.14,floorY+.54,floorY+.85])b.beam(y===floorY+.85?C.redLight:C.red,radial(a,2.38,y),radial(z,2.38,y),.09,.1);
  const len=2*2.38*Math.sin(Math.PI/8)-.24;
  b.at([mid[0],floorY+.34,mid[2]],[0,theta,0],()=>{b.box(C.green,[0,0,0],[len,.32,.055]);for(const yy of[-.135,.135])b.box('#caac6f',[0,yy,.035],[len-.08,.017,.014]);cloudPlaque(b);for(const sx of[-1,1]){const x=sx*(len/2-.13);b.poly('#ba9f66',[[x-.04,0],[x,.055],[x+.04,0],[x,-.055]],.014,[0,0,.04]);}for(const x of [-len/2,len/2])b.box(C.red,[x,.1,0],[.065,.8,.085]);for(const x of [-len*.28,0,len*.28])b.box(C.red,[x,.355,0],[.055,.22,.08]);});
 }
}
function buildFurniture(b){const y=CONSTRUCTION_LAYOUT.floorY;
 // Seven joined bench segments, leaving the full front face open.
 for(let face=0;face<7;face++){const a=vertex(face),z=vertex(face+1),mid=radial((face+1)/8*TAU,2.12*Math.cos(Math.PI/8)),len=2*2.12*Math.sin(Math.PI/8)+.05,angle=(face+1)/8*TAU;b.at([mid[0],y,mid[2]],[0,angle,0],()=>{b.soft('#8a5937',[0,.43,0],[len,.14,.48],.04);b.soft('#c9ac83',[0,.53,0],[len-.045,.11,.45],.05);for(const sx of [-1,1])b.box('#805034',[sx*len*.34,.22,0],[.12,.44,.36]);});}
 b.cyl('#9e633d',[0,y+.715,0],.7,.7,.09,b.quality==='light'?16:28);b.cyl('#c28953',[0,y+.775,0],.68,.68,.035,b.quality==='light'?16:28);b.cyl('#784c32',[0,y+.36,0],.14,.2,.68,10);
 for(const a of [0,Math.PI]){const p=radial(a,1.05,y);b.cyl('#c3a37a',[p[0],y+.46,p[2]],.28,.28,.1,16);for(let i=0;i<3;i++){const q=radial(i/3*TAU,.17);b.beam('#835434',[p[0]+q[0]*1.15,y+.02,p[2]+q[2]*1.15],[p[0]+q[0],y+.41,p[2]+q[2]],.065);}}
}
function flower(b,p,c,s=.11){for(let i=0;i<5;i++){const a=i/5*TAU;b.add('solid',new THREE.SphereGeometry(1,6,3),c,[p[0]+Math.sin(a)*s*.64,p[1],p[2]+Math.cos(a)*s*.64],[s*.62,s*.2,s*.7]);}b.add('solid',new THREE.SphereGeometry(1,6,3),'#e6b95b',[p[0],p[1]+s*.1,p[2]],[s*.3,s*.22,s*.3]);}
function gardenLamp(b,a){const p=radial(a,3.14,.23);b.cyl('#b3a18b',[p[0],.17,p[2]],.23,.26,.22,8);b.cyl('#635042',[p[0],.86,p[2]],.055,.07,1.22,8);b.at([p[0],1.42,p[2]],[0,Math.PI/4,0],()=>{b.add('glow',new THREE.BoxGeometry(.3,.4,.3),'#ffe7ab');for(const y of [-.25,.25])b.soft('#6f5745',[0,y,0],[.46,.065,.46],.02);for(const sx of [-1,1])for(const sz of [-1,1])b.box('#7b5b3c',[sx*.17,0,sz*.17],[.035,.45,.035]);b.cyl('#50484a',[0,.35,0],.06,.35,.18,4);b.soft('#8e765c',[0,.46,0],[.13,.06,.13],.02);});}
function buildGarden(b){
 // The border and flower beds stay clear of the stairs and front walking route.
 const count=b.quality==='light'?22:30;for(let i=0;i<=count;i++){const a=.39+i/count*(TAU-.78),p=radial(a,3.33,.1);b.at(p,[0,a,0],()=>b.soft(i%3?'#c4b5a2':'#b9a995',[0,0,0],[.28,.2,.24],.035));}
 const clusters=b.quality==='light'?9:13;for(let i=0;i<clusters;i++){const a=.49+i/(clusters-1)*(TAU-.98),p=radial(a,3.12,.28);b.ico(i%2?'#8a9d47':'#9ba94a',p,[.35,.33,.32]);for(let j=0;j<3;j++){const t=a+j*2.4,q=[p[0]+Math.sin(t)*.17,.38+(j%2)*.13,p[2]+Math.cos(t)*.15];b.ball(j%2?'#b4bb62':'#a3b153',q,[.2,.18,.19],b.quality==='light'?6:8,'foliage');}if(i%2===0)for(let j=0;j<(b.quality==='light'?3:5);j++){const t=j*2.4+a,q=[p[0]+Math.sin(t)*.27,.55+(j%3)*.09,p[2]+Math.cos(t)*.24];flower(b,q,i%4?'#f2e7ca':'#df8f9a',.105);b.beam('#687c3d',[q[0],.16,q[2]],[q[0],q[1]-.01,q[2]],.015);}}
 for(const a of [-.69,.69,2.42,3.86])gardenLamp(b,a);
}
/** One central ceiling lantern; lowest point stays over 2 m above the deck. */
function buildCeilingLantern(b){
 b.soft('#684d35',[0,4.9,0],[.31,.16,.31],.025);
 b.cyl('#85683e',[0,4.285,0],.018,.018,1.14,6);
 const loop=Array.from({length:13},(_,i)=>{const a=i/12*TAU;return[Math.sin(a)*.07,3.66+Math.cos(a)*.07,0];});b.tube('#987449',loop,.018,12,4);
 b.cyl('#ffe4a8',[0,3.1,0],.275,.275,.54,8,[0,Math.PI/8,0],'glow');
 for(const y of[2.8,3.4])b.cyl('#805239',[0,y,0],.34,.34,.08,8,[0,Math.PI/8,0]);
 for(let i=0;i<8;i++){const a=(i+.5)/8*TAU,p=radial(a,.275,3.1);b.box('#93683d',p,[.035,.57,.035],[0,a,0]);}
 b.cyl('#4c6250',[0,3.535,0],.09,.39,.19,8,[0,Math.PI/8,0]);
 b.cyl('#cba15b',[0,3.64,0],.09,.1,.04,8);
 b.cyl('#ba8b48',[0,2.765,0],.14,.1,.055,8);
 b.ball('#9b693c',[0,2.69,0],[.06,.07,.06],8);
 for(const a of[0,Math.PI/2,Math.PI,Math.PI*3/2])b.at(radial(a,.257,3.1),[0,a,0],()=>{b.box('#bf985a',[0,0,0],[.018,.4,.018]);b.box('#bf985a',[0,-.1,0],[.21,.018,.018]);});
}
export function createSubPavilion(options={}){
 const {scale=1,quality='balanced',castShadow=true,includeFurniture=true,includeGarden=true}=options;if(!Number.isFinite(scale)||scale<=0)throw new RangeError('scale must be positive and finite');if(!['balanced','light'].includes(quality))throw new RangeError('quality must be balanced or light');for(const [key,v]of Object.entries({castShadow,includeFurniture,includeGarden}))if(typeof v!=='boolean')throw new TypeError(key+' must be boolean');
 const builders={structure:new Builder(quality),roof:new Builder(quality),furniture:new Builder(quality),garden:new Builder(quality)};buildStructure(builders.structure);buildCeilingLantern(builders.structure);buildRoof(builders.roof);if(includeFurniture)buildFurniture(builders.furniture);if(includeGarden)buildGarden(builders.garden);
 const group=new THREE.Group();group.name='korean-sub-octagonal-pavilion';const parts={};for(const [key,b]of Object.entries(builders)){parts[key]=b.finish('pavilion-'+key,castShadow);group.add(parts[key]);}group.scale.setScalar(scale*SIZE_MULTIPLIER);
 const anchors={ceilingLantern:anchor(group,'pavilion-ceiling-lantern',[0,3.1,0]),entrance:anchor(group,'pavilion-entrance',[0,0,3.78]),floor:anchor(group,'pavilion-floor',[0,.572,1.42]),table:anchor(group,'pavilion-table',[0,.57+.795,0]),roofTop:anchor(group,'pavilion-roof-top',[0,5.79,0])};
 for(let i=0;i<8;i++)anchors['column'+(i+1)]=anchor(group,'column-'+(i+1),radial(vertex(i),2.38,.57));for(let i=0;i<7;i++)anchors['bench'+(i+1)]=anchor(group,'bench-'+(i+1),radial((i+1)/8*TAU,2.12*Math.cos(Math.PI/8),1.155));
 for(const [i,a]of[0,Math.PI].entries())anchors['stool'+(i+1)]=anchor(group,'pavilion-stool-'+(i+1),radial(a,1.05,1.08));
 anchors.futureSeatLeft=anchor(group,'future-seat-left',[-1.05,1.08,0]);anchors.futureSeatRight=anchor(group,'future-seat-right',[1.05,1.08,0]);
 group.userData={assetId:'park/korean-sub-pavilion',version:'5.0.0',quality,layout:{...SUB_PAVILION_LAYOUT},includeFurniture,includeGarden,visualOnly:true,physics:false,interaction:false,front:'+Z',entranceFace:7};return handle(group,parts,anchors);
}
