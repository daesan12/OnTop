import { useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
import { useSurfaceMaps } from './SurfaceMaterial'

/** Metric, staggered granite courses with pale lime joints; no extra image download. */
export function BoundaryMasonry() {
  const maps = useSurfaceMaps('stone')
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(
    () => (shader) => {
      shader.vertexShader = `varying vec3 vWallPoint; varying vec2 vWallUv;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
      vec4 wallPoint=vec4(position,1.);
      #ifdef USE_INSTANCING
        wallPoint=instanceMatrix*wallPoint;
      #endif
      vWallPoint=(modelMatrix*wallPoint).xyz;
      vec3 wallNormal=mat3(modelMatrix)*normal;
      vWallUv=vec2(abs(wallNormal.z)>.5?vWallPoint.x:vWallPoint.z, vWallPoint.y);
      vMapUv=vWallUv*2.5;vNormalMapUv=vMapUv;vRoughnessMapUv=vMapUv;
    `,
      )
      shader.fragmentShader = `varying vec3 vWallPoint; varying vec2 vWallUv;
      float wallHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      ${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 brickUv=vec2(vWallUv.x/.235,(vWallUv.y-.24)/.18125);
      brickUv.x+=mod(floor(brickUv.y),2.)*.5;
      vec2 cell=fract(brickUv), aa=max(fwidth(brickUv),vec2(.002));
      vec2 border=min(cell,1.-cell);
      vec2 inset=smoothstep(vec2(.021,.037),vec2(.021,.037)+aa,border);
      float block=inset.x*inset.y;
      float random=wallHash(floor(brickUv));
      vec3 stone=mix(vec3(.31,.325,.322),vec3(.48,.49,.475),random);
      float grain=dot(diffuseColor.rgb,vec3(.333));
      stone*=.83+grain*.65;
      diffuseColor.rgb=mix(vec3(.67,.66,.615),stone,block);
      float roofShade=smoothstep(1.48,1.70,vWallPoint.y);
      float footingShade=1.-smoothstep(.23,.39,vWallPoint.y);
      diffuseColor.rgb*=1.-roofShade*.32-footingShade*.09;
      float wallRelief=block*.0045;
    `,
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 r1=cross(sy,normal),r2=cross(normal,sx);
      float det=dot(sx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(wallRelief)*r1+dFdy(wallRelief)*r2));
    `,
      )
    },
    [],
  )
  return (
    <meshStandardMaterial
      {...maps}
      normalScale={[0.22, 0.22]}
      roughness={1}
      onBeforeCompile={compile}
      customProgramCacheKey={() => 'boundary-granite-v1'}
    />
  )
}

/** UV relief on the small circular tile ends: inset ring and eight-petal rosette. */
export function MaksaeMaterial() {
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(
    () => (shader) => {
      shader.vertexShader = `varying vec2 vMaksaeUv;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvMaksaeUv=uv*2.-1.;',
      )
      shader.fragmentShader = `varying vec2 vMaksaeUv;\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float radius=length(vMaksaeUv), angle=atan(vMaksaeUv.y,vMaksaeUv.x);
      float aa=max(fwidth(radius),.018);
      float ring=1.-smoothstep(.025,.025+aa,abs(radius-.8));
      float petalRadius=.32+.13*cos(angle*8.);
      float petals=1.-smoothstep(.025,.025+aa,abs(radius-petalRadius));
      float center=1.-smoothstep(.09,.09+aa,radius);
      float visibleDetail=1.-smoothstep(.12,.32,aa);
      diffuseColor.rgb*=1.-(.24*ring+.19*petals+.1*center)*visibleDetail;
    `,
      )
    },
    [],
  )
  return (
    <meshStandardMaterial
      vertexColors
      roughness={0.9}
      onBeforeCompile={compile}
      customProgramCacheKey={() => 'boundary-maksae-v1'}
    />
  )
}
