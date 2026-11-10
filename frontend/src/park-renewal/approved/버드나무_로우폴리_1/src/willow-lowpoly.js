import * as THREE from 'three';

export const LOW_POLY_WILLOW_PRESETS=Object.freeze({
  balanced:Object.freeze({arms:8,curtains:3,sides:5,crown:9}),
  light:Object.freeze({arms:6,curtains:2,sides:4,crown:7}),
});

function randomSource(seed){let state=seed>>>0;return()=>{state+=0x6d2b79f5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

/** Static low-poly willow: two independently owned, opaque, flat-shaded meshes. */
export function createLowPolyWillow(options={}) {
  const {seed=42,height=7.8,spread=8.6,quality='balanced',leafColor='#71884a',barkColor='#6e5740',castShadow=true}=options;
  for(const [name,value]of Object.entries({height,spread}))if(!Number.isFinite(value)||value<=0)throw new RangeError(`${name} must be positive and finite`);
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('seed must be uint32');
  if(!Object.hasOwn(LOW_POLY_WILLOW_PRESETS,quality))throw new RangeError('quality must be balanced or light');
  const p=LOW_POLY_WILLOW_PRESETS[quality],rand=randomSource(seed),range=(a,b)=>a+(b-a)*rand();
  const vec=a=>new THREE.Vector3(...a),radial=(a,r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
  const parts={wood:[],leaves:[]};
  function add(kind,geometry,color){
    const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();
    const pos=g.attributes.position;
    if(kind==='wood')for(let i=0;i<pos.count;i++)pos.setY(i,Math.max(0,pos.getY(i)));
    g.computeVertexNormals();const colors=new Float32Array(pos.count*3),base=new THREE.Color(color);
    for(let i=0;i<pos.count;i+=3){const c=base.clone().multiplyScalar(range(kind==='wood'?.83:.88,kind==='wood'?1.09:1.12));for(let j=0;j<3;j++)colors.set([c.r,c.g,c.b],(i+j)*3);}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts[kind].push(g);
  }
  function tube(kind,points,radii,sides,color){
    const positions=[],indices=[];
    for(let i=0;i<points.length;i++){
      const center=vec(points[i]),tangent=vec(points[Math.min(i+1,points.length-1)]).sub(vec(points[Math.max(0,i-1)])).normalize();
      const ref=Math.abs(tangent.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
      const n=new THREE.Vector3().crossVectors(tangent,ref).normalize(),b=new THREE.Vector3().crossVectors(tangent,n).normalize();
      for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,q=center.clone().addScaledVector(n,Math.cos(a)*radii[i]).addScaledVector(b,Math.sin(a)*radii[i]);positions.push(q.x,q.y,q.z);}
    }
    for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
    for(const end of [0,points.length-1]){const center=positions.length/3;positions.push(...points[end]);for(let j=0;j<sides;j++){const a=end*sides+j,b=end*sides+(j+1)%sides;if(end===0)indices.push(center,b,a);else indices.push(center,a,b);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);add(kind,g,color);
  }
  // A few broad facets preserve the original bent trunk and exposed roots.
  tube('wood',[[0,0,0],[-.17,1.3,.09],[.15,2.7,.1],[.48,4.3,-.1],[.2,6.4,0]],[.49,.39,.29,.19,.045],quality==='light'?5:6,barkColor);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+range(-.15,.15);tube('wood',[radial(a,.12,.28),radial(a,.62,.15),radial(a,range(1.05,1.4),.025)],[.15,.085,.012],4,barkColor);}
  let curtainCount=0;
  for(let i=0;i<p.arms;i++){
    const a=i/p.arms*Math.PI*2+range(-.12,.12),reach=range(3.05,3.65),peak=range(6.15,6.75);
    const branch=[[.16,range(2.8,3.8),0],radial(a-.08,reach*.40,peak-.55),radial(a,reach*.80,peak),radial(a+.035,reach,peak-.35)];
    tube('wood',branch,[.19,.13,.07,.016],quality==='light'?4:5,barkColor);
    for(let j=0;j<p.curtains;j++){
      const t=.60+j/(p.curtains-1)*.40,angle=a+range(-.11,.11)+(j%2?.06:-.06),r=reach*t;
      const top=peak-.10-(t>.85?.25:0),end=range(.85,1.65)+(1-t)*2.4,out=range(.30,.55),width=range(.27,.43);
      const points=[radial(angle,r,top),radial(angle,r+out,top-.55),radial(angle+.025,r+out+.10,top-(top-end)*.46),radial(angle+.035,r+out-.06,end+.65),radial(angle+.06,r+out-.03,end)];
      const leafTone=new THREE.Color(leafColor).offsetHSL(range(-.018,.018),0,range(-.025,.035));
      tube('leaves',points,[.10,width,width*.85,width*.44,.012],p.sides,leafTone);
      // Each hanging leaf bundle has a thin woody support rooted into its arm.
      const support=vec(branch[2]).lerp(vec(branch[3]),Math.max(0,(t-.8)/.2));
      if(t<.8)support.copy(vec(branch[1]).lerp(vec(branch[2]),(t-.4)/.4));
      tube('wood',[support.toArray(),points[0],points[1]],[.035,.021,.009],3,barkColor);curtainCount++;
    }
  }
  // Low-poly crown masses bridge the hanging bundles without thousands of leaf cards.
  for(let i=0;i<p.crown;i++){
    const center=i===0?[.16,6.75,0]:radial((i-1)/(p.crown-1)*Math.PI*2,range(1.75,2.25),range(6.25,6.65));
    const g=new THREE.IcosahedronGeometry(1,0);g.scale(i===0?1.65:1.45,i===0?.95:.72,i===0?1.6:1.30);g.rotateY(i*1.1);g.translate(...center);add('leaves',g,leafColor);
  }
  const group=new THREE.Group();group.name='lakeside-willow-lowpoly';group.scale.set(spread/8.6,height/7.8,spread/8.6);
  for(const [kind,list]of Object.entries(parts)){
    const count=list.reduce((n,g)=>n+g.attributes.position.count,0),g=new THREE.BufferGeometry();
    for(const key of ['position','normal','color']){const data=new Float32Array(count*3);let at=0;for(const part of list){data.set(part.attributes[key].array,at);at+=part.attributes[key].array.length;}g.setAttribute(key,new THREE.BufferAttribute(data,3));}
    g.computeBoundingBox();g.computeBoundingSphere();const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
    const mesh=new THREE.Mesh(g,material);mesh.name=kind==='wood'?'faceted-trunk-roots-branches':'faceted-weeping-leaf-bundles';mesh.castShadow=castShadow;mesh.receiveShadow=true;group.add(mesh);list.forEach(g=>g.dispose());
  }
  group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group),triangles=group.children.reduce((n,o)=>n+o.geometry.attributes.position.count/3,0);
  const stats=Object.freeze({triangles,drawCalls:2,materials:2,textures:0,curtainCount,crownCount:p.crown,dimensions:bounds.getSize(new THREE.Vector3()).toArray()});
  group.userData={assetId:'nature/lakeside-willow-lowpoly',version:'1.0.0',quality,seed,visualOnly:true,physics:false,static:true};let disposed=false;
  return {group,bounds,stats,update(seconds){if(!Number.isFinite(seconds))throw new RangeError('seconds must be finite');},dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.children.forEach(o=>{o.geometry.dispose();o.material.dispose();});}};
}
