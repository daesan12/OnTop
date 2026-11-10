import {THREE,Builder,TAU,radial,check,handle,anchor,cloud,lantern,roof} from './core.js';
function windowGrid(b,w,h){b.box('solid','#775236',[0,0,0],[w+.16,h+.16,.1]);b.box('solid','#e6d6b1',[0,0,.06],[w,h,.03]);for(const x of [-w/2,w/2])b.box('solid','#a37948',[x,0,.09],[.06,h+.06,.055]);for(const y of [-h/2,h/2])b.box('solid','#a37948',[0,y,.09],[w+.06,.06,.055]);for(let i=1;i<4;i++)b.box('solid','#a37948',[(i/4-.5)*w,0,.1],[.025,h,.035]);b.box('solid','#a37948',[0,0,.1],[w,.025,.035]);}
function shelter(b){
 b.box('solid','#b1aa97',[0,.075,0],[4.75,.15,3.08]);b.box('solid','#d0c2a8',[0,.18,0],[4.58,.08,2.95]);
 for(let i=0;i<9;i++)b.box('solid',i%2?'#bd9866':'#b28b59',[(i-4)*.475,.24,.5],[.46,.045,1.34]);
 // Solid joined paper walls: front open; rear and sides meet without gaps.
 b.box('solid','#e6d5b1',[0,1.57,-1.27],[4.25,2.7,.14]);
 for(const sign of [-1,1]){b.box('solid','#e6d5b1',[sign*2.125,1.57,-.16],[.14,2.7,2.42]);for(const y of [.73,2.72])b.box('solid','#90633c',[sign*2.205,y,-.16],[.05,.08,2.45]);b.at([sign*2.205,1.82,-.08],[0,sign*Math.PI/2,0],()=>windowGrid(b,1.14,1.07));}
 for(const z of [-1.17,-1.38]){for(const y of [.4,.73,2.72,2.94])b.box('solid','#93683f',[0,y,z],[4.25,.09,.09]);for(const x of [-.7,.7])b.box('solid','#90643d',[x,1.63,z],[.1,2.62,.1]);}
 b.at([0,1.96,-1.14],[0,0,0],()=>windowGrid(b,1.19,1.05));
 for(const x of [-2.125,2.125])for(const z of [-1.35,1.35]){b.box('solid','#b9af98',[x,.3,z],[.4,.22,.4]);b.cylinder('solid','#895b36',[x,1.73,z],.125,.155,2.7,[0,0,0],6);b.box('solid','#ae8150',[x,3.04,z],[.55,.22,.57]);}
 for(const z of [-1.35,1.35])b.box('solid','#855a36',[0,3.15,z],[4.78,.22,.22]);for(const x of [-2.13,2.13])b.box('solid','#92633a',[x,3.16,0],[.23,.2,3.06]);
 for(const sx of [-1,1])b.beam('solid','#a57b4a',[sx*2.1,2.58,1.36],[sx*1.59,3.07,1.36],.1);
 b.box('solid','#79502e',[0,.51,-.74],[3.91,.15,1]);b.box('solid','#815330',[0,1.05,-1.08],[3.91,.95,.17]);for(const x of [-1.6,1.6]){b.box('solid','#79502e',[x,.36,-.74],[.15,.35,.8]);b.box('solid','#9c6f41',[x*1.15,.9,-.7],[.13,.12,.87]);}
 for(let i=0;i<4;i++){const x=(i-1.5)*.9;b.box('solid',i%2?'#a95145':'#b65a4a',[x,.64,-.72],[.84,.14,.82]);b.box('solid','#9f493f',[x,1.1,-.965],[.84,.69,.13]);}
 roof(b,5.72,3.86,3.2,.95);
 for(const x of [-1.94,1.94]){b.beam('solid','#82552f',[x,3.12,1.39],[x,2.99,1.55],.04);lantern(b,x,2.58,1.55,.77);}
 b.box('solid','#b05949',[-1.81,2.09,1.44],[.52,1.12,.033]);cloud(b,[-1.81,2.11,1.465],.21);
}
function paver(b,inner,outer,a,z,y,color){const p=[];for(const yy of [y-.04,y])for(const r of [inner,outer])for(const t of [a,z])p.push(...radial(t,r,yy));b.surface('solid',color,p,[4,6,5,5,6,7,2,3,6,3,7,6,0,4,1,1,4,5]);}
export function createLowPolyStation(options={}){
 check(options);const {scale=1,quality='balanced',castShadow=true}=options,b=new Builder(quality),deckY=.65,n=quality==='light'?24:36;
 b.cylinder('solid','#aaa596',[0,.28,0],5.95,6.05,.56,[0,0,0],n);b.cylinder('solid','#c6bba3',[0,.57,0],5.98,5.98,.12,[0,0,0],n);
 for(let row=0;row<3;row++){const inner=row*1.8+.02,outer=(row+1)*1.8,num=quality==='light'?12+row*4:16+row*6;for(let i=0;i<num;i++){const a=(i+row*.5)/num*TAU+.004;paver(b,inner,outer,a,a+TAU/num-.008,deckY,['#bab3a2','#b0ad9f','#c5bca8'][(i+row)%3]);}}
 for(const [r,c,t] of [[5.62,'#b96f5b',.07],[5.88,'#dbc49b',.04]])b.ring('solid',c,[0,.65,0],r,t,n);
 b.cylinder('solid','#b66d5c',[0,deckY+.024,2.15],1.43,1.43,.022,[0,0,0],24);cloud(b,[0,deckY+.05,2.15],.97); // Rotated below to lie flush with paving.
 // Place the cloud flat; only the latest relief geometry is affected.
 const emblem=b.parts.solid.at(-1);emblem.translate(0,-(deckY+.05),-2.15);emblem.rotateX(-Math.PI/2);emblem.translate(0,deckY+.05,2.15);
 const fenceCount=quality==='light'?14:18;
 for(let i=0;i<=fenceCount;i++){const a=.31+i/fenceCount*(TAU-.62),p=radial(a,5.73,deckY);b.box('solid','#976b43',[p[0],deckY+.57,p[2]],[.21,1.2,.21],[0,a,0]);b.box('solid','#c39460',[p[0],deckY+1.19,p[2]],[.28,.12,.28],[0,a,0]);if(i<fenceCount){const next=.31+(i+1)/fenceCount*(TAU-.62);for(const y of [deckY+.35,deckY+.86])b.beam('solid','#ad8050',radial(a,5.73,y),radial(next,5.73,y),.13,.16);}}
 for(let i=0;i<3;i++){b.box('solid',i%2?'#c0b6a0':'#b3ad9f',[0,(3-i)*.105,5.69+i*.45],[2.75,(3-i)*.21,.75]);for(const x of [-1.65,1.65])b.box('solid','#b2aa97',[x,.2+(2-i)*.09,5.72+i*.48],[.48,.37+(2-i)*.18,.7]);}
 b.at([-2.15,deckY,-1.7],[0,0,0],()=>shelter(b));
 for(const [x,z] of [[.15,.95],[4.55,-.7]]){b.cylinder('solid','#8f633c',[x,deckY+.58,z],.23,.29,1.12,[0,0,0],8);b.cylinder('solid','#bb905b',[x,deckY+1.17,z],.31,.31,.16,[0,0,0],8);for(const y of [.84,.96])b.ring('solid','#e0bd80',[x,deckY+y,z],.26,.035,12);}
 b.tube('solid','#ddbb7c',[[.15,deckY+.95,1.2],[-.18,deckY+.4,1.37],[.15,deckY+.3,1.48],[.34,deckY+.82,1.2]],.052,6,3);
 for(const [x,z] of [[-1.8,4.95],[1.8,4.95]]){b.cylinder('solid','#906b42',[x,deckY+.8,z],.06,.09,1.6,[0,0,0],6);lantern(b,x,deckY+1.85,z,.86);}
 const bushes=quality==='light'?8:12;for(let i=0;i<bushes;i++){const a=.5+i/bushes*(TAU-1),p=radial(a,6.12,.22);b.ico('solid',i%2?'#89915c':'#a1a467',p,[.48,.35,.4]);if(i%3===0)b.ico('solid','#aaa995',[p[0]+.35,.15,p[2]+.25],[.36,.26,.3]);}
 const group=b.finish('lowpoly-boarding-station',castShadow);group.scale.setScalar(scale);for(const child of group.children)child.scale.set(1.6,1,1.6);
 const anchors={balloonDock:anchor(group,'balloon-dock',[2.35*1.6,.67,0]),entrance:anchor(group,'station-entrance',[0,0,7.2*1.6]),deck:anchor(group,'platform-height',[0,deckY,0]),waitingSeat:anchor(group,'waiting-seat',[-2.15*1.6,deckY+.72,-2.42*1.6]),mooringLeft:anchor(group,'station-mooring-left',[.15*1.6,deckY+.95,.95*1.6]),mooringRight:anchor(group,'station-mooring-right',[4.55*1.6,deckY+.95,-.7*1.6])};
 group.userData={assetId:'park/korean-balloon-station-lowpoly',version:'1.0.0',variantOf:'탑승장_1',quality,visualOnly:true,deckHeight:deckY,platformDiameter:19.456,signageIncluded:false,balloonIncluded:false,collision:'not-registered'};return handle(group,anchors);
}
export function createLowPolyWaitingShelter(options={}){check(options);const {scale=1,quality='balanced',castShadow=true}=options,b=new Builder(quality);shelter(b);const group=b.finish('lowpoly-waiting-shelter',castShadow);group.scale.setScalar(scale);for(const m of group.children)m.scale.set(1.6,1,1.6);group.userData={visualOnly:true,quality};return handle(group,{bench:anchor(group,'waiting-bench',[0,.72,-.72*1.6]),entrance:anchor(group,'shelter-entrance',[0,.25,1.42*1.6])});}
export function createLowPolyMooringRope(start,end,{quality='balanced'}={}){check({quality});for(const p of [start,end])if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new RangeError('endpoints must be finite XYZ arrays');if(start.every((n,i)=>Math.abs(n-end[i])<.001))throw new RangeError('endpoints must differ');const b=new Builder(quality),mid=start.map((n,i)=>(n+end[i])/2);mid[1]-=.45;b.tube('solid','#d7b477',[start,mid,end],.047,quality==='light'?4:6,3);return handle(b.finish('lowpoly-mooring-rope',false),{});}
