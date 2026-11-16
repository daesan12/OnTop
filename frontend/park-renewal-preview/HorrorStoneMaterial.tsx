import {useMemo} from 'react'
import {DoubleSide,type MeshLambertMaterial} from 'three'
/** Opaque world-metre masonry; no downloaded texture or alpha/camera fading. */
export function HorrorStoneMaterial(){
 const compile=useMemo<MeshLambertMaterial['onBeforeCompile']>(()=>shader=>{
  shader.vertexShader='varying vec3 vCryptWorld; varying vec3 vCryptNormal;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCryptWorld=(modelMatrix*vec4(transformed,1.)).xyz;vCryptNormal=mat3(modelMatrix)*normal;')
  shader.fragmentShader='varying vec3 vCryptWorld; varying vec3 vCryptNormal;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 uv=abs(vCryptNormal.y)>.65?vCryptWorld.xz/1.8:vec2(abs(vCryptNormal.x)>abs(vCryptNormal.z)?vCryptWorld.z:vCryptWorld.x,vCryptWorld.y)/vec2(1.7,.78);
   uv.x+=mod(floor(uv.y),2.)*.5;
   vec2 edge=min(fract(uv),1.-fract(uv));
   float block=smoothstep(.013,.03,edge.x)*smoothstep(.02,.04,edge.y);
   float grain=fract(sin(dot(floor(uv),vec2(31.71,64.13)))*43817.43);
   diffuseColor.rgb*=mix(.4,.83+grain*.3,block);
  `)
 },[])
 return <meshLambertMaterial vertexColors side={DoubleSide} transparent={false} depthWrite onBeforeCompile={compile} customProgramCacheKey={()=>'local-horror-stone-v1'}/>
}
