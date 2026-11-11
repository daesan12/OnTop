import { THREE } from './primitives.js';
import {createRollParts} from './shop-roof.js';

function tileRoll(b,points,radius,steps,sides,color){const g=createRollParts(points.map(p=>p.toArray()),radius,steps,sides);b.add('tile',g.tube,color);b.add('tile',g.start,color);b.add('tile',g.bevel,color);b.add('stone',g.end,'#ddc8b0');}

export const EAVE = Array.from({length:8},(_,i)=>{const a=(i/8-.0625)*Math.PI*2;return [Math.sin(a)*2.35,Math.cos(a)*2.35];});
export const UPPER = EAVE.map(([x,z]) => [x*.035,z*.035]);
export function roofPoint(facet, u, t) {
  const j = (facet + 1) % 8;
  const x0 = UPPER[facet][0] * (1-u) + UPPER[j][0] * u, z0 = UPPER[facet][1] * (1-u) + UPPER[j][1] * u;
  const x1 = EAVE[facet][0] * (1-u) + EAVE[j][0] * u, z1 = EAVE[facet][1] * (1-u) + EAVE[j][1] * u;
  const cornerLift = .10 * Math.pow(Math.abs(2*u-1),4);
  return new THREE.Vector3(x0+(x1-x0)*t,4.25-1.4*Math.pow(t,.74)+.18*t**5+cornerLift*t,z0+(z1-z0)*t);
}
/** Closed solid grid, with automatic upward winding on the top skin. */
export function panel(facet,u0,u1,t0,t1,offset=.0,thickness=.045,nu=4,nt=3,concave=false) {
  const p=[], ix=[], n=(nu+1)*(nt+1);
  for(let layer=0;layer<2;layer++) for(let j=0;j<=nt;j++) for(let i=0;i<=nu;i++) {
    const u=i/nu,t=j/nt,v=roofPoint(facet,u0+(u1-u0)*u,t0+(t1-t0)*t);
    v.y+=offset+(concave?.035*(2*u-1)**2:0)-layer*thickness; p.push(...v.toArray());
  }
  const tri=(a,b,c,up=true)=>{
    const va=new THREE.Vector3().fromArray(p,a*3),vb=new THREE.Vector3().fromArray(p,b*3),vc=new THREE.Vector3().fromArray(p,c*3);
    if ((vb.sub(va).cross(vc.sub(va)).y>0)!==up) ix.push(a,c,b);else ix.push(a,b,c);
  };
  for(let j=0;j<nt;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+nu+1;tri(a,a+1,b);tri(a+1,b+1,b);tri(a+n,a+1+n,b+n,false);tri(a+1+n,b+1+n,b+n,false);}
  // Match edge direction to the top skin winding before closing the perimeter.
  const edges=new Map();
  for(let i=0;i<ix.length;i+=3)if(ix[i]<n)for(let j=0;j<3;j++) {const a=ix[i+j],b=ix[i+(j+1)%3],k=[a,b].sort((x,y)=>x-y).join(':');if(edges.has(k))edges.delete(k);else edges.set(k,[a,b]);}
  for(const [a,b]of edges.values())ix.push(b,a,a+n,b,a+n,b+n);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function closedRoll(points,radius,steps=12,sides=10) {
  const path=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(path,steps,radius,sides,false),p=Array.from(g.attributes.position.array),ix=Array.from(g.index.array);
  const count=p.length/3; p.push(...path.getPoint(0).toArray(),...path.getPoint(1).toArray());
  for(const end of [0,1])for(let i=0;i<sides;i++) {
    let a=end?steps*(sides+1)+i:i,b=end?steps*(sides+1)+(i+1)%sides:(i+1)%sides,c=count+end;
    const va=new THREE.Vector3().fromArray(p,a*3),vb=new THREE.Vector3().fromArray(p,b*3),vc=new THREE.Vector3().fromArray(p,c*3);
    const target=path.getTangent(end).multiplyScalar(end?1:-1);if(vb.sub(va).cross(vc.sub(va)).dot(target)<0)[a,b]=[b,a];ix.push(a,b,c);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function tiledRoof(b) {
  const light=b.quality==='light';
  for(let f=0;f<8;f++) {
    b.add('tile',panel(f,0,1,0,1.045,-.055,.075,8,6),'#454151');
    const a=roofPoint(f,0,1),z=roofPoint(f,1,1),count=Math.ceil(a.distanceTo(z)/(light?.43:.32));
    for(let i=0;i<count;i++)for(let course=0;course<3;course++) {
      const ranges=[[0,.37],[.32,.71],[.66,1.045]];
      b.add('tile',panel(f,i/count,(i+1)/count,...ranges[course],[.035,.022,.009][course],.03,2,2,true),['#625a70','#6b6079','#5c556c'][course]);
    }
    for(let i=0;i<count;i++) {
      const u=i/count,pts=Array.from({length:14},(_,j)=>roofPoint(f,u,j/13*1.08).add(new THREE.Vector3(0,.049,0)));
      tileRoll(b,pts,.064,light?7:10,8,i%3?'#5d556c':'#73637c');
      if(i%2===0) b.beam('wood','#915b30',roofPoint(f,u,.73).add(new THREE.Vector3(0,-.18,0)).toArray(),roofPoint(f,u,.99).add(new THREE.Vector3(0,-.18,0)).toArray(),.10,.11);
    }
    // Continuous fascia and prominent hip ribs, including the corner endpoints.
    const fascia=Array.from({length:15},(_,i)=>roofPoint(f,i/14,1).add(new THREE.Vector3(0,-.15,0)));
    b.add('wood',closedRoll(fascia,.095,16,8),'#a26735');
    const hip=Array.from({length:15},(_,j)=>roofPoint(f,0,j/14*1.08).add(new THREE.Vector3(0,.075,0)));
    tileRoll(b,hip,.10,16,10,'#4f485e');
    const end=hip.at(-1),direction=end.clone().sub(hip.at(-2)).normalize(),rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction));
    b.at(end.toArray(),[rotation.x,rotation.y,rotation.z],()=>{for(let petal=0;petal<5;petal++){const an=petal/5*Math.PI*2;b.add('stone',new THREE.SphereGeometry(1,6,4),'#d5b395',[Math.sin(an)*.04,Math.cos(an)*.04,.016],[.020,.022,.008]);}});
  }
  b.cylinder('tile','#4c5367',[0,4.27,0],.10,.14,.18,[0,0,0],12); b.ball('gold','#d6b577',[0,4.44,0],[.12,.15,.12]);
}
