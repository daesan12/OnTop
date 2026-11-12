import { BoxGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createWallRoof, WALL } from '../src/world/art/boundaryGeometry'
import { WALL_RUNS, boundaryAtDistance } from './boundaryPlan'

/** Bend the original four-metre prefab along the new outline, preserving its handedness. */
function bend(source:BufferGeometry,start:number,end:number){
 const g=source.clone(),p=g.getAttribute('position')
 for(let i=0;i<p.count;i++){
  const frame=boundaryAtDistance(start+(p.getX(i)+2)/4*(end-start)),depth=p.getZ(i)
  p.setXYZ(i,frame.x-frame.nx*depth,frame.y+p.getY(i)*1.22,frame.z-frame.nz*depth)
 }
 g.computeVertexNormals();return g
}
function repeat(source:BufferGeometry){const pieces=WALL_RUNS.map(run=>bend(source,run.start,run.end)),g=mergeGeometries(pieces)!;pieces.forEach(p=>p.dispose());source.dispose();g.computeBoundingSphere();return g}
export function createParkWall() {
 const roof=createWallRoof(false)
 return {
  body:repeat(new BoxGeometry(4,WALL.bodyTop-WALL.base,WALL.depth,4,1,1).translate(0,(WALL.base+WALL.bodyTop)/2,0)),
  foot:repeat(new BoxGeometry(4,WALL.base+.4,WALL.depth*1.1,4,1,1).translate(0,(WALL.base-.4)/2,0)),
  clay:repeat(roof.clay),timber:repeat(roof.timber),
 }
}
