import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial } from 'three'
import { environmentFrame } from '../environmentState'

/** Lightweight sky / skyline approximation; no extra reflection cameras or render targets. */
export function UrbanMaterial({ kind }: { kind: 'glass' | 'asphalt' }) {
  const night = useMemo(() => ({ value: 0 }), [])
  useFrame(() => {
    night.value = environmentFrame.night
  })
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(
    () => (shader) => {
      shader.uniforms.urbanNight = night
      shader.vertexShader = `varying vec3 vUrbanPosition; varying vec3 vUrbanNormal;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec4 urbanPoint=vec4(position,1.);vec3 urbanNormal=normal;
      #ifdef USE_INSTANCING
        urbanPoint=instanceMatrix*urbanPoint; urbanNormal=mat3(instanceMatrix)*urbanNormal;
      #endif
      vUrbanPosition=(modelMatrix*urbanPoint).xyz;
      vUrbanNormal=normalize(mat3(modelMatrix)*urbanNormal);
    `,
      )
      shader.fragmentShader = `uniform float urbanNight; varying vec3 vUrbanPosition; varying vec3 vUrbanNormal;
      float urbanHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      ${shader.fragmentShader}`
      if (kind === 'asphalt')
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      vec2 roadUv=vUrbanPosition.xz;
      float grain=urbanHash(floor(roadUv*42.));
      float grainWeight=1.-smoothstep(.4,1.8,max(length(dFdx(roadUv)),length(dFdy(roadUv)))*42.);
      vec2 tile=roadUv*.65,cell=floor(tile),f=fract(tile);f=f*f*(3.-2.*f);
      float aggregate=mix(mix(urbanHash(cell),urbanHash(cell+vec2(1.,0.)),f.x),mix(urbanHash(cell+vec2(0.,1.)),urbanHash(cell+vec2(1.)),f.x),f.y);
      diffuseColor.rgb*=.93+grain*.20*grainWeight+aggregate*.045;
    `,
        )
      else
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
      vec3 reflected=reflect(normalize(vUrbanPosition-cameraPosition),normalize(vUrbanNormal));
      float horizon=smoothstep(-.25,.65,reflected.y);
      vec3 sky=mix(vec3(.24,.31,.34),vec3(.52,.70,.82),horizon);
      sky*=1.-urbanNight*.82;
      float bands=.94+.06*sin(reflected.y*42.);
      float fresnel=pow(1.-abs(dot(normalize(cameraPosition-vUrbanPosition),normalize(vUrbanNormal))),3.);
      outgoingLight=mix(outgoingLight,sky*diffuseColor.rgb*bands*(.75+fresnel*.4),.77);
      vec2 officeCell=vec2(floor((vUrbanPosition.x+vUrbanPosition.z)/2.4),floor(vUrbanPosition.y/3.));
      float occupied=step(.67,urbanHash(officeCell));
      float blind=.75+.25*step(.15,fract(vUrbanPosition.y*7.));
      outgoingLight+=vec3(.88,.61,.31)*urbanNight*occupied*blind*.65;
      #include <opaque_fragment>
    `,
        )
    },
    [kind, night],
  )
  return (
    <meshStandardMaterial
      color="#ffffff"
      roughness={kind === 'glass' ? 0.25 : 0.96}
      metalness={kind === 'glass' ? 0.4 : 0}
      onBeforeCompile={compile}
      customProgramCacheKey={() => `urban-${kind}-v1`}
    />
  )
}
