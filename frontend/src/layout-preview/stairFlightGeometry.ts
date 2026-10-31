import {BufferGeometry,Float32BufferAttribute} from 'three'

/** A closed stair flight with only exposed faces. Each tread owns its full span;
 * adjacent steps have no stacked side faces, unlike overlapping solid boxes. */
export function createStairFlight(width:number,inner:number,steps:readonly {edge:number;height:number}[]){
 const vertices:number[]=[],half=width/2
 const quad=(a:number[],b:number[],c:number[],d:number[])=>vertices.push(...a,...b,...c,...a,...c,...d)
 let near=inner
 for(let i=0;i<steps.length;i++){
  const {edge:far,height:y}=steps[i]!,next=steps[i+1]?.height??0
  quad([-half,y,near],[-half,y,far],[half,y,far],[half,y,near])
  quad([-half,next,far],[half,next,far],[half,y,far],[-half,y,far])
  quad([-half,0,near],[-half,0,far],[-half,y,far],[-half,y,near])
  quad([half,0,far],[half,0,near],[half,y,near],[half,y,far])
  near=far
 }
 const top=steps[0]!.height,outer=steps.at(-1)!.edge
 quad([half,0,inner],[-half,0,inner],[-half,top,inner],[half,top,inner])
 quad([-half,0,inner],[half,0,inner],[half,0,outer],[-half,0,outer])
 const geometry=new BufferGeometry()
 geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals()
 return geometry
}
