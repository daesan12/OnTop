import{THREE,Builder,TAU,radial,anchor,handle}from'./helpers.js';
export const SHOOTING_RANGE_LAYOUT=Object.freeze({floorY:.65,entranceWidth:3.7,targetCount:3,front:'+Z',counterTopY:1.58});
const colors={wood:'#9b6139',dark:'#74472c',light:'#bd8450',cream:'#e8d3ae',stone:'#b9ae9e',tile:'#4b4c5d',red:'#ac503d',blue:'#4f6c86',gold:'#c99b56'};
function rosette(b,p,size=.16){b.at(p,[0,0,0],()=>{for(let i=0;i<5;i++){const a=i/5*TAU;b.add('solid',new THREE.SphereGeometry(1,6,3),'#bb9d75',[Math.sin(a)*size*.47,Math.cos(a)*size*.47,-.005],[size*.39,size*.46,.015]);}b.cyl('#8c765e',[0,0,.018],size*.17,size*.17,.02,8,[Math.PI/2,0,0]);});}
function lantern(b,x,y,z,s=1){b.at([x,y,z],[0,0,0],()=>{b.add('glow',new THREE.BoxGeometry(.32*s,.48*s,.32*s),'#ffe7a9');for(const yy of[-.29,.29])b.soft('#755336',[0,yy*s,0],[.46*s,.075*s,.46*s],.02);for(const sx of[-1,1])for(const sz of[-1,1])b.box('#a77c42',[sx*.17*s,0,sz*.17*s],[.035*s,.53*s,.035*s]);for(const a of[0,Math.PI/2,Math.PI,Math.PI*3/2])b.at(radial(a,.17*s),[0,a,0],()=>{b.box('#b88a48',[0,0,0],[.018*s,.43*s,.02*s]);b.box('#b88a48',[0,-.12*s,0],[.29*s,.02*s,.02*s]);});b.cyl('#65503c',[0,.4*s,0],.075*s,.32*s,.16*s,4,[0,Math.PI/4,0]);});}
function framedWindow(b,w,h){b.soft(colors.dark,[0,0,0],[w+.16,h+.16,.12],.025);b.add('glow',new THREE.BoxGeometry(w,h,.035),'#edce91',[0,0,.075]);for(const x of[-w/2,w/2])b.box(colors.light,[x,0,.11],[.07,h+.1,.075]);for(const y of[-h/2,h/2])b.box(colors.light,[0,y,.11],[w+.1,.07,.075]);for(let i=1;i<6;i++)b.box(colors.wood,[(i/6-.5)*w,0,.11],[.035,h,.045]);for(const fy of[-.37,-.25,.25,.37])b.box(colors.wood,[0,fy*h,.11],[w,.035,.045]);}
function mainRoofPoint(face,u,t,lift=0){const halfRidge=3.42,hw=5.1,hd=2.83,y=5.16-1.43*t**.72+.27*t**5+.14*Math.abs(u)**6*t+lift;return face<2?[u*(halfRidge+(hw-halfRidge)*t),y,(face===0?1:-1)*t*hd]:[(face===2?1:-1)*(halfRidge+(hw-halfRidge)*t),y,u*t*hd];}
function porchRoofPoint(side,u,t,lift=0){const x=side*(.02+2.33*t),front=(u+1)/2,z=-.55+3.75*front,y=5.77+.12*front-1.95*t**.72+.27*t**5+.09*front*t+lift;return[x,y,z];}
function roofPatch(b,fn,u0,u1,t0,t1,color,raised=false,bottom=false){const nu=raised?(b.quality==='light'?3:4):(b.quality==='light'?8:12),nt=raised?(b.quality==='light'?2:3):(b.quality==='light'?5:8),p=[],idx=[];for(let j=0;j<=nt;j++)for(let i=0;i<=nu;i++){const u=u0+(u1-u0)*i/nu,t=t0+(t1-t0)*j/nt,lift=bottom?-.11:raised?.022+Math.sin(i/nu*Math.PI)*.075:0;p.push(...fn(u,t,lift));if(j<nt&&i<nu){const k=j*(nu+1)+i;idx.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);}}b.surface('roof',color,p,idx);}
function sealedRoofEdge(b,fn){for(let i=0;i<12;i++){const a=fn(i/6-1,1,0),z=fn((i+1)/6-1,1,0),c=fn(i/6-1,1,-.11),d=fn((i+1)/6-1,1,-.11);b.surface('roof','#55505a',[...a,...z,...c,...d],[0,1,2,1,3,2]);}}
function closePorchRear(b){
 const z=-.55,tMain=Math.abs(z)/2.83,mainY=5.16-1.43*tMain**.72+.27*tMain**5;
 const floorCenter=mainY-.10,topCenter=porchRoofPoint(1,-1,0,-.07)[1];b.add('roof',new THREE.BoxGeometry(.06,topCenter-floorCenter,.10),'#51515f',[0,(topCenter+floorCenter)/2,z]);
 for(const side of[-1,1])for(let i=0;i<20;i++){
  const a=porchRoofPoint(side,-1,i/20,-.07),c=porchRoofPoint(side,-1,(i+1)/20,-.07),floor=mainY-.10;a[1]=Math.max(a[1],floor);c[1]=Math.max(c[1],floor);
  // A shallow closed back apron overlaps the main roof rather than leaving a
  // triangular opening underneath the raised porch ridge.
  const p=[a[0],a[1],z-.05,c[0],c[1],z-.05,a[0],floor,z-.05,c[0],floor,z-.05,a[0],a[1],z+.05,c[0],c[1],z+.05,a[0],floor,z+.05,c[0],floor,z+.05];
  b.surface('roof','#51515f',p,[0,1,2,1,3,2,4,6,5,5,6,7,0,4,1,1,4,5,2,3,6,3,7,6,0,2,4,2,6,4,1,5,3,3,5,7]);
 }
}
function buildRoof(b){
 for(let face=0;face<4;face++){const fn=(u,t,l)=>mainRoofPoint(face,u,t,l);roofPatch(b,fn,-1,1,0,1,colors.tile);roofPatch(b,fn,-1,1,0,1,'#705438',false,true);const cols=face<2?(b.quality==='light'?20:28):(b.quality==='light'?8:12),rows=b.quality==='light'?2:3;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const u0=-1+col/cols*2,u1=-1+(col+1)/cols*2;roofPatch(b,fn,u0,u1,Math.max(.025,row/rows),Math.min(1,(row+1)/rows+.04),['#535564','#5d5c6c','#494c5c'][(col+row)%3],true);if(row===rows-1){const p=fn((u0+u1)/2,1,.03);b.add('roof',new THREE.SphereGeometry(1,8,3),'#6d6470',p,[.11,.073,.078]);}}
  sealedRoofEdge(b,fn);const eave=Array.from({length:17},(_,i)=>fn(i/8-1,1,-.12));b.tube('#936039',eave,.11,20,6);
 }
 for(const sx of[-1,1])for(const sz of[-1,1]){const points=Array.from({length:17},(_,i)=>mainRoofPoint(sz===1?0:1,sx,i/16,.085));b.tube('#424a5b',points,.105,18,6,'roof');const p=points.at(-1);b.ball('#5c5c6a',p,[.13,.12,.13],8,'roof');}
 const ridge=Array.from({length:17},(_,i)=>{const x=(i/16-.5)*7.25;return[x,5.26+.08*(Math.abs(x)/3.625)**5,0];});b.tube('#424a5a',ridge,.13,22,8,'roof');
 // Central projecting gable roof, proud of the main roof with a raised ridge.
 for(const side of[-1,1]){const fn=(u,t,l)=>porchRoofPoint(side,u,t,l);roofPatch(b,fn,-1,1,0,1,'#484b5b');roofPatch(b,fn,-1,1,0,1,'#784f30',false,true);const cols=b.quality==='light'?12:16,rows=b.quality==='light'?2:3;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)roofPatch(b,fn,-1+col/cols*2,-1+(col+1)/cols*2,Math.max(.02,row/rows),Math.min(1,(row+1)/rows+.035),col%2?'#555767':'#4d5061',true);
  const eave=Array.from({length:13},(_,i)=>fn(i/6-1,1,-.12));b.tube('#945c33',eave,.11,14,6);sealedRoofEdge(b,fn);
  const gable=Array.from({length:17},(_,i)=>fn(1,i/16,.075));b.tube('#454b5a',gable,.12,20,7,'roof');for(let i=1;i<=10;i++){const p=fn(1,i/10,.09);b.cyl('#69616b',[p[0],p[1],p[2]+.035],.115,.115,.06,10,[Math.PI/2,0,0],'roof');}
  const end=gable.at(-1);b.cyl('#514f5c',[end[0],end[1],end[2]+.05],.21,.21,.16,12,[Math.PI/2,0,0],'roof');rosette(b,[end[0],end[1],end[2]+.14],.18);
 }
 closePorchRear(b);
 const top=Array.from({length:13},(_,i)=>[0,5.83+.12*i/12,-.58+3.85*i/12]);b.tube('#444a59',top,.13,16,7,'roof');b.cyl('#504f5b',[0,6.02,3.28],.27,.27,.18,14,[Math.PI/2,0,0],'roof');rosette(b,[0,6.02,3.39],.24);
 // The timber pediment has depth and supports the projecting roof, not a floating sign.
 b.poly('#8d5734',[[-2.22,4.0],[0,5.69],[2.22,4.0]],.18,[0,0,2.94]);for(const sx of[-1,1]){b.beam('#bb7c45',[0,5.72,3.15],[sx*2.37,4.06,3.15],.19,.2);for(let i=0;i<5;i++){const t=(i+.4)/5;b.box('#e4bd83',[sx*2.17*t,5.62-1.53*t,3.26],[.14,.17,.11],[0,0,sx*-.65]);}}
 b.cyl('#aa6b39',[0,4.87,3.17],.27,.27,.10,8,[Math.PI/2,0,0]);rosette(b,[0,4.87,3.24],.24);
}
function buildStructure(b){const floorY=.65;
 b.soft('#aa9f8e',[0,.27,0],[9.75,.54,5.75],.08);b.soft('#d3c2a6',[0,.59,0],[9.9,.12,5.87],.055);
 for(const z of[-2.81,2.81])for(let row=0;row<2;row++)for(let i=0;i<16;i++){const x=(i-7.5)*.6+(row%2?.12:0);b.soft(i%3?'#b8ad9b':'#c4b7a1',[x,.15+row*.25,z],[.56,.23,.1],.025);}
 for(const sx of[-1,1])for(let row=0;row<2;row++)for(let i=0;i<9;i++)b.soft(i%2?'#b9ad9b':'#c7b9a2',[sx*4.82,.15+row*.25,(i-4)*.61],[.1,.23,.57],.025);
 for(let i=0;i<3;i++){const h=(3-i)*.216;b.soft(i%2?'#c8b9a2':'#d9c9af',[0,h/2,2.98+i*.38],[3.28,h,.55],.03);for(const sx of[-1,1])b.soft('#b8aa97',[sx*1.82,h/2+.13,3.0+i*.38],[.32,h+.26,.57],.035);}
 // Continuous back and side walls; the central front is fully open.
 b.box(colors.cream,[0,2.1,-2.42],[9.05,2.9,.20]);for(const sx of[-1,1]){b.box(colors.cream,[sx*4.44,2.1,0],[.16,2.9,4.9]);b.box(colors.cream,[sx*3.22,2.1,2.4],[2.46,2.9,.16]);}
 for(const z of[-2.52,2.51])for(const y of[.85,1.16,3.3,3.6]){if(z>0){for(const sx of[-1,1])b.soft(colors.wood,[sx*3.24,y,z],[2.62,.15,.18],.02);}else b.soft(colors.wood,[0,y,z],[9.2,.15,.18],.02);}
 for(const sx of[-1,1])for(const y of[.85,1.16,3.3,3.6])b.soft(colors.wood,[sx*4.54,y,0],[.18,.15,5.1],.02);
 for(const x of[-4.5,-2.0,2.0,4.5])for(const z of[-2.45,2.45]){b.soft('#b8ac97',[x,.79,z],[.52,.28,.52],.045);b.soft('#996037',[x,2.2,z],[.27,2.76,.27],.035);b.soft('#be8750',[x,3.6,z],[.47,.16,.48],.025);}
 for(const z of[-2.44,2.44])b.soft('#90582f',[0,3.74,z],[9.5,.23,.28],.035);for(const x of[-4.48,4.48])b.soft('#966338',[x,3.73,0],[.28,.23,5.3],.03);
 for(const x of[-3.25,3.25])b.at([x,2.1,2.5],[0,0,0],()=>framedWindow(b,1.78,1.65));
 for(const sx of[-1,1]){b.at([sx*4.54,2.1,0],[0,sx*Math.PI/2,0],()=>framedWindow(b,1.5,1.4));b.beam('#b27c43',[sx*2.0,3.25,2.55],[sx*1.55,3.78,2.55],.12);b.soft('#91582f',[sx*2.0,2.24,2.67],[.31,3.18,.32],.035);}
 // Roof support beams and visible interior rafters.
 for(const x of[-1.4,0,1.4]){b.beam('#8a5b36',[x,3.63,-2.25],[x,4.97,0],.12,.15);b.beam('#8a5b36',[x,4.97,0],[x,3.63,2.25],.12,.15);}
 for(const x of[-2.25,2.25]){lantern(b,x,3.15,2.94,1.1);b.beam('#96643a',[x,3.68,2.53],[x,3.72,2.94],.07);b.cyl('#96643a',[x,3.70,2.94],.035,.035,.15,8);}
 b.soft('#8a5b36',[0,4.67,-.4],[3.2,.13,.16],.02);
 for(const x of[-1.1,1.1]){b.cyl('#845a36',[x,4.01,-.4],.015,.015,1.32,6);lantern(b,x,3.05,-.4,.66);}
}
function target(b,p,size=1){b.at(p,[0,0,0],()=>{for(const[r,c,z]of[[.27,colors.blue,.02],[.205,'#eee0bd',.042],[.13,'#bd5c45',.064],[.06,'#f4dca8',.084]])b.cyl(c,[0,0,z],r*size,r*size,.025,24,[Math.PI/2,0,0]);});}
function buildRange(b,includeProps){
 b.soft('#805334',[0,.66,-.2],[3.7,.02,3.98],.02);
 for(let i=0;i<12;i++)b.box(i%2?'#bc915b':'#c69b65',[(i-5.5)*.30,.68,-.2],[.3,.02,3.95]);
 for(const x of[-1.2,0,1.2]){b.soft('#a27042',[x,1.95,-2.23],[1.02,1.42,.24],.03);for(let j=0;j<4;j++)b.box(j%2?'#b58c54':'#ba945d',[x,1.42+j*.32,-2.11],[.94,.29,.06]);b.cyl('#94653f',[x,1.96,-2.072],.295,.295,.10,24,[Math.PI/2,0,0]);target(b,[x,1.96,-2.04],1.05);}
 for(let i=0;i<7;i++)b.soft('#4d657a',[(i-3)*.5,2.99,-2.1],[.48,.34,.055],.02);
 b.soft('#92603a',[0,1.12,.72],[3.75,.86,.22],.025);for(let i=0;i<14;i++)b.box(i%2?'#9b693f':'#a47246',[(i-6.5)*.26,1.12,.842],[.245,.76,.035]);b.soft('#cc9a5b',[0,1.53,.73],[3.94,.10,.65],.025);
 if(includeProps)for(const x of[-1.1,1.1]){b.cyl('#af773e',[x,1.1,1.11],.18,.17,.83,12);for(const y of[.73,1.45])b.cyl('#d0a166',[x,y,1.11],.19,.19,.045,12);for(let i=0;i<5;i++){const a=i/5*TAU,xx=x+Math.sin(a)*.1,z=1.11+Math.cos(a)*.1,y=1.78+(i%2)*.055;b.cyl('#8e5131',[xx,(1.2+y)/2,z],.009,.009,y-1.2,5);b.poly(i%2?'#ecd9af':'#b75945',[[-.025,0],[-.043,.11],[0,.08],[.043,.11],[.025,0]],.008,[xx,y-.12,z]);}}
}
function buildSignage(b){
 b.soft('#88502c',[0,3.87,2.99],[3.95,1.07,.2],.08);b.soft('#bb603d',[0,3.87,3.11],[3.73,.93,.055],.055);b.soft('#e9c98f',[0,3.87,3.15],[3.58,.82,.025],.04);
 for(const x of[-1.1,1.1]){b.soft('#c79546',[x,4.43,3.05],[.18,.36,.13],.025);b.cyl('#e5c17d',[x,4.29,3.13],.045,.045,.04,8,[Math.PI/2,0,0]);}
 for(const sx of[-1,1]){b.box(colors.wood,[sx*2.03,2.93,2.84],[.10,.11,.28]);b.at([sx*2.03,2.23,2.94],[0,0,0],()=>{b.cyl(colors.gold,[sx*.18,.7,0],.04,.04,.88,8,[0,0,Math.PI/2]);b.poly('#e8d4ac',[[-.33,.71],[.33,.71],[.33,-.72],[0,-.57],[-.33,-.72]],.04,[sx*.18,0,.02]);target(b,[sx*.18,.05,.05],.85);for(let i=0;i<3;i++){const x=sx*.18+(i-1)*.2;b.poly('#617b91',[[x-.13,-.6],[x,-.4],[x+.13,-.6]],.01,[0,0,.08]);}});}
}
function blossom(b,p,c,s=.11){for(let i=0;i<5;i++){const a=i/5*TAU;b.add('solid',new THREE.SphereGeometry(1,6,3),c,[p[0]+Math.sin(a)*s*.6,p[1],p[2]+Math.cos(a)*s*.6],[s*.6,s*.2,s*.66]);}b.add('solid',new THREE.SphereGeometry(1,6,3),'#e7b95c',[p[0],p[1]+.01,p[2]],[s*.26,s*.18,s*.26]);}
function buildGarden(b){for(const sx of[-1,1]){b.soft('#9d927e',[sx*3.46,.07,3.04],[2.8,.14,1.15],.10);b.box('#aa9e8c',[sx*3.44,.13,3.59],[2.98,.20,.19]);for(const x of[2.04,4.84])b.box('#aa9e8c',[sx*x,.13,3.11],[.18,.20,1.04]);for(let i=0;i<9;i++)b.soft(i%2?'#bfb29f':'#cdbda5',[sx*(2.12+i*.31),.14,3.61],[.29,.28,.26],.035);for(const x of[2.04,4.84])for(let i=0;i<3;i++)b.soft('#c5b69f',[sx*x,.14,2.7+i*.3],[.25,.28,.28],.035);
  const count=b.quality==='light'?4:6;for(let i=0;i<count;i++){const x=sx*(2.45+i/(count-1)*2.05),p=[x,.40,3.05+Math.sin(i*2.4)*.14];b.ico(i%2?'#829b49':'#95a747',p,[.39,.36,.34]);for(let j=0;j<2;j++)b.ball('#a6b45a',[x+Math.sin(i+j)*.20,.52,p[2]+Math.cos(i+j)*.17],[.22,.19,.21],7,'foliage');if(i%2===0)for(let j=0;j<4;j++)blossom(b,[x+Math.sin(j*2.4)*.25,.68+(j%2)*.08,p[2]+Math.cos(j*2.4)*.21],sx<0?'#df96b2':'#e7a6bb',.12);else for(let j=0;j<3;j++)blossom(b,[x+Math.sin(j*2.4)*.23,.42,p[2]+Math.cos(j*2.4)*.21],'#f4e8c8',.09);}
  b.soft('#baae97',[sx*1.87,.79,3.3],[.65,.27,.64],.04);lantern(b,sx*1.87,1.26,3.3,.95);
 }}
export function createShootingRange(options={}){
 const{scale=1,quality='balanced',castShadow=true,includeGarden=true,includeProps=true,signTexture}=options;if(!Number.isFinite(scale)||scale<=0)throw new RangeError('scale must be positive and finite');if(!['balanced','light'].includes(quality))throw new RangeError('invalid quality');for(const[k,v]of Object.entries({castShadow,includeGarden,includeProps}))if(typeof v!=='boolean')throw new TypeError(k+' must be boolean');
 const builders={structure:new Builder(quality),roof:new Builder(quality),range:new Builder(quality),signage:new Builder(quality),garden:new Builder(quality)};buildStructure(builders.structure);buildRoof(builders.roof);buildRange(builders.range,includeProps);buildSignage(builders.signage);if(includeGarden)buildGarden(builders.garden);
 if(!signTexture)target(builders.signage,[0,3.87,3.18],1);const group=new THREE.Group();group.name='korean-shooting-range';const parts={};for(const[key,b]of Object.entries(builders)){parts[key]=b.finish('shooting-range-'+key,castShadow);group.add(parts[key]);}
 if(signTexture){const label=new THREE.Mesh(new THREE.PlaneGeometry(3.48,.77),new THREE.MeshStandardMaterial({map:signTexture,roughness:1}));label.name='caller-owned-korean-sign';label.position.set(0,3.87,3.168);parts.signage.add(label);} // Optional input texture stays caller-owned.
 group.scale.setScalar(scale);const anchors={entrance:anchor(group,'shooting-range-entrance',[0,.65,2.55]),counter:anchor(group,'shooting-counter',[0,1.58,.73]),sign:anchor(group,'shooting-range-sign',[0,3.87,3.17])};for(const[i,x]of[-1.2,0,1.2].entries()){anchors['target'+(i+1)]=anchor(group,'target-'+(i+1),[x,1.96,-1.93]);anchors['lane'+(i+1)]=anchor(group,'shooting-lane-'+(i+1),[x,.69,1.65]);}
 group.userData={assetId:'park/korean-shooting-range',version:'2.0.0',quality,layout:{...SHOOTING_RANGE_LAYOUT},includeGarden,includeProps,visualOnly:true,physics:false,interaction:false};return handle(group,parts,anchors);
}
