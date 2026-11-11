import {useMemo} from 'react'
import {DoubleSide,FrontSide,type MeshLambertMaterial} from 'three'

/** Local metric stone courses, including the simplified renderer; no image assets. */
export function ParkStoneMaterial({large=false,twoSided=false}:{large?:boolean;twoSided?:boolean}){
 const compile=useMemo<MeshLambertMaterial['onBeforeCompile']>(()=>shader=>{
  shader.uniforms.courseSize={value:large?[1.12,.52]:[.48,.25]}
  shader.vertexShader='varying vec3 vStonePoint; varying vec3 vStoneAxis;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStonePoint=(modelMatrix*vec4(transformed,1.)).xyz;vStoneAxis=mat3(modelMatrix)*normal;')
  shader.fragmentShader='varying vec3 vStonePoint; varying vec3 vStoneAxis; uniform vec2 courseSize;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 uv=vec2(abs(vStoneAxis.y)<.75?vStonePoint.x+vStonePoint.z:vStonePoint.x,vStonePoint.y)/courseSize;
   uv.x+=mod(floor(uv.y),2.)*.5;
   vec2 edge=min(fract(uv),1.-fract(uv));
   float block=smoothstep(.023,.023+max(fwidth(uv.x),.002),edge.x)*smoothstep(.032,.032+max(fwidth(uv.y),.002),edge.y);
   float grain=fract(sin(dot(floor(uv),vec2(127.1,311.7)))*43758.5453);
   diffuseColor.rgb=mix(vec3(.46,.445,.395),mix(vec3(.25,.27,.245),vec3(.37,.38,.34),grain),block);
  `)
 },[large])
 return <meshLambertMaterial side={twoSided?DoubleSide:FrontSide} color="#aaa99e" flatShading onBeforeCompile={compile} customProgramCacheKey={()=>large?'park-retaining-stone-v2':'park-boundary-stone-v2'}/>
}
