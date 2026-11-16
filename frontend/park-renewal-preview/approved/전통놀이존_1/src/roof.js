import{THREE}from'./helpers.js';import{P,flower,top}from'./details.js';
const main=(face,u,t,l=0)=>{const r=5.70+(8.30-5.70)*t,y=6.55-2.08*t**.72+.33*t**5+.18*Math.abs(u)**6*t+l;return face<2?[u*r,y,(face===0?1:-1)*t*3.95]:[(face===2?1:-1)*r,y,u*t*3.95];};
const porch=(side,u,t,l=0)=>{const f=(u+1)/2;return[side*(.025+3.25*t),7.13+.20*f-2.75*t**.72+.35*t**5+.10*f*t+l,-.6+5.18*f];};
function patch(b,fn,u0,u1,t0,t1,c,raised=false,bottom=false){const nu=raised?(b.quality==='light'?3:4):(b.quality==='light'?8:12),nt=raised?(b.quality==='light'?2:3):(b.quality==='light'?6:9),p=[],idx=[];for(let j=0;j<=nt;j++)for(let i=0;i<=nu;i++){const lift=bottom?-.14:raised?.03+Math.sin(i/nu*Math.PI)*.085:0;p.push(...fn(u0+(u1-u0)*i/nu,t0+(t1-t0)*j/nt,lift));if(i<nu&&j<nt){const k=j*(nu+1)+i;idx.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);}}b.surface('roof',c,p,idx);}
function edge(b,fn){for(let i=0;i<16;i++){const a=fn(i/8-1,1,0),z=fn((i+1)/8-1,1,0),c=fn(i/8-1,1,-.14),d=fn((i+1)/8-1,1,-.14);b.surface('roof','#565464',[...a,...z,...c,...d],[0,1,2,1,3,2]);}}
function tiles(b,fn,columns){const rows=b.quality==='light'?2:3;patch(b,fn,-1,1,0,1,P.tile);patch(b,fn,-1,1,0,1,'#795637',false,true);for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){patch(b,fn,-1+col/columns*2,-1+(col+1)/columns*2,Math.max(.025,row/rows),Math.min(1,(row+1)/rows+.04),['#596078','#61677e','#515b73'][(col+row)%3],true);if(row===rows-1){const p=fn((col+.5)/columns*2-1,1,.04);b.add('roof',new THREE.SphereGeometry(1,8,3),col%3?'#78727b':'#d0b598',p,[.13,.085,.10]);}}edge(b,fn);const e=Array.from({length:19},(_,i)=>fn(i/9-1,1,-.14));b.tube('#926035',e,.13,22,6);}
export function buildRoof(b){
 for(let face=0;face<4;face++)tiles(b,(u,t,l)=>main(face,u,t,l),face<2?(b.quality==='light'?28:38):(b.quality==='light'?10:15));
 for(const sx of[-1,1])for(const sz of[-1,1]){const pts=Array.from({length:19},(_,i)=>main(sz>0?0:1,sx,i/18,.10));b.tube('#434f66',pts,.13,22,7,'roof');b.add('roof',new THREE.SphereGeometry(1,8,4),'#d1b69e',pts.at(-1),[.18,.17,.18]);}
 const ridge=Array.from({length:21},(_,i)=>{const x=(i/20-.5)*11.75;return[x,6.68+.10*(Math.abs(x)/5.875)**5,0];});b.tube('#434f66',ridge,.15,26,8,'roof');for(const sx of[-1,1])b.add('roof',new THREE.SphereGeometry(1,8,4),'#d7bca3',[sx*5.875,6.78,0],[.20,.22,.20]);
 for(const sx of[-1,1]){const fn=(u,t,l)=>porch(sx,u,t,l);tiles(b,fn,b.quality==='light'?16:22);const pts=Array.from({length:23},(_,i)=>fn(1,i/22,.10));b.tube('#48576e',pts,.15,26,7,'roof');for(let i=1;i<=12;i++){const p=fn(1,i/12,.11);b.cyl(i%4?'#777384':'#cdb096',[p[0],p[1],p[2]+.055],.14,.14,.08,10,[Math.PI/2,0,0],'roof');}const end=pts.at(-1);b.cyl('#d7b99a',[end[0],end[1],end[2]+.08],.24,.24,.16,8,[Math.PI/2,0,0],'roof');flower(b,[end[0],end[1],end[2]+.165],.18,'#ad8161');}
 // Closed rear apron joins the raised porch to the lower main roof.
 const z=-.60,tm=.6/3.95,base=6.55-2.08*tm**.72+.33*tm**5-.12;
 b.add('roof',new THREE.BoxGeometry(.07,7.03-base,.14),'#535a6c',[0,(7.03+base)/2,z]);
 for(const sx of[-1,1])for(let i=0;i<22;i++){const a=porch(sx,-1,i/22,-.10),c=porch(sx,-1,(i+1)/22,-.10);a[1]=Math.max(base,a[1]);c[1]=Math.max(base,c[1]);const p=[a[0],a[1],z-.07,c[0],c[1],z-.07,a[0],base,z-.07,c[0],base,z-.07,a[0],a[1],z+.07,c[0],c[1],z+.07,a[0],base,z+.07,c[0],base,z+.07];b.surface('roof','#535a6c',p,[0,1,2,1,3,2,4,6,5,5,6,7,0,4,1,1,4,5,2,3,6,3,7,6,0,2,4,2,6,4,1,5,3,3,5,7]);}
 const pr=Array.from({length:17},(_,i)=>[0,7.22+.20*i/16,-.63+5.30*i/16]);b.tube('#45536a',pr,.16,22,8,'roof');b.cyl('#d8bea3',[0,7.49,4.67],.31,.31,.18,8,[Math.PI/2,0,0],'roof');flower(b,[0,7.49,4.77],.24,'#af8160');
 const pediment=[[-3.275,4.74],...Array.from({length:23},(_,i)=>{const p=porch(-1,1,1-i/22,-.20);return[p[0],p[1]];}),...Array.from({length:23},(_,i)=>{const p=porch(1,1,i/22,-.20);return[p[0],p[1]];}),[3.275,4.74]];
 b.poly('#9d653c',pediment,.22,[0,0,4.25]);for(const sx of[-1,1]){const p=Array.from({length:17},(_,i)=>porch(sx,1,i/16,-.17));b.tube('#bd864b',p,.14,20,6);}
 // Decorative spinning-top emblem above the carved wooden sign.
 top(b,[0,5.90,4.76],1.4,P.orange);
}
