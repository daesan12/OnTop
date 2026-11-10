import {THREE,Builder,TAU,radial,check,handle,anchor,pagoda,cloud,lantern} from './core.js';
export const LOW_POLY_BALLOON_CABIN=Object.freeze({capacity:4,innerRadius:1.7,floorY:.37,railTopY:1.575,passengerRadius:.38,passengerHeight:1.75,slotOffset:.65});
// Same envelope profile and cabin dimensions as 열기구_1, sampled into broad facets.
const profile=[[.72,4.05],[1.05,4.25],[1.55,4.65],[2.1,5.15],[2.5,5.9],[2.64,6.65],[2.55,7.35],[2.2,8],[1.6,8.55],[.8,8.82],[.32,8.88]];
const sy=y=>5.5+(y-4.05)*1.45;
function radiusAt(y){for(let i=1;i<profile.length;i++)if(profile[i][1]>=y){const a=profile[i-1],z=profile[i];return a[0]+(z[0]-a[0])*(y-a[1])/(z[1]-a[1]);}return .32;}
export function createLowPolyBalloon(options={}){
 check(options);const {scale=1,quality='balanced',red='#bb5145',cream='#f2dfb7',castShadow=true}=options;
 const b=new Builder(quality),across=quality==='light'?1:2,points=quality==='light'?profile.filter((_,i)=>i%2===0||i===5):profile;
 for(let gore=0;gore<12;gore++){const p=[],idx=[];for(let j=0;j<points.length;j++)for(let i=0;i<=across;i++){const [r,y]=points[j],a=(gore+i/across-.5)/12*TAU;p.push(Math.sin(a)*r*1.75,sy(y),Math.cos(a)*r*1.75);if(j<points.length-1&&i<across){const k=j*(across+1)+i;idx.push(k,k+1,k+across+1,k+1,k+across+2,k+across+1);}}b.surface('solid',gore%2?red:cream,p,idx);}
 b.cylinder('solid','#be8647',[0,sy(8.88)+.04,0],.55,.7,.15,[0,0,0],12);
 b.cylinder('solid','#825333',[0,sy(4.05)-.09,0],1.31,1.2,.22,[0,0,0],12);
 const project=(x,y,z)=>{const yy=6.72+y,rr=radiusAt(yy)*1.75;return[x*1.75,sy(yy),Math.sqrt(Math.max(.1,rr*rr-(x*1.75)**2))+.065+z];};
 pagoda(b,[0,0,0],.86,project);
 for(const angle of [-TAU/12,TAU/12,Math.PI])cloud(b,[0,0,0],.52,(x,y,z)=>{const yy=6.55+y,rr=radiusAt(yy)*1.75+.08+z,theta=angle+x*1.75/rr;return[Math.sin(theta)*rr,sy(yy),Math.cos(theta)*rr];});
 for(let i=0;i<12;i++){const start=(i-.5)/12*TAU,pts=Array.from({length:5},(_,j)=>{const t=j/4,y=5.34-Math.sin(t*Math.PI)*.16;return radial(start+t/12*TAU,radiusAt(y)*1.75+.09,sy(y));});b.tube('solid','#d7b477',pts,.085,4,3);b.ico('solid','#c48b43',pts[0],[.15,.2,.15]);}
 for(const a of [-.78,.78,2.36,3.92]){const p=radial(a,3.15,sy(4.67));lantern(b,...p,1.15);b.beam('solid','#9c743f',[p[0],sy(5.1),p[2]],[p[0],p[1]+.57,p[2]],.05);const t=radial(a+.15,3.53,sy(4.28));b.cylinder('solid',red,t,.1,.2,.62,[0,0,0],5);}
 // Open basket: floor and an annular wall, no lid. 3.4 m usable inside diameter.
 const n=quality==='light'?12:20;
 b.cylinder('solid','#744c2d',[0,.18,0],1.9,1.82,.26,[0,0,0],n);
 b.cylinder('solid','#bd8b51',[0,.33,0],1.77,1.77,.08,[0,0,0],n);
 const innerRadius=1.7/Math.cos(Math.PI/n);
 for(let i=0;i<n;i++){const a=i/n*TAU,z=(i+1)/n*TAU,p=[];for(const y of [.37,1.28])for(const rr of [innerRadius,1.9])for(const t of [a,z])p.push(...radial(t,rr,y));b.surface('solid',i%3?'#ad7842':'#bc8a4f',p,[2,3,6,3,7,6,0,4,1,1,4,5,4,6,5,5,6,7,0,1,2,1,3,2]);}
 for(const y of [.36,.73,1.08,1.48])b.ring('solid',y===1.48?'#83532e':'#d09a58',[0,y,0],1.85,y===1.48?.095:.04,n);
 for(const a of [Math.PI/4,Math.PI*3/4,Math.PI*5/4,Math.PI*7/4]){const foot=radial(a,1.84,1.27),top=radial(a,1.35,5.46);b.beam('solid','#d8b981',foot,top,.12);b.cylinder('solid','#805330',radial(a,1.84,1.35),.11,.11,.5,[0,0,0],6);}
 b.box('solid','#d29e60',[0,.83,1.94],[1.6,.72,.1]);pagoda(b,[0,.74,2.005],.29);
 const group=b.finish('lowpoly-balloon',castShadow);group.scale.setScalar(scale);
 const anchors={basketFloor:anchor(group,'basket-floor',[0,.38,0]),boarding:anchor(group,'boarding-point',[0,.38,2.15]),mooringLeft:anchor(group,'mooring-left',[-1.3,1.45,1.3]),mooringRight:anchor(group,'mooring-right',[1.3,1.45,1.3]),crown:anchor(group,'envelope-top',[0,12.7,0])};
 for(const [i,p] of [[-.65,.38,.65],[.65,.38,.65],[-.65,.38,-.65],[.65,.38,-.65]].entries())anchors[`passenger${i+1}`]=anchor(group,`passenger-slot-${i+1}`,p);
 group.userData={assetId:'park/korean-balloon-lowpoly',version:'1.0.0',variantOf:'열기구_1',quality,cabin:{...LOW_POLY_BALLOON_CABIN},visualOnly:true,collision:'not-registered',motion:false};return handle(group,anchors);
}
