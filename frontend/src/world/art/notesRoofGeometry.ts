import { BufferGeometry, Float32BufferAttribute, TorusGeometry } from 'three'
import { PropBuilder, type XYZ } from './propGeometry'
import { fineCurve } from './heritageGeometry'

/** The memo board has thinner, swept tiles than the heavier red letterbox roof. */
export function memoRoof(b:PropBuilder,detailed:boolean) {
  const half=.615,depth=.425,count=detailed?10:6,rows=detailed?3:1
  const height=(x:number,z:number)=>1.438+.157*Math.pow(1-Math.abs(z)/depth,1.55)+.053*Math.pow(Math.abs(x)/half,6)
  const xAt=(i:number)=>-.585+i*1.17/(count-1)
  for(const side of [-1,1]) {
    const p:number[]=[],indices:number[]=[],nx=detailed?24:12,nz=detailed?6:3
    for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
      const px=-half+x/nx*half*2,pz=side*z/nz*depth
      p.push(px,height(px,pz)-.007,pz)
    }
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x,c=a+nx+1;indices.push(a,c,a+1,a+1,c,c+1)}
    const base=new BufferGeometry();base.setAttribute('position',new Float32BufferAttribute(p,3));base.setIndex(indices);base.computeVertexNormals();b.add('tile',base,'#3f454d')
    for(let col=0;col<count;col++)for(let row=0;row<rows;row++) {
      const x=xAt(col),radius=detailed?.027:.034,positions:number[]=[],triangles:number[]=[],arc=6,length=3
      for(let j=0;j<=length;j++)for(let k=0;k<=arc;k++){
        const z=side*Math.min(depth,depth*(row+j/length)/rows),a=k/arc*Math.PI,r=radius*(j===length?1.10:1)
        positions.push(x+Math.cos(a)*r,height(x,z)+Math.sin(a)*r+.003,z)
      }
      for(let j=0;j<length;j++)for(let k=0;k<arc;k++){const a=j*(arc+1)+k,c=a+arc+1;triangles.push(a,a+1,c,a+1,c+1,c)}
      const roll=new BufferGeometry();roll.setAttribute('position',new Float32BufferAttribute(positions,3));roll.setIndex(triangles);roll.computeVertexNormals()
      b.add('tile',roll,(col+row)%3?'#51555c':'#5b5d61')
      if(detailed && row<rows-1){const z=side*depth*(row+1)/rows;b.add('tile',new TorusGeometry(radius*1.05,.0017,3,8,Math.PI),'#817b70',[x,height(x,z)+.003,z])}
    }
    for(let i=0;i<count;i++) {
      const x=xAt(i),r=detailed?.031:.037,z=side*(depth+.006),y=height(x,depth)+.003
      b.cylinder('tile','#73716b',[x,y,z],r,r,.014,[Math.PI/2,0,0],10)
      if(detailed){
        b.add('tile',new TorusGeometry(r*.78,.0017,3,10),'#9c9381',[x,y,z+side*.008])
        b.cylinder('stone','#4f504c',[x,y,z+side*.008],.004,.004,.002,[Math.PI/2,0,0],6)
      }
    }
    fineCurve(b,'wood','#614b35',Array.from({length:13},(_,i):XYZ=>{const x=-half+i/12*half*2;return[x,height(x,depth)-.020,side*depth]}),.017,detailed?16:8)
    if(detailed)fineCurve(b,'wood','#aa8a57',Array.from({length:13},(_,i):XYZ=>{const x=-half+i/12*half*2;return[x,height(x,depth)-.032,side*(depth+.001)]}),.003,16)
  }
  for(const side of [-1,1])fineCurve(b,'wood','#705238',Array.from({length:11},(_,i):XYZ=>{const z=-depth+i/10*depth*2;return[side*half,height(side*half,z)-.022,z]}),.024,detailed?14:7)
  const ridge:XYZ[]=[[-.615,1.665,0],[-.56,1.633,0],[-.3,1.615,0],[0,1.612,0],[.3,1.615,0],[.56,1.633,0],[.615,1.665,0]]
  fineCurve(b,'tile','#555653',ridge,.022,detailed?16:8)
  for(const side of [-1,1])fineCurve(b,'wood','#80613f',[[side*.602,1.595,-.015],[side*.615,1.642,-.015],[side*.610,1.675,-.015]],.014,5)
}
