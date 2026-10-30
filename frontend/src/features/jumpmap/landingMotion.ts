import type { BufferGeometry, MeshStandardMaterial } from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import type { JumpTheme } from '../../layout-preview/jumpCourse'

// Visual displacement only. Landing surfaces and the accepted course stay fixed.
// Fast pressure, a readable hold, then one damped release instead of an instant pop.
export const LANDING_DURATION = .95
const bodies: Record<JumpTheme, string> = {
  stone: `
    float centre=exp(-dot(p.xz,p.xz)*3.2);
    float upper=smoothstep(-.48,-.02,p.y);
    q.y-=upper*(press*(.018+.045*centre)-spring*.018);
    q.xz*=1.+press*.035*upper;
    q.xz+=sin(p.xz*5.)*press*.012*upper;`,
  gomoku: `
    q.y-=press*.095-spring*.025;
    q.xz*=1.+press*.028;
    q.y+=p.x*spring*.012;`,
  fish: `
    q.y=-.6+(p.y+.6)*(1.-press*.14+spring*.035);
    q.x*=1.+press*.10-spring*.025;
    q.z*=1.+press*.20-spring*.045;
    q.y-=exp(-dot(p.xz,p.xz)*4.)*press*.024;
    q.z+=sin(p.x*4.-age*16.)*spring*.022;`,
  cloud: `
    q.y=-.92+(p.y+.92)*(1.-press*.13+spring*.035);
    q.xz*=1.+press*.22-spring*.055;
    q.y-=exp(-dot(p.xz,p.xz)*3.)*press*.025;
    q.xz+=sin(p.zx*3.+age*13.)*spring*.018;`,
  lantern: `
    float top=smoothstep(-1.4,0.,p.y);
    q.y-=press*.085*top-spring*.022*top;
    q.xz*=1.+sin(top*3.14159)*press*.13;
    q.x+=sin(age*19.)*tail*.045*(1.-top);`,
  kite: `
    float centre=exp(-dot(p.xz,p.xz)*3.);
    q.y-=press*.065*centre;
    q.y+=press*.04*(1.-centre);
    q.y+=sin(p.z*5.-age*23.)*tail*.025*(1.-centre);
    q.xz*=1.+press*.025;`,
  lily: `
    float radius=length(p.xz);
    float rim=smoothstep(.25,1.,radius);
    float travel=max(0.,age-radius*.13);
    float wave=sin(travel*20.)*exp(-travel*5.)*smoothstep(0.,.06,travel);
    q.y-=press*.075*(1.-rim*.6);
    q.y+=wave*rim*.09;
    q.xz*=1.+press*.055-spring*.02;`,
  gate: 'q.y-=press*.018;',
}

/** Subdivide long visual triangles once at mount, so the top can dent between
 * corners. Keep source models, vertex colours, UVs and collider data untouched. */
export function landingGeometry(source: BufferGeometry, theme: JumpTheme) {
  const geometry = theme === 'gate' ? source.clone() : new TessellateModifier(.45, 3).modify(source)
  geometry.userData.jumpSource = source.uuid
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.boundingBox?.expandByScalar(.3)
  if (geometry.boundingSphere) geometry.boundingSphere.radius += .5
  return geometry
}

/** Shared by the playable service and layout preview; all animation stays on GPU. */
export function applyLandingMotion(material: MeshStandardMaterial, theme: JumpTheme, clock: { readonly value: number }, instancedPower = true) {
  const compile = material.onBeforeCompile
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer)
    shader.uniforms.jumpTime = clock
    shader.uniforms.jumpMotionScale = { get value() { return reduced?.matches ? 0 : 1 } }
    shader.vertexShader = `
      attribute float aHit;
      ${instancedPower ? 'attribute float aPower;' : ''}
      uniform float jumpTime;
      uniform float jumpMotionScale;
      varying float vLanding;
      varying vec3 vLandingPoint;
      float jumpPower() { return ${instancedPower ? 'clamp(aPower,0.,1.)' : '1.'}*jumpMotionScale; }
      vec3 jumpDeform(vec3 p) {
        float age=jumpTime-aHit;
        float strength=jumpPower();
        if(age<=0. || age>=${LANDING_DURATION} || strength<=0.)return p;
        float press=smoothstep(0.,.055,age)*(1.-smoothstep(.14,.44,age))*strength;
        float release=max(0.,age-.22);
        float tail=smoothstep(0.,.045,age)*exp(-age*4.)*(1.-smoothstep(.7,${LANDING_DURATION},age))*strength;
        float spring=sin(release*16.)*exp(-release*5.)*smoothstep(.22,.27,age)*(1.-smoothstep(.7,${LANDING_DURATION},age))*strength;
        vec3 q=p;
        ${bodies[theme]}
        return q;
      }
      ${shader.vertexShader}`
    // Recompute the normal from the same surface so the dent reads in the light.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      if(jumpTime>aHit && jumpTime-aHit<${LANDING_DURATION} && jumpPower()>0.) {
        vec3 jumpTangent=normalize(cross(normal,abs(normal.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
        vec3 jumpBitangent=cross(normal,jumpTangent);
        vec3 jumpOrigin=jumpDeform(position);
        objectNormal=normalize(cross(jumpDeform(position+jumpTangent*.008)-jumpOrigin,jumpDeform(position+jumpBitangent*.008)-jumpOrigin));
      }`)
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed=jumpDeform(position);
      vLandingPoint=position;
      float landingAge=jumpTime-aHit;
      vLanding=smoothstep(0.,.035,landingAge)*(1.-smoothstep(.18,.48,landingAge))*jumpPower();`)
    shader.fragmentShader = `varying float vLanding; varying vec3 vLandingPoint;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${theme === 'stone' || theme === 'fish' ? `
        float crackRadius=length(vLandingPoint.xz);
        float crackAngle=atan(vLandingPoint.z,vLandingPoint.x+.0001);
        float crackDistance=abs(sin(crackAngle*3.+sin(crackRadius*8.)*.16))*crackRadius;
        float crackAA=max(fwidth(crackDistance),.002);
        float crack=1.-smoothstep(.006,.012+crackAA,crackDistance);
        float crackSpread=1.-smoothstep(vLanding*.9,vLanding*.9+.12,crackRadius);
        float upper=smoothstep(-.07,-.015,vLandingPoint.y);
        diffuseColor.rgb*=1.-crack*crackSpread*upper*vLanding*.6;
      ` : ''}
      diffuseColor.rgb*=1.+vLanding*${theme === 'lantern' ? '.2' : '.045'};`)
  }
}
