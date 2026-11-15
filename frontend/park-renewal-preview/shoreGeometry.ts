import {groundSurfaceHeight} from './groundSurface.ts'
import {BufferGeometry,Float32BufferAttribute} from 'three'
import {LAKE} from './plan.ts'
/** A continuous bank closes the exposed terrain edge all the way to the water. */
export function createLakeBank(){const p:number[]=[],ix:number[]=[],n=720;for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a),x=LAKE.x+c*(LAKE.rx+.02),z=LAKE.z+s*(LAKE.rz+.02);p.push(x,groundSurfaceHeight(x,z)+.01,z,LAKE.x+c*(LAKE.rx-.16),LAKE.y-.23,LAKE.z+s*(LAKE.rz-.16));if(i<n){const k=i*2;ix.push(k,k+1,k+2,k+1,k+3,k+2)}}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();return g}
export const lakeBank=createLakeBank()
