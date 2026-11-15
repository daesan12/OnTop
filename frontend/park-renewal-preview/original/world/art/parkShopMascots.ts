import {BufferGeometry,CatmullRomCurve3,ExtrudeGeometry,Shape,SphereGeometry,TubeGeometry,Vector3} from 'three'
import {type PropBuilder,type PropFinish,type XYZ} from '../../../../src/world/art/propGeometry.ts'

/** Preserve a modest round silhouette for these hero signs in the simplified park renderer. */
export function roundShopVolume(b:PropBuilder,finish:PropFinish,color:string,p:XYZ,s:XYZ){
 const sphere=new SphereGeometry(1,16,10),geometry=new BufferGeometry().copy(sphere)
 sphere.dispose();b.add(finish,geometry,color,p,s)
}
function shopLine(b:PropBuilder,points:XYZ[],radius:number){
 b.add('paint',new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),12,radius,5,false),'#a56a30')
}

/** Static, bevelled pastry sign, with its tail in the same closed outline as the body. */
export function addFishBreadMascot(b:PropBuilder,origin:XYZ,scale=1){
 const at=(x:number,y:number,z:number):XYZ=>[origin[0]+x*scale,origin[1]+y*scale,origin[2]+z*scale]
 const fish=new Shape()
 fish.moveTo(-2.6,0);fish.bezierCurveTo(-2.65,.95,-1.5,1.4,-.55,1.23)
 fish.quadraticCurveTo(.5,1.12,1.15,.62);fish.lineTo(2.6,1.16);fish.lineTo(2.18,0);fish.lineTo(2.6,-1.16);fish.lineTo(1.15,-.62)
 fish.bezierCurveTo(-.2,-1.6,-2.6,-1.3,-2.6,0);fish.closePath()
 const geometry=new ExtrudeGeometry(fish,{depth:.62,bevelEnabled:true,bevelThickness:.12,bevelSize:.1,bevelSegments:2,steps:1,curveSegments:16})
 b.add('paint',geometry,'#dda153',at(0,0,0),[scale,scale,scale])
 // Dark baked edges, embossed gill and curved scale rows remain visible without a texture.
 const line=(points:XYZ[],radius=.035)=>shopLine(b,points.map(p=>at(...p)),radius*scale)
 roundShopVolume(b,'metal','#553b27',at(-1.8,.36,.79),[.14*scale,.14*scale,.055*scale])
 roundShopVolume(b,'paint','#fff0cb',at(-1.84,.41,.845),[.045*scale,.045*scale,.025*scale])
 line([[-2.57,-.09,.74],[-2.3,-.15,.78],[-2.16,-.1,.77]],.045)
 line([[-1.22,.85,.75],[-.93,.1,.8],[-1.24,-.79,.75]],.05)
 for(const x of [-.55,.05,.65])for(const y of [-.5,.08,.62]){
  if(x>.5&&y>.5)continue
  line([[x-.18,y-.17,.76],[x+.04,y,.8],[x-.18,y+.17,.76]],.032)
 }
 for(const y of [-.5,0,.5])line([[1.48,y*.5,.74],[2.23,y,.74]],.035)
 const fin=new Shape();fin.moveTo(-.45,-.3);fin.quadraticCurveTo(.2,-.4,.56,-.97);fin.quadraticCurveTo(-.15,-1.05,-.45,-.3)
 b.add('paint',new ExtrudeGeometry(fin,{depth:.07,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:8}),'#c1873e',at(0,0,.78),[scale,scale,scale])
 // Two supports penetrate the roof and the pastry rather than meeting at an exposed gap.
 for(const x of [-1,1])b.box('wood','#765539',at(x,-1.2,.25),[.16*scale,.95*scale,.2*scale])
}

/** A complete mole peeks out of the earthen roof; adjoining volumes overlap slightly. */
export function addMoleMascot(b:PropBuilder,origin:XYZ){
 const at=(x:number,y:number,z:number):XYZ=>[origin[0]+x,origin[1]+y,origin[2]+z]
 roundShopVolume(b,'paint','#846447',at(0,0,0),[1.9,1.65,1.45])
 roundShopVolume(b,'paint','#a17b54',at(0,.65,.24),[1.65,1.35,1.35])
 for(const side of [-1,1]){
  roundShopVolume(b,'paint','#805c42',at(side*1.34,1.55,.15),[.45,.5,.33])
  roundShopVolume(b,'paint','#d7aa89',at(side*1.35,1.56,.43),[.25,.29,.1])
  roundShopVolume(b,'metal','#302c24',at(side*.57,.95,1.43),[.18,.23,.12])
  roundShopVolume(b,'paint','#fff3d5',at(side*.61,1.03,1.53),[.055,.07,.035])
  roundShopVolume(b,'paint','#c49271',at(side*.73,.22,1.45),[.45,.26,.17])
  roundShopVolume(b,'paint','#bd946e',at(side*1.62,-.8,.96),[.6,.4,.6])
  for(const dx of [-.18,0,.18])roundShopVolume(b,'paint','#eddfbd',at(side*1.62+dx,-.89,1.48),[.065,.13,.2])
 }
 roundShopVolume(b,'paint','#d9b18a',at(0,.37,1.51),[.65,.43,.34])
 roundShopVolume(b,'paint','#bd806a',at(0,.58,1.83),[.37,.25,.24])
 shopLine(b,[at(-.23,.08,1.8),at(0,-.04,1.88),at(.23,.08,1.8)],.035)
 for(const side of [-1,1])b.box('paint','#f7ead0',at(side*.13,.04,1.86),[.22,.26,.1])
}
