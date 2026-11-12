// Local underground layout. Intentionally absent from public facility/navigation data.
export type HorrorPoint=readonly[number,number]
export type HorrorVec=readonly[number,number,number]
export const HORROR={x0:-58,x1:26,z0:-105,z1:-48,floor:6.8,ceiling:17.2,height:10.4,wall:.9} as const
export const HORROR_PORTALS=[
 {id:'entry',x:26,z:-82,floor:6.8,width:2.4,height:3.2,outward:1},
 {id:'exit',x:-58,z:-88,floor:11.85619014267509,width:2.4,height:3.2,outward:-1},
] as const
export const HIDDEN_EXIT_TRAIL:readonly (readonly[number,number,number])[]=[[-61.6,-88,11.85619014267509],[-66,-85,12.6],[-72,-78,15],[-80,-68,16.2]]
export function hiddenExitGrade(x:number,z:number){let best=Infinity,height=0;for(let i=1;i<HIDDEN_EXIT_TRAIL.length;i++){const a=HIDDEN_EXIT_TRAIL[i-1]!,b=HIDDEN_EXIT_TRAIL[i]!,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(d<best){best=d;height=a[2]+(b[2]-a[2])*t}}const t=Math.max(0,Math.min(1,(best-1.5)/3));return {height,weight:1-t*t*(3-2*t),distance:best}}
export const HORROR_ENTRY: HorrorPoint=[24.7,-82]
export const HORROR_OUTLINE:readonly HorrorPoint[]=[[-58,-94],[-26,-94],[-26,-105],[26,-105],[26,-48],[-58,-48]]
export const horrorState={open:false,inside:false,arrive:false,inspect:0}
// Developer-only inspection positions, never listed by the ordinary park UI.
export const HORROR_INSPECTION=[
 {point:HORROR_ENTRY,look:[19,-82]as HorrorPoint},
 {point:[16,-80]as HorrorPoint,look:[-6,-80]as HorrorPoint},
 {point:[-12,-76]as HorrorPoint,look:[-25,-76]as HorrorPoint},
 {point:[-46.7,-79]as HorrorPoint,look:[-36,-72]as HorrorPoint},
 {point:[-52,-73]as HorrorPoint,look:[-52,-88]as HorrorPoint},
 {point:[-60.2,-88]as HorrorPoint,look:[-56,-88]as HorrorPoint},
 {point:[28,-82]as HorrorPoint,look:[23,-82]as HorrorPoint},
]
const listeners=new Set<()=>void>()
const emit=()=>{for(const f of listeners)f()}
export function subscribeHorror(f:()=>void){listeners.add(f);return()=>{listeners.delete(f)}}
export function setHorrorOpen(open:boolean){if(horrorState.open===open)return;horrorState.open=open;if(!open)horrorState.inside=false;emit()}
export function inHorror(x:number,z:number,margin=0){return x>HORROR.x0+margin&&x<HORROR.x1-margin&&z>HORROR.z0+margin&&z<HORROR.z1-margin&&(x> -26+margin||z> -94+margin)}
export function horrorPortalAt(x:number,z:number,distance=3.5){return HORROR_PORTALS.find(p=>Math.hypot(x-p.x,z-p.z)<distance)}
export function horrorApron(x:number,z:number){return HORROR_PORTALS.some(p=>{const d=(x-p.x)*p.outward;return d>=-.6&&d<=3.6&&Math.abs(z-p.z)<p.width/2+.2})}
export function horrorApronHeight(x:number,z:number){return HORROR_PORTALS.find(p=>{const d=(x-p.x)*p.outward;return d>=0&&d<=3.6&&Math.abs(z-p.z)<p.width/2+.2})?.floor??null}
const exit=HORROR_PORTALS[1]
export function horrorGround(x:number,z:number){
 if(x< -49&&z< -84.3)return exit.floor
 if(x>=-54.7&&x<=-49.3&&z<=-55&&z>=-84.5)return HORROR.floor+(exit.floor-HORROR.floor)*Math.max(0,Math.min(1,(-z-55)/25))
 return HORROR.floor
}
export function horrorFloorAt(x:number,z:number){const apron=horrorApronHeight(x,z);return apron??(horrorState.open&&inHorror(x,z)?horrorGround(x,z):null)}
export type HorrorSolid={id:string;x0:number;x1:number;z0:number;z1:number;height:number}
const box=(id:string,x:number,z:number,w:number,d:number,height:number):HorrorSolid=>({id,x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,height})
export const HORROR_PILLARS=[-15,-6,3,12].flatMap(x=>[-98,-89,-67,-57].map(z=>box(`pillar-${x}-${z}`,x,z,2.8,2.8,10.4)))
export const HORROR_SOLIDS:HorrorSolid[]=[
 ...HORROR_PILLARS,
 box('entry-light-baffle',22.2,-82.6,.8,5.2,10.4),
 box('entry-north-return',23,-76.8,6,.65,10.4),
 box('entry-south-return',23,-88,6,.65,10.4),
 box('machinery-core',-38,-71,12,10,4.5),
 box('lift-cage',-37,-85,6,5,7.8),
 box('ramp-east-wall',-49.1,-72,.7,26,10.4),
 box('ramp-west-wall',-54.9,-72,.7,26,10.4),
 box('upper-landing-east-wall',-49.1,-89.5,.7,9,10.4),
 box('upper-landing-south-return',-56.8,-84.7,2.4,.6,10.4),
 box('exit-light-baffle',-54.5,-88,.7,3,10.4),
]
export const HORROR_CRYPT={x:-25,z:-76,rx:6.8,rz:8.4,height:2.2} as const
function portalClear(x:number,z:number,r:number){return HORROR_PORTALS.some(p=>{const d=(x-p.x)*p.outward;return d>=-1.2&&d<=3.6&&Math.abs(z-p.z)<p.width/2-r})}
export function horrorWalkable(x:number,z:number,r=.36){
 if(!inHorror(x,z,r)&&!portalClear(x,z,r))return false
 if(HORROR_SOLIDS.some(s=>x>s.x0-r&&x<s.x1+r&&z>s.z0-r&&z<s.z1+r))return false
 return ((x-HORROR_CRYPT.x)/(HORROR_CRYPT.rx+r))**2+((z-HORROR_CRYPT.z)/(HORROR_CRYPT.rz+r))**2>1
}
/** Sweep at 15cm intervals; a large frame cannot tunnel through a column or a wall. */
export function horrorMotion(from:HorrorPoint,to:HorrorPoint,y:number){
 if(y>HORROR.ceiling+.5||y<HORROR.floor-1)return true
 if(Math.max(from[0],to[0])< -62||Math.min(from[0],to[0])>30||Math.max(from[1],to[1])< -106||Math.min(from[1],to[1])> -47)return true
 const n=Math.max(1,Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/.15))
 const started=inHorror(...from)
 for(let i=1;i<=n;i++){const x=from[0]+(to[0]-from[0])*i/n,z=from[1]+(to[1]-from[1])*i/n,touched=inHorror(x,z,-.36);if(!horrorState.open&&touched)return false;if(horrorState.open&&(started||touched)&&!horrorWalkable(x,z))return false}
 return true
}
export function updateHorrorPresence(x:number,z:number,y:number){const inside=horrorState.open&&inHorror(x,z)&&Math.abs(y-horrorGround(x,z))<.65;if(inside!==horrorState.inside){horrorState.inside=inside;emit()}return inside}
/** The actor's actual location, never door state, controls interior visibility. */
export const horrorInteriorVisible=(x:number,y:number,z:number,walking:boolean)=>walking&&horrorState.open&&inHorror(x,z)&&Math.abs(y-horrorGround(x,z))<.65
/** Live avatars report the capsule origin, .8m above the floor. */
export function secretCorridorContains(p: { x: number; y: number; z: number }) {
 return horrorState.open && inHorror(p.x,p.z) && p.y >= horrorGround(p.x,p.z)-.35 && p.y < HORROR.ceiling
}
export function safeHorrorCamera(eye:HorrorVec,desired:HorrorVec,inside:boolean):HorrorVec{
 const safe=(p:HorrorVec)=>inside?inHorror(p[0],p[2],.12)&&horrorWalkable(p[0],p[2],.23)&&p[1]>horrorGround(p[0],p[2])+.3&&p[1]<HORROR.ceiling-.35:!(inHorror(p[0],p[2],-.65)&&p[1]>HORROR.floor-.3&&p[1]<HORROR.ceiling+.3)
 const length=Math.hypot(...desired.map((v,i)=>v-eye[i]!)),n=Math.max(1,Math.ceil(length/.12));let last:HorrorVec=eye
 for(let i=1;i<=n;i++){const p:HorrorVec=[eye[0]+(desired[0]-eye[0])*i/n,eye[1]+(desired[1]-eye[1])*i/n,eye[2]+(desired[2]-eye[2])*i/n];if(!safe(p))return last;last=p}return last
}
// Broad, reversible loops around columns / crypt / machinery, then the dogleg exit stair-ramp.
export const HORROR_ESCAPE_ROUTE:readonly HorrorPoint[]=[HORROR_ENTRY,[24.7,-78.4],[19,-78.4],[16,-78.4],[16,-54.5],[-2,-54.5],[-2,-76],[-11,-78],[-11,-93],[-23,-93],[-32,-90],[-46.7,-90],[-46.7,-55],[-52,-55],[-52,-91],[-56.4,-91],[-56.4,-88],[-60,-88]]
export const HORROR_LOOPS:readonly (readonly HorrorPoint[])[]=[
 [[16,-78.4],[16,-54.5],[-2,-54.5],[-2,-80],[16,-80],[16,-78.4]],
 [[-12,-76],[-12,-62],[-25,-62],[-35,-59],[-46.5,-59],[-46.5,-90],[-30,-91],[-12,-93],[-12,-76]],
]
