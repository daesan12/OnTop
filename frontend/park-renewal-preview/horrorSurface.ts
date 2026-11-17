import type { WebGLProgramParametersWithUniforms } from 'three'
import { HORROR } from './horrorPlan'

/**
 * Underground surface shading, all procedural (no downloaded textures): world-metre masonry with uneven courses,
 * damp bands, moss, water streaks, wet floor patches, rust and rot, and a distance haze that swallows the far hall.
 * Each patch is injected into a stock three.js material so the park's lights, tone mapping and fog stay in charge.
 */
export const HAZE = { color: '#121917', density: .03, power: 1.5 } as const

const noise = /* glsl */`
float hHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float hNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hHash(i),hHash(i+vec2(1.,0.)),f.x),mix(hHash(i+vec2(0.,1.)),hHash(i+vec2(1.,1.)),f.x),f.y);}
// Two and three octaves are plenty at underground viewing distances (S15P31B105-450: keep the per-pixel cost low).
float hFbm2(vec2 p){return hNoise(p)*.667+hNoise(p*2.03+17.1)*.333;}
float hFbm3(vec2 p){return hNoise(p)*.571+hNoise(p*2.03+17.1)*.286+hNoise(p*4.12+51.4)*.143;}
float hFbm(vec2 p){return hFbm3(p);}
`
const varyings = 'varying vec3 vHorrorWorld; varying vec3 vHorrorNormal;\n'
const hazeColor = (() => { const c = HAZE.color; return [1, 3, 5].map(i => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(4)).join(',') })()
const haze = (strength: string) => /* glsl */`
 { float hd=length(vHorrorWorld-cameraPosition);
   float hz=1.-exp(-pow(hd*${HAZE.density.toFixed(4)},${HAZE.power.toFixed(3)}));
   gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(${hazeColor}),hz*${strength}); }
`

/** World position and normal for every patched material. */
function worldVaryings(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
 vHorrorWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz; vHorrorNormal=mat3(modelMatrix)*mat3(instanceMatrix)*normal;
#else
 vHorrorWorld=(modelMatrix*vec4(transformed,1.)).xyz; vHorrorNormal=mat3(modelMatrix)*normal;
#endif`)
  shader.fragmentShader = varyings + noise + shader.fragmentShader
}

/** Haze only (glow, light shafts and anything else that keeps its own colour). */
export function hazeOnly(strength = 1) {
  return (shader: WebGLProgramParametersWithUniforms) => {
    worldVaryings(shader)
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', haze(strength.toFixed(3)) + '#include <fog_fragment>')
  }
}

/**
 * Masonry for MeshStandardMaterial with vertex colours: courses of uneven blocks (each row offset at random),
 * chipped mortar, per-block tone, a damp band and moss where water collects, dark streaks running down from the
 * vault, and wet patches on the floor that are glossy enough to catch the lamps. About nine value-noise lookups per
 * pixel: the large-scale variation is shared, and wall-only / floor-only terms are only computed on those faces.
 */
export function stoneSurface(shader: WebGLProgramParametersWithUniforms) {
  worldVaryings(shader)
  const f = HORROR.floor.toFixed(3)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
 vec3 hw=vHorrorWorld; vec3 hn=normalize(vHorrorNormal);
 bool hFloor=hn.y>.65, hRoof=hn.y<-.65, hWall=!hFloor&&!hRoof;
 vec2 hp=hWall?vec2(abs(hn.x)>abs(hn.z)?hw.z:hw.x,hw.y):hw.xz;
 vec2 hs=hWall?vec2(1.55,.74):vec2(1.75,1.2);
 vec2 hu=hp/hs; float hRow=floor(hu.y);
 hu.x+=hHash(vec2(hRow,3.7))*.93; hu.x*=.82+hHash(vec2(hRow,8.1))*.36;
 vec2 hc=floor(hu), hf=fract(hu);
 vec2 he=min(hf,1.-hf)*hs;
 float hChip=hNoise(hp*7.3)*.05;
 float hMortar=smoothstep(.016+hChip,.05+hChip,min(he.x,he.y));
 float hTone=hHash(hc+11.3), hFine=hNoise(hp*5.7), hBig=hFbm3(hp*.31+hw.y*.07);
 float hHeight=hw.y-${f};
 vec3 hBase=diffuseColor.rgb*(.66+hTone*.46)*(.84+hFine*.26)*(.78+hBig*.4);
 hBase*=mix(.26,1.,hMortar);
 float hMoss=smoothstep(.52,.74,hNoise(hp*.55+vec2(3.1,9.7))*.62+hBig*.38)*(hFloor?.55:1.)*(hRoof?.3:1.);
 float hDamp=0., hStreak=0., hWet=0.;
 if(hWall){
  hBase*=1.-smoothstep(.985,1.,1.-abs(hNoise(hp*vec2(1.3,2.1)+hc)-.5)*2.)*step(.62,hTone)*.55;
  hDamp=1.-smoothstep(.0,1.3+hBig*1.4,hHeight);
  hMoss=max(hMoss,hDamp*smoothstep(.35,.7,hNoise(hp*1.7)));
  hStreak=smoothstep(.6,.92,hNoise(vec2(hp.x*2.4,hw.y*.06)))*smoothstep(2.5,8.5,hHeight)*(.5+hBig);
  hWet=hDamp*.45;
 }
 if(hFloor) hWet=smoothstep(.56,.64,hFbm2(hw.xz*.21+7.))*(1.-hMoss*.5);
 hBase=mix(hBase,hBase*vec3(.42,.56,.36),hMoss*.8);
 hBase=mix(hBase,hBase*vec3(.55,.6,.56),hDamp*.75);
 hBase*=1.-clamp(hStreak,0.,1.)*.5;
 hBase*=mix(1.,.5,hWet);
 diffuseColor.rgb=hBase;`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=mix(.93,.32,hWet);')
    .replace('#include <fog_fragment>', haze('1.') + '#include <fog_fragment>')
}

/** Metal, wood and painted parts: rust blooms on metal, rot and soot on wood, all hazed. */
export function grimeSurface(kind: 'metal' | 'wood' | 'paint') {
  return (shader: WebGLProgramParametersWithUniforms) => {
    worldVaryings(shader)
    const body = kind === 'metal' ? /* glsl */`
 float gR=smoothstep(.5,.85,hFbm2(vHorrorWorld.xz*3.1+vHorrorWorld.y*3.7));
 float gS=hNoise(vec2(vHorrorWorld.x*9.+vHorrorWorld.z*7.,vHorrorWorld.y*1.4));
 diffuseColor.rgb=mix(diffuseColor.rgb*.82,diffuseColor.rgb*vec3(.78,.5,.32),gR*.6)*(.84+gS*.22);`
      : kind === 'wood' ? /* glsl */`
 float gR=smoothstep(.4,.8,hFbm2(vHorrorWorld.xz*.9+vHorrorWorld.y*2.3));
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.45,.5,.38),gR)*(.8+hNoise(vHorrorWorld.xy*9.)*.25);`
      : 'diffuseColor.rgb*=.85+hNoise(vHorrorWorld.xz*4.)*.25;'
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body)
      .replace('#include <fog_fragment>', haze('1.') + '#include <fog_fragment>')
  }
}
