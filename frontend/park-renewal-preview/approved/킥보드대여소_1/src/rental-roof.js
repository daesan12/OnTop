import { THREE } from './primitives.js';
import { DOCK_Z } from './rental-layout.js';

const HALF_WIDTH=1.50, HALF_DEPTH=.61, RIDGE_Y=2.24, EAVE_Y=1.98;

/** Straight ridge and eaves; two planar slopes with no lengthwise bow. */
export function roofPoint(u,t,sign=1) {
  return [u*HALF_WIDTH,RIDGE_Y+(EAVE_Y-RIDGE_Y)*t,DOCK_Z+sign*t*HALF_DEPTH];
}

function patch(b,finish,color,sample,nx,nz,thickness) {
  const p=[],indices=[],layer=(nx+1)*(nz+1);
  for(let bottom=0;bottom<2;bottom++)for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++) {
    const point=sample(x/nx,z/nz);point[1]-=bottom*thickness;p.push(...point);
  }
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++) {
    const a=z*(nx+1)+x,c=a+nx+1;
    indices.push(a,c,a+1,a+1,c,c+1,a+layer,a+1+layer,c+layer,a+1+layer,c+1+layer,c+layer);
  }
  const edges=[];
  for(let x=0;x<nx;x++)edges.push([x,x+1],[nz*(nx+1)+x+1,nz*(nx+1)+x]);
  for(let z=0;z<nz;z++)edges.push([(z+1)*(nx+1),z*(nx+1)],[z*(nx+1)+nx,(z+1)*(nx+1)+nx]);
  for(const [a,c] of edges)indices.push(a,a+layer,c,c,a+layer,c+layer);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();b.add(finish,g,color);
}

export function rentalRoof(b) {
  const light=b.quality==='light',tiles=light?12:18,rows=light?2:3;
  for(const side of [-1,1]) {
    patch(b,'tile','#474b55',(x,t)=>roofPoint(x*2-1,t,side),1,1,.045);
    for(let tile=0;tile<tiles;tile++)for(let row=0;row<rows;row++) {
      patch(b,'tile',['#555963','#5c606a','#4f545e'][tile%3],(x,z)=>{
        const t=Math.max(0,row/rows-.012)+z*(1/rows+.012),p=roofPoint(-1+(tile+x)*2/tiles,Math.min(1,t),side);
        // The small transverse round is the tile section; every course stays straight.
        p[1]+=.016+.032*Math.sin(x*Math.PI)+(rows-row)*.004;
        return p;
      },light?3:5,1,.018);
    }
    const eaveZ=DOCK_Z+side*HALF_DEPTH;
    b.box('wood','#99693e',[0,EAVE_Y-.065,eaveZ],[3.14,.12,.09]);
    for(let i=0;i<tiles;i++) {
      const x=(-1+(i+.5)*2/tiles)*HALF_WIDTH;
      b.cylinder('stone','#d6c4a3',[x,EAVE_Y+.032,eaveZ+side*.01],.025,.025,.022,[Math.PI/2,0,0],light?6:10);
    }
    for(let i=0;i<9;i++) {
      const u=(i/8-.5)*1.86,a=roofPoint(u,0,side),z=roofPoint(u,1,side);a[1]-=.085;z[1]-=.085;
      b.beam('wood','#ab7c49',a,z,.045,.055);
    }
    b.box('wood','#875b36',[0,roofPoint(0,.5)[1]-.12,DOCK_Z+side*HALF_DEPTH*.5],[3.0,.09,.095]);
  }
  // One capped cylinder replaces intersecting ridge curves, balls and collars.
  b.cylinder('tile','#4c515b',[0,RIDGE_Y+.055,DOCK_Z],.075,.075,3.14,[0,0,Math.PI/2],light?8:12);
  for(const side of [-1,1]) {
    const x=side*(HALF_WIDTH+.015);
    for(const zside of [-1,1]) {
      b.beam('tile','#515661',[x,RIDGE_Y+.018,DOCK_Z],[x,EAVE_Y+.018,DOCK_Z+zside*HALF_DEPTH],.068,.068);
      b.beam('wood','#b3834f',[x,EAVE_Y-.09,DOCK_Z],[x,EAVE_Y-.09,DOCK_Z+zside*HALF_DEPTH],.07,.065);
    }
    const shape=new THREE.Shape();shape.moveTo(-HALF_DEPTH,EAVE_Y-.105);shape.lineTo(HALF_DEPTH,EAVE_Y-.105);shape.lineTo(HALF_DEPTH,EAVE_Y-.05);shape.lineTo(0,RIDGE_Y-.05);shape.lineTo(-HALF_DEPTH,EAVE_Y-.05);shape.closePath();
    b.add('wood',new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false}),'#a77745',[side*(HALF_WIDTH-.07),0,DOCK_Z],[1,1,1],[0,Math.PI/2,0]);
  }
}
