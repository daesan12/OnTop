import {BufferGeometry,CatmullRomCurve3,CylinderGeometry,Matrix4,SphereGeometry,TubeGeometry,Vector3} from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {type PropBuilder,type XYZ} from '../../../../../../../../../src/world/art/propGeometry.ts'

export function roundFood(b:PropBuilder,color:string,p:XYZ,s:XYZ,segments=20){
 const sphere=new SphereGeometry(1,segments,Math.round(segments*.7)),g=new BufferGeometry().copy(sphere);sphere.dispose();b.add('paint',g,color,p,s)
}
export function softBox(b:PropBuilder,color:string,p:XYZ,s:XYZ,r=.14,segments=4){
 const source=new RoundedBoxGeometry(...s,segments,r),g=new BufferGeometry().copy(source);source.dispose();b.add('paint',g,color,p)
}
export function tube(b:PropBuilder,color:string,points:XYZ[],r:number,compact=false){
 b.add('paint',new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),compact?16:24,r,compact?8:10,false),color)
}
/** Six readable, rounded ingredients. No game rules or provider assets are imported. */
export function addSkewerDisplay(b:PropBuilder,origin:XYZ,scale=1,angle=0,cute=false,tilt=0,subset?:readonly number[],compact=false){
 const before=Object.fromEntries(Object.entries(b.parts).map(([key,parts])=>[key,parts.length]))
 const at=(x:number,y:number,z:number):XYZ=>[origin[0]+x*scale,origin[1]+y*scale,origin[2]+z*scale]
 const ball=(color:string,p:XYZ,s:XYZ)=>roundFood(b,color,at(...p),s.map(v=>v*scale) as XYZ,cute&&!compact?32:20)
 const box=(color:string,p:XYZ,s:XYZ,r=.14)=>softBox(b,color,at(...p),s.map(v=>v*scale) as XYZ,r*scale,compact?3:4)
 const line=(color:string,points:XYZ[],r:number)=>tube(b,color,points.map(p=>at(...p)),r*scale,compact)
 b.add('wood',new CylinderGeometry(.095,.095,subset?4.8:10.7,24),'#d59a4e',origin,[scale,scale,scale],[0,0,Math.PI/2])
 let ingredient=0,partStarts=Object.fromEntries(Object.entries(b.parts).map(([key,parts])=>[key,parts.length]))
 const finishIngredient=()=>{
  if(subset){const slot=subset.indexOf(ingredient),centers=[-3.98,-2.4,-.9,.65,2.17,3.7];for(const [kind,parts]of Object.entries(b.parts)){const start=partStarts[kind]!;if(slot<0){for(const g of parts.splice(start))g.dispose()}else for(const g of parts.slice(start))g.translate(((slot-1)*1.5-centers[ingredient]!)*scale,0,0)}}
  ingredient++;partStarts=Object.fromEntries(Object.entries(b.parts).map(([key,parts])=>[key,parts.length]))
 }
 // Curled shrimp with overlapping segments and a split tail.
 if(cute){
  const curve=new CatmullRomCurve3(Array.from({length:25},(_,i)=>{const a=.12+i*Math.PI*1.58/24;return new Vector3(...at(-3.98+Math.cos(a)*.48,Math.sin(a)*.48,.02))}))
  const lengthSegments=compact?40:64,ringSegments=compact?12:16
  const g=new TubeGeometry(curve,lengthSegments,.275*scale,ringSegments,false),p=g.getAttribute('position')
  for(let i=0;i<=lengthSegments;i++){const t=i/lengthSegments,center=curve.getPointAt(t),taper=.72+.3*Math.sin(Math.PI*t);for(let j=0;j<=ringSegments;j++){const k=i*(ringSegments+1)+j;p.setXYZ(k,center.x+(p.getX(k)-center.x)*taper,center.y+(p.getY(k)-center.y)*taper,center.z+(p.getZ(k)-center.z)*taper)}}
  g.computeVertexNormals();b.add('paint',g,'#ffac70')
  for(let i=1;i<8;i++){const a=.12+i*Math.PI*1.58/8,radius=.275*(.72+.3*Math.sin(Math.PI*i/8));line('#ffd2a0',[-.16,0,.16].map(r=>[-3.98+Math.cos(a)*(.48+r),Math.sin(a)*(.48+r),.026+Math.sqrt(Math.max(0,radius*radius-r*r))] as XYZ),.017)}
 }else for(let i=0;i<10;i++){
  const a=.1+i*Math.PI*1.58/9
  ball(i%2?(cute?'#ffc395':'#ffb780'):(cute?'#ffab70':'#f88f4c'),[(cute?-3.98:-3.9)+Math.cos(a)*(cute?.47:.53),Math.sin(a)*(cute?.47:.53),.02],cute?[.3,.29,.36]:[.26,.27,.32])
 }
 ball('#ef7d40',[cute?-3.22:-3.12,.14,.02],cute?[.22,.12,.3]:[.3,.12,.3]);ball('#ffa66b',[cute?-3.34:-3.25,cute?.36:.39,.02],cute?[.13,.24,.29]:[.14,.3,.29])
 finishIngredient()
 // Steak and embossed grill marks.
 box(cute?'#ac6050':'#8a4539',[-2.4,0,0],cute?[1.18,1.1,.86]:[1.15,1.15,.76],cute?.34:.24)
 const grill=cute?.44:.391
 if(cute){
  const surface=(x:number,y:number)=>.09+Math.sqrt(Math.max(0,.34**2-Math.max(0,Math.abs(x)-.25)**2-Math.max(0,Math.abs(y)-.21)**2))+.006
  for(const y of [-.26,0,.26])line('#754636',Array.from({length:9},(_,i)=>{const dx=-.43+i*.86/8,dy=y+dx*.18;return [-2.4+dx,dy,surface(dx,dy)]}),.019)
  for(const x of [-.26,0,.26])line('#754636',Array.from({length:9},(_,i)=>{const dy=-.4+i*.8/8,dx=x+dy*.15;return [-2.4+dx,dy,surface(dx,dy)]}),.018)
 }else{
  for(const y of [-.3,0,.3])line('#5e302c',[[-2.85,y-.12,grill],[-2.4,y,grill+.012],[-1.96,y+.12,grill]],.028)
  for(const x of [-2.68,-2.4,-2.12])line('#5e302c',[[x-.09,-.43,grill-.001],[x,0,grill+.013],[x+.09,.43,grill-.001]],.025)
 }
 finishIngredient()
 // Bell pepper lobes and a curved green stem.
 for(const x of [-.2,.2])for(const z of [-.16,.16])ball(x*z>0?(cute?'#659c32':'#4f862d'):(cute?'#81b344':'#6d9e35'),[-.9+x,-.03,z],cute?[.38,.62,.37]:[.34,.6,.35])
 line('#466a25',[[-.9,.45,0],[-.9,.77,0],[-.72,.87,0]],.09)
 finishIngredient()
 // Tomato, small leaves and stalk.
 ball(cute?'#ed5e49':'#e34e39',[.65,0,0],cute?[.67,.65,.65]:[.63,.6,.6])
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ball('#557b2a',[.65+Math.cos(a)*.18,.54,Math.sin(a)*.18],[.2,.055,.12])}
 line('#4b722a',[[.65,.52,0],[.69,.83,.02]],.06)
 finishIngredient()
 // Cheese with recessed-looking pores on its front face.
 box(cute?'#ffcf51':'#f4c341',[2.17,0,0],cute?[1.22,1.25,.94]:[1.19,1.24,.83],cute?.27:.15)
 for(const [dx,dy,r]of [[-.3,.27,.14],[.23,.36,.09],[.18,-.21,.16],[-.32,-.28,.075]])ball(cute?'#d49b2d':'#c88e2c',[2.17+dx!,dy!,cute?.476:.42],[r!,r!,cute?.018:.025])
 finishIngredient()
 // Bacon cube with broad, gently wavering fat ribbons.
 if(cute){
  for(const [i,x]of [3.32,3.7,4.08].entries()){
   const shift=i%2?.035:0;box(i%2?'#ed9c8e':'#e88780',[x,shift,0],[.43,1.22,.9],.14)
   line('#ffe5c5',[[x,-.49+shift,.405],[x-.035,-.2+shift,.462],[x+.025,.15+shift,.462],[x,.5+shift,.405]],.06)
  }
 }else{
  box('#d9716c',[3.7,0,0],[1.15,1.24,.83],.13)
  for(const x of [3.4,3.72,4.0])line('#ffe2bc',[[x,-.5,.43],[x-.05,-.2,.46],[x+.04,.12,.46],[x,.51,.43]],.07)
 }
 finishIngredient()
 if(tilt||angle){const matrix=new Matrix4().makeTranslation(...origin).multiply(new Matrix4().makeRotationX(tilt)).multiply(new Matrix4().makeRotationZ(angle)).multiply(new Matrix4().makeTranslation(-origin[0],-origin[1],-origin[2]));for(const [kind,parts]of Object.entries(b.parts))for(const g of parts.slice(before[kind]))g.applyMatrix4(matrix)}
}
