import{THREE,Builder,TAU,radial,anchor,handle}from'./helpers.js';import{P,flower,lantern,windowPanel,targetIcon,top,foliageFlower}from'./details.js';import{buildRoof}from'./roof.js';
const SIZE_MULTIPLIER=.85;
export const TRADITIONAL_PLAY_ZONE_LAYOUT=Object.freeze({floorY:.75*SIZE_MULTIPLIER,entranceWidth:4.94*SIZE_MULTIPLIER,front:'+Z',nominalWidth:17*SIZE_MULTIPLIER,sizeMultiplier:SIZE_MULTIPLIER});
function frieze(b,w){b.soft(P.green,[0,0,0],[w,.31,.26],.025);for(const y of[-.15,.15])b.box(P.gold,[0,y,.025],[w,.025,.29]);for(let i=0;i<Math.floor(w/.9);i++){const x=(i-(Math.floor(w/.9)-1)/2)*.9;b.box(i%2?P.orange:P.jade,[x,0,.15],[.065,.23,.025],[0,0,-.35]);}flower(b,[0,0,.16],.13,'#dfad64');}
function structure(b){
 b.soft('#aaa08d',[0,.27,0],[15.6,.54,8.12],.08);b.soft('#d4c3a9',[0,.63,0],[15.85,.18,8.36],.06);
 // The outside yut barrel and tops stand on a connected stone display apron.
 b.soft('#aaa08d',[4.75,.27,4.14],[3.25,.54,1.40],.055);b.soft('#d4c3a9',[4.75,.63,4.14],[3.25,.18,1.40],.04);
 for(const z of[-4.03,4.03])for(let row=0;row<2;row++)for(let i=0;i<25;i++)b.soft(i%3?'#bcb09c':'#c8b9a3',[(i-12)*.60+(row%2?.08:0),.15+row*.25,z],[.56,.23,.11],.03);
 for(const sx of[-1,1])for(let row=0;row<2;row++)for(let i=0;i<13;i++)b.soft(i%2?'#bcb09c':'#cbbbA5',[sx*7.73,.15+row*.25,(i-6)*.61],[.11,.23,.57],.03);
 for(let i=0;i<29;i++)b.box(i%2?'#b48753':'#bc915c',[(i-14)*.49,.735,.38],[.49,.03,7.32]);
 for(let i=0;i<3;i++){const h=(3-i)*.24;b.soft(i%2?'#cbbbA2':'#d7c7ac',[0,h/2,4.26+i*.43],[4.35,h,.68],.03);for(const sx of[-1,1])b.soft('#baac94',[sx*2.38,h/2+.13,4.28+i*.43],[.32,h+.26,.68],.035);}
 // The front opening is bounded by two posts, never by a wall panel.
 b.box(P.cream,[0,2.6,-3.35],[14.3,3.7,.22]);for(const sx of[-1,1]){b.box(P.cream,[sx*7.05,2.6,0],[.22,3.7,6.9]);b.box(P.cream,[sx*4.98,2.6,3.35],[4.48,3.7,.22]);}
 for(const z of[-3.47,3.48])for(const y of[1.12,1.5,3.82,4.30]){if(z>0){for(const sx of[-1,1])b.soft(P.wood,[sx*4.98,y,z],[4.65,.14,.18],.02);}else b.soft(P.wood,[0,y,z],[14.6,.14,.18],.02);}
 for(const sx of[-1,1])for(const y of[1.12,1.5,3.82,4.3])b.soft(P.wood,[sx*7.18,y,0],[.18,.14,7.05],.02);
 for(const x of[-7.05,-2.65,2.65,7.05])for(const z of[-3.35,3.35]){b.soft('#bbad96',[x,.89,z],[.61,.34,.61],.045);b.soft(P.wood,[x,2.77,z],[.36,3.6,.36],.04);b.soft(P.green,[x,4.52,z],[.59,.22,.62],.035);b.soft(P.jade,[x,4.71,z],[.78,.17,.76],.03);b.box(P.green,[x,4.77,z],[.30,.15,.34]);}
 for(const z of[-3.35,3.35])b.soft('#976139',[0,4.39,z],[14.8,.25,.32],.035);for(const x of[-7.06,7.06])b.soft('#976139',[x,4.39,0],[.32,.25,7.25],.035);
 for(const x of[-4.99,4.99])b.at([x,2.65,3.47],[0,0,0],()=>windowPanel(b,2.2,1.85));
 for(const sx of[-1,1])for(const z of[-1.22,1.22])b.at([sx*7.18,2.65,z],[0,sx*Math.PI/2,0],()=>windowPanel(b,1.64,1.8));
 b.at([0,2.77,-3.48],[0,Math.PI,0],()=>windowPanel(b,3.0,1.75));b.at([0,2.77,-3.18],[0,0,0],()=>windowPanel(b,3.0,1.75));
 // Interior framing prevents paper panels from looking like a thin empty shell.
 for(const x of[-4.0,0,4.0])b.soft(P.wood,[x,2.60,-3.23],[.14,3.70,.14],.02);for(const y of[1.22,4.19]){b.box(P.dark,[0,y,-3.23],[14.0,.1,.14]);for(const sx of[-1,1])b.box(P.dark,[sx*4.99,y,3.23],[4.66,.1,.14]);}
 // Continuous curved side valances bridge the frieze to the roof underside.
 // Segments overlap, keeping the support connected at every seam.
 const underside=(x,z)=>{const sideT=(x-5.70)/2.60,frontT=Math.abs(z)/3.95,t=Math.max(sideT,frontT),u=frontT>=sideT?x/(5.70+2.60*t):z/(t*3.95);return 6.55-2.08*t**.72+.33*t**5+.18*Math.abs(u)**6*t-.14;};
 for(const sx of[-1,1])for(let i=0;i<36;i++){const z=(i/35-.5)*7.30,corners=[[7.14,z-.115],[7.46,z-.115],[7.46,z+.115],[7.14,z+.115]],p=[...corners.flatMap(([x,zz])=>[sx*x,4.57,zz]),...corners.flatMap(([x,zz])=>[sx*x,underside(x,zz)+.008,zz])];b.surface('solid','#896039',p,[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);}
 for(const z of[-3.55,3.55])b.at([0,4.52,z],[0,z>0?0:Math.PI,0],()=>frieze(b,14.8));for(const sx of[-1,1])b.at([sx*7.40,4.55,0],[0,sx*Math.PI/2,0],()=>frieze(b,7.3));
 for(const sx of[-1,1])for(const x of[2.65,7.05])b.at([sx*x,3.85,3.57],[0,0,0],()=>{b.soft(P.green,[0,0,0],[.46,.46,.15],.025);flower(b,[0,0,.09],.17);b.beam(P.green,[sx*.48,.50,-.15],[0,.90,-.15],.13,.16);});
 for(const x of[-4.5,0,4.5]){const p=Array.from({length:17},(_,i)=>{const z=(i/16-.5)*6.70,t=Math.abs(z)/3.95,u=x/(5.70+2.60*t);return[x,6.55-2.08*t**.72+.33*t**5+.18*Math.abs(u)**6*t-.32,z];});for(let i=0;i<p.length-1;i++)b.beam('#8b5e39',p[i],p[i+1],.14,.17);}
 b.soft('#8d5c35',[0,5.90,-.2],[10.0,.16,.18],.02);
 for(const x of[-6.4,-2.9,2.9,6.4]){b.box(P.wood,[x,4.37,3.76],[.12,.20,.58]);lantern(b,[x,3.70,3.98],1.2);b.cyl('#ad8143',[x,4.33,3.98],.025,.025,.22,8);}
 for(const x of[-3.6,0,3.6]){b.cyl('#9e733e',[x,4.935,-.2],.018,.018,1.93,8);lantern(b,[x,3.48,-.2],.92);}
}
function yutStick(b,p,s=1,r=[0,0,0]){b.at(p,r,()=>{b.soft('#b7814c',[0,0,0],[.14*s,.10*s,.68*s],.05*s);b.box('#d6ad71',[0,.052*s,0],[.11*s,.008*s,.60*s]);for(const z of[-.22,.22])b.box('#9e6c3e',[0,.06*s,z*s],[.08*s,.007*s,.018*s]);});}
function bench(b,x,z,length,rotation=0){b.at([x,.75,z],[0,rotation,0],()=>{b.soft(P.dark,[0,.35,0],[length,.18,.75],.04);b.soft('#b5814c',[0,.48,0],[length+.08,.12,.8],.045);for(const xx of[-length*.39,length*.39])b.box(P.dark,[xx,.17,0],[.16,.34,.60]);b.box('#a57040',[0,.12,0],[length*.82,.10,.10]);});}
function cushionStack(b,p,colors,depth=.58){for(const[i,c]of colors.entries())b.soft(c,[p[0]+(i%2)*.04,p[1]+i*.12,p[2]],[.72,.12,depth],.065);}
function interior(b,matTexture){
 bench(b,-5.65,0,4.3,Math.PI/2);bench(b,5.65,0,4.3,Math.PI/2);
 cushionStack(b,[-5.67,1.35,1.30],['#c7a35b','#506882','#b34f43']);cushionStack(b,[5.67,1.35,1.30],['#b65043','#d3b06e','#617f6b']);
 // Low storage shelves of wooden tops, folded mats and play equipment.
 for(const x of[-4.5,4.5]){b.soft(P.dark,[x,1.84,-2.82],[2.3,2.18,.66],.035);b.box('#a87743',[x,1.88,-2.52],[2.15,2.02,.05]);for(const y of[1.0,1.65,2.32,2.94])b.soft('#ba8751',[x,y,-2.43],[2.4,.09,.72],.02);for(const sx of[-1,1])b.box(P.wood,[x+sx*1.13,1.98,-2.42],[.10,2.01,.65]);for(let i=0;i<3;i++)top(b,[x+(i-1)*.61,1.690,-2.25],.68,[P.orange,P.blue,'#a85541'][i]);cushionStack(b,[x,2.39,-2.28],['#b3985d','#5a7666'],.40);}
 b.soft('#d3b680',[0,.756,.10],[3.70,.018,2.82],.025);
 // Optional canvas mat is added by the factory as a separate caller-owned map.
 if(!matTexture)for(const x of[-1.45,0,1.45])for(const z of[-.95,1.15])b.cyl(P.red,[x,.773,z],.075,.075,.01,12);
 for(const[i,p]of[[-.35,.80,.50],[.05,.80,.43],[.42,.80,.53],[.60,.80,.15]].entries())yutStick(b,p,.85,[0,(i-.5)*.4,0]);
 for(const[x,z,c]of[[-1.1,-.75,P.red],[-1.0,-.70,P.red],[1.08,.9,P.blue],[1.2,.88,P.blue]])b.cyl(c,[x,.793,z],.08,.08,.06,12);
 // A small drum on its stand, tucked onto the left bench end.
 b.at([-5.65,1.70,-1.05],[0,.18,0],()=>{b.cyl('#b27542',[0,.15,0],.40,.40,.62,20,[Math.PI/2,0,0]);for(const z of[-.32,.32]){b.cyl('#e6c695',[0,.15,z],.40,.40,.035,20,[Math.PI/2,0,0]);for(let i=0;i<10;i++){const a=i/10*TAU;b.ball('#bd9255',[Math.sin(a)*.35,.15+Math.cos(a)*.35,z*1.07],[.018,.018,.018],6);}}for(const sx of[-1,1])b.beam('#775034',[sx*.30,-.40,-.22],[sx*.24,.18,.20],.075);});
 // Decorative target easel kept out of the central play mat.
 b.at([3.45,.75,-1.2],[0,-.14,0],()=>{for(const sx of[-1,1])b.beam('#8e5b36',[sx*.43,.02,.32],[sx*.40,2.05,-.12],.08);b.beam('#8e5b36',[0,.02,-.65],[0,1.82,-.1],.08);b.soft('#c39151',[0,1.37,0],[1.05,1.25,.14],.035);b.box('#e2c89d',[0,1.37,.086],[.93,1.13,.04]);targetIcon(b,[0,1.37,.12],1.05);b.soft('#9f6b3b',[0,.74,.06],[1.2,.08,.28],.02);});
}
function signage(b){
 const outline=[[-2.95,.32],[-2.78,.65],[-1.52,.76],[0,.87],[1.52,.76],[2.78,.65],[2.95,.32],[2.73,-.48],[1.45,-.58],[0,-.66],[-1.45,-.58],[-2.73,-.48]].map(([x,y])=>[x*.95,y*.70]);
 b.poly('#81502e',outline,.22,[0,4.70,4.62]);b.poly('#c28c4b',outline.map(([x,y])=>[x*.96,y*.91]),.06,[0,4.70,4.83]);b.soft('#9a633a',[0,4.70,4.90],[5.08,.784,.07],.045);
 for(const x of[-1.4,1.4]){b.box(P.dark,[x,5.47,4.51],[.14,.18,.48]);b.soft('#ad7b3e',[x,5.39,4.68],[.15,.40,.14],.025);b.cyl('#dfbb74',[x,5.22,4.77],.045,.045,.04,8,[Math.PI/2,0,0]);}
 for(const sx of[-1,1])for(const y of[-.17,.19])flower(b,[sx*2.47,4.70+y,4.91],.13,'#d8a864');
 b.box('#9b693c',[0,4.33,3.67],[5.45,.16,.18]);
 const obang=['#e4cf96','#d6a34f','#536e90','#bb503d','#f0dbb4','#5b8765'];for(let i=0;i<12;i++){const x=(i-5.5)*.43;b.box(obang[i%obang.length],[x,3.92,3.72],[.415,.69,.055]);b.box('#bb9258',[x,4.28,3.73],[.42,.035,.10]);}
}
function topBadge(b){
 b.poly(P.orange,[[-.42,.18],[-.35,-.12],[-.17,-.36],[0,-.41],[.17,-.36],[.35,-.12],[.42,.18]],.035,[0,2.05,.092]);
 b.ball(P.gold,[0,2.23,.13],[.43,.12,.035],8);b.ball(P.blue,[0,2.255,.155],[.33,.07,.02],8);b.ball(P.gold,[0,2.27,.173],[.22,.043,.012],8);b.box(P.dark,[0,2.43,.16],[.04,.27,.04]);b.box('#e2b76f',[0,1.92,.135],[.57,.06,.02]);
}
function props(b){
 // Separate standing banner on the forecourt, not fused into a doorway post.
 b.at([-5.55,0,4.83],[0,.09,0],()=>{for(const x of[-.52,.52]){b.soft('#a87843',[x,.1,0],[.43,.20,.48],.04);b.soft(P.wood,[x,1.70,0],[.14,3.2,.14],.025);}b.cyl('#ba8747',[0,3.25,0],.065,.065,1.45,10,[0,0,Math.PI/2]);b.poly('#e6c99b',[[-.50,3.19],[.50,3.19],[.50,.65],[-.50,.65]],.045,[0,0,.05]);for(const y of[.67,3.14])b.box(P.red,[0,y,.104],[1.0,.055,.025]);topBadge(b);for(const sx of[-1,1])yutStick(b,[sx*.16,1.1,.15],1.1,[Math.PI/2,sx*.55,0]);for(let i=0;i<15;i++)b.cyl('#d1a65f',[(i-7)*.06,.545,.08],.012,.012,.22,5);});
 b.at([5.37,.72,4.02],[0,0,0],()=>{b.cyl('#92603a',[0,.56,0],.49,.43,1.12,16);for(const y of[.10,1.03])b.cyl('#b5874b',[0,y,0],.50,.50,.07,16);for(let i=0;i<8;i++){const a=i/8*TAU,p=radial(a,.46,.56);b.box(i%2?'#a87242':'#af7d48',p,[.07,1.0,.10],[0,a,0]);}for(let i=0;i<6;i++)yutStick(b,[(i%3-1)*.22,1.32+(i%2)*.14,(Math.floor(i/3)-.5)*.23],1.6,[Math.PI/2,(i-2.5)*.08,(i-2.5)*.08]);});
 top(b,[4.31,.72,4.22],1.2,P.orange);top(b,[3.63,.72,4.37],.78,P.blue);
}
function garden(b){
 for(const sx of[-1,1]){const left=sx<0,center=left?-6.10:7.20,width=left?3.55:1.50,start=left?4.38:6.43,n=left?12:6;b.soft('#9a987c',[center,.08,4.15],[width,.16,1.32],.10);b.box('#b2a58e',[center,.14,4.82],[width+.20,.24,.22]);for(let i=0;i<n;i++)b.soft(i%2?'#c5b9a0':'#cebea7',[sx*(start+i*.32),.17,4.84],[.30,.34,.28],.035);for(const x of(left?[4.26,7.94]:[6.31,8.02])){b.box('#b2a58e',[sx*x,.14,4.17],[.23,.24,1.30]);for(let i=0;i<4;i++)b.soft('#c9b99f',[sx*x,.17,3.69+i*.32],[.26,.34,.34],.035);}
  const count=left?(b.quality==='light'?6:9):(b.quality==='light'?3:4);for(let i=0;i<count;i++){const x=left?-(4.55+i/(count-1)*3.0):(6.63+i/(count-1)*1.05),z=4.07+Math.sin(i*2.4)*.17;b.ico(i%2?'#89a04d':'#7d984a',[x,.48,z],[.44,.42,.40]);for(let j=0;j<2;j++)b.ball('#a9b56b',[x+Math.sin(j+i)*.23,.64,z+Math.cos(j+i)*.18],[.24,.22,.23],7,'foliage');if(i%2===0)for(let j=0;j<4;j++)foliageFlower(b,[x+Math.sin(j*2.4)*.27,.78+(j%2)*.10,z+Math.cos(j*2.4)*.23],i%4?'#eee0b3':'#d9a4b2',.13);}
  b.ico('#a79f8c',[sx*7.5,.31,4.49],[.36,.30,.32]);
 }
}
export function createTraditionalPlayZone(options={}){
 const{scale=1,quality='balanced',castShadow=true,includeInterior=true,includeProps=true,includeGarden=true,signTexture,matTexture}=options;if(!Number.isFinite(scale)||scale<=0)throw new RangeError('scale must be positive and finite');if(!['balanced','light'].includes(quality))throw new RangeError('quality must be balanced or light');for(const[k,v]of Object.entries({castShadow,includeInterior,includeProps,includeGarden}))if(typeof v!=='boolean')throw new TypeError(k+' must be boolean');
 const bs={structure:new Builder(quality),roof:new Builder(quality),interior:new Builder(quality),signage:new Builder(quality),props:new Builder(quality),garden:new Builder(quality)};structure(bs.structure);buildRoof(bs.roof);signage(bs.signage);if(includeInterior)interior(bs.interior,matTexture);if(includeProps)props(bs.props);if(includeGarden)garden(bs.garden);
 const group=new THREE.Group();group.name='korean-traditional-play-zone';const parts={};for(const[k,b]of Object.entries(bs)){parts[k]=b.finish('traditional-play-'+k,castShadow);group.add(parts[k]);}
 if(signTexture){const m=new THREE.Mesh(new THREE.PlaneGeometry(4.94,.70),new THREE.MeshStandardMaterial({map:signTexture,roughness:1}));m.name='caller-owned-korean-sign';m.position.set(0,4.70,4.944);parts.signage.add(m);}
 if(includeInterior&&matTexture){const m=new THREE.Mesh(new THREE.PlaneGeometry(3.62,2.74),new THREE.MeshStandardMaterial({map:matTexture,roughness:1}));m.name='caller-owned-yut-mat';m.rotation.x=-Math.PI/2;m.position.set(0,.767,.10);parts.interior.add(m);}
 group.scale.setScalar(scale*SIZE_MULTIPLIER);const anchors={entrance:anchor(group,'play-zone-entrance',[0,.75,3.85]),playMat:anchor(group,'yut-mat',[0,.77,.1]),sign:anchor(group,'play-zone-sign',[0,4.70,4.95]),benchLeft:anchor(group,'left-bench',[-5.65,1.29,0]),benchRight:anchor(group,'right-bench',[5.65,1.29,0]),banner:anchor(group,'forecourt-banner',[-5.55,0,4.83]),tops:anchor(group,'spinning-top-display',[4.31,.72,4.22])};
 group.userData={assetId:'park/traditional-play-zone',version:'1.1.0',quality,layout:{...TRADITIONAL_PLAY_ZONE_LAYOUT},includeInterior,includeGarden,includeProps,visualOnly:true,physics:false,interaction:false,gameLogic:false};return handle(group,parts,anchors);
}
