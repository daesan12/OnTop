import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DodecahedronGeometry,
  DoubleSide, Euler, Float32BufferAttribute, IcosahedronGeometry, Matrix4, PlaneGeometry, Quaternion, SRGBColorSpace,
  TorusGeometry, Vector3, type InstancedMesh, type WebGLProgramParametersWithUniforms,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { HORROR, HORROR_CRYPT } from './horrorPlan'
import {
  CEILING_GRATE, CHAINS, COBWEBS, COLUMN_TRIM, EFFIGY_EYES, RUBBLE, SHAFTS, VAULT_RIBS, WALL_MARKS, hash, type V3,
} from './horrorDressingPlan'
import { HAZE, grimeSurface, hazeOnly } from './horrorSurface'
import { HorrorStoneMaterial } from './HorrorStoneMaterial'
import { GrimeMaterial, HazedGlowMaterial } from './HorrorGrimeMaterial'

const time = { value: 0 }
const f = HORROR.floor
const hazeGlsl = `float hzD=length(vWorld-cameraPosition);float hz=exp(-pow(hzD*${HAZE.density.toFixed(4)},${HAZE.power.toFixed(3)}));`

// ---------- geometry (built once, on first use) ----------
const once = <T,>(make: () => T) => { let v: T | undefined; return () => (v ??= make()) }

const vaultGeometry = once(() => {
  const parts: BufferGeometry[] = []
  for (const r of VAULT_RIBS) {
    const dx = r.to[0] - r.from[0], dz = r.to[2] - r.from[2], length = Math.hypot(dx, dz)
    const g = new BoxGeometry(length, r.depth, r.width)
    g.applyMatrix4(new Matrix4().makeRotationY(-Math.atan2(dz, dx)).setPosition((r.from[0] + r.to[0]) / 2, r.from[1], (r.from[2] + r.to[2]) / 2))
    parts.push(g)
  }
  for (const t of COLUMN_TRIM) { const g = new BoxGeometry(...t.size); g.translate(...t.at); parts.push(g) }
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return g
})

const grateGeometry = once(() => {
  const s = CEILING_GRATE.size, [x, y, z] = CEILING_GRATE.at, parts: BufferGeometry[] = []
  for (const k of [-1, 1]) {
    parts.push(new BoxGeometry(s * 2 + .3, .18, .15).translate(x, y - .1, z + k * s))
    parts.push(new BoxGeometry(.15, .18, s * 2 + .3).translate(x + k * s, y - .1, z))
  }
  for (let i = -3; i <= 3; i++) parts.push(new BoxGeometry(.06, .12, s * 2).translate(x + i * s / 3.5, y - .08, z))
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return g
})

/** One draw for every chain; `aSway` grows towards the free end and `aPhase` desynchronises them. */
const chainGeometry = once(() => {
  const parts: BufferGeometry[] = []
  CHAINS.forEach((c, k) => {
    const n = Math.round(c.length / .12)
    for (let i = 0; i < n; i++) {
      const link = new TorusGeometry(.07, .018, 4, 8)
      link.applyMatrix4(new Matrix4().makeRotationY(i % 2 ? Math.PI / 2 : 0).setPosition(c.at[0], c.at[1] - .06 - i * .12, c.at[2]))
      parts.push(tag(link, c.at[1], c.length, k))
    }
    if (c.hook) {
      const hook = new TorusGeometry(.14, .028, 4, 10, Math.PI * 1.35)
      hook.applyMatrix4(new Matrix4().makeRotationZ(Math.PI * .95).setPosition(c.at[0] + .1, c.at[1] - c.length - .1, c.at[2]))
      parts.push(tag(hook, c.at[1], c.length, k))
    }
  })
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return g
})
function tag(g: BufferGeometry, top: number, length: number, k: number) {
  const p = g.getAttribute('position'), sway = new Float32Array(p.count), phase = new Float32Array(p.count).fill(hash(k + 70) * 6.28)
  for (let i = 0; i < p.count; i++) sway[i] = Math.min(1, Math.max(0, (top - p.getY(i)) / Math.max(2.5, length)))
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1)); g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1))
  return g
}
const chainCompile = (() => {
  const grime = grimeSurface('metal')
  return (shader: WebGLProgramParametersWithUniforms) => {
    grime(shader)
    shader.uniforms.uTime = time
    shader.vertexShader = 'uniform float uTime; attribute float aSway; attribute float aPhase;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n transformed.x+=sin(uTime*.62+aPhase)*.07*aSway*aSway; transformed.z+=cos(uTime*.47+aPhase*1.3)*.055*aSway*aSway;')
  }
})()

const webGeometry = once(() => {
  const pos: number[] = [], uv: number[] = [], nor: number[] = []
  for (const w of COBWEBS) {
    const sag = new Vector3(...w.a).add(new Vector3(...w.b)).multiplyScalar(.5).lerp(new Vector3(...w.corner), .18)
    // Two triangles: corner-a-sag and corner-sag-b, so the web bellies a little instead of lying flat.
    for (const [p, q, t] of [[w.corner, w.a, [1, 0]], [w.corner, w.b, [0, 1]]] as [V3, V3, number[]][]) {
      pos.push(...p, ...q, sag.x, sag.y, sag.z); uv.push(0, 0, t[0]!, t[1]!, .62, .62)
      const n = new Vector3(...q).sub(new Vector3(...p)).cross(sag.clone().sub(new Vector3(...p))).normalize()
      for (let i = 0; i < 3; i++) nor.push(n.x, n.y, n.z)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  return g
})

const MARK_COLS = 3, MARK_ROWS = 2
const markGeometry = once(() => {
  const parts: BufferGeometry[] = []
  for (const m of WALL_MARKS) {
    const g = new PlaneGeometry(m.size[0], m.size[1]), uv = g.getAttribute('uv')
    const cx = m.cell % MARK_COLS, cy = Math.floor(m.cell / MARK_COLS)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / MARK_COLS, 1 - (cy + 1 - uv.getY(i)) / MARK_ROWS)
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...m.normal))
    g.applyMatrix4(new Matrix4().makeRotationZ(m.spin ?? 0)).applyMatrix4(new Matrix4().makeRotationFromQuaternion(q).setPosition(...m.at))
    parts.push(g)
  }
  const g = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return g
})

const shaftGeometry = once(() => mergeGeometries(SHAFTS.map(s => {
  const h = s.top[1] - s.bottom, g = new CylinderGeometry(s.radius[0], s.radius[1], h, 20, 1, true)
  g.translate(s.top[0], s.bottom + h / 2, s.top[2])
  const c = new Color(s.color).multiplyScalar(s.strength), col = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i)
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}))!)

const dustGeometry = once(() => {
  const pos: number[] = [], seed: number[] = []
  SHAFTS.forEach((s, k) => {
    for (let i = 0; i < 90; i++) {
      const u = hash(k * 300 + i), v = hash(k * 300 + i + .5), w = hash(k * 300 + i + .25)
      const y = s.bottom + .3 + u * (s.top[1] - s.bottom - .5), t = (s.top[1] - y) / (s.top[1] - s.bottom)
      const r = (s.radius[0] + (s.radius[1] - s.radius[0]) * t) * Math.sqrt(v) * .85, a = w * Math.PI * 2
      pos.push(s.top[0] + Math.cos(a) * r, y, s.top[2] + Math.sin(a) * r); seed.push(hash(i * 7 + k))
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1))
  return g
})

// ---------- procedural textures ----------
const webTexture = once(() => {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')!; g.strokeStyle = 'rgba(225,228,215,.85)'; g.lineCap = 'round'
  const spokes = 9
  for (let i = 0; i <= spokes; i++) { const a = i / spokes * Math.PI / 2; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250); g.stroke() }
  for (let r = 18; r < 250; r += 15 + r * .06) {
    g.lineWidth = 1.1; g.beginPath()
    for (let i = 0; i <= spokes; i++) {
      const a = i / spokes * Math.PI / 2, rr = r * (1 + (hash(r + i) - .5) * .08)
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr
      if (i === 0) g.moveTo(x, y)
      else { const m = (i - .5) / spokes * Math.PI / 2, s = rr * .9; g.quadraticCurveTo(Math.cos(m) * s, Math.sin(m) * s, x, y) }
    }
    g.stroke()
  }
  // A torn gap so the webs look old.
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(150, 120, 34, 22, .6, 0, Math.PI * 2); g.fill()
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t
})

const markTexture = once(() => {
  const S = 256, c = document.createElement('canvas'); c.width = S * MARK_COLS; c.height = S * MARK_ROWS
  const g = c.getContext('2d')!
  const cell = (k: number, draw: () => void) => { g.save(); g.translate((k % MARK_COLS) * S, Math.floor(k / MARK_COLS) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); draw(); g.restore() }
  const hand = (x: number, y: number, s: number, a: number, col: string) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6
    g.beginPath(); g.ellipse(0, 18, 30, 34, 0, 0, Math.PI * 2); g.fill()
    for (const [fx, fy, fl, fa] of [[-24, -10, 30, -.35], [-9, -22, 40, -.1], [7, -24, 42, .05], [22, -16, 36, .22], [34, 18, 26, 1]] as const) {
      g.save(); g.translate(fx, fy); g.rotate(fa); g.beginPath(); g.ellipse(0, -fl / 2, 7.5, fl / 2, 0, 0, Math.PI * 2); g.fill(); g.restore()
    }
    g.restore()
  }
  const scratch = (pts: [number, number][], w: number) => {
    for (const [col, lw] of [['rgba(10,8,6,.75)', w + 3], ['rgba(205,196,175,.9)', w]] as const) {
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke()
    }
  }
  cell(0, () => hand(128, 140, 1.5, .1, 'rgba(14,10,8,.8)'))
  cell(1, () => { for (let i = 0; i < 4; i++) scratch([[70 + i * 34, 30 + i * 6], [86 + i * 34, 120], [92 + i * 32, 228 - i * 8]], 4.5 - i * .5) })
  cell(2, () => {
    for (let gx = 0; gx < 3; gx++) {
      const x0 = 24 + gx * 76; for (let i = 0; i < 4; i++) scratch([[x0 + i * 13, 70 + hash(gx * 4 + i) * 10], [x0 + i * 13 + 3, 180]], 3.5)
      scratch([[x0 - 8, 168], [x0 + 56, 82]], 3.5)
    }
  })
  cell(3, () => {
    for (let i = 0; i < 14; i++) {
      const x = 40 + hash(i) * 176, w = 6 + hash(i + 3) * 22, len = 120 + hash(i + 7) * 136
      const grad = g.createLinearGradient(0, 0, 0, len); grad.addColorStop(0, 'rgba(12,16,10,.7)'); grad.addColorStop(1, 'rgba(12,16,10,0)')
      g.fillStyle = grad; g.beginPath(); g.ellipse(x, len / 2, w / 2, len / 2, 0, 0, Math.PI * 2); g.fill()
    }
  })
  cell(4, () => {
    for (const [x, y, a] of [[80, 70, -.2], [170, 96, .25], [118, 150, .05]] as const) {
      hand(x, y, .8, a, 'rgba(18,12,9,.75)')
      const grad = g.createLinearGradient(0, y, 0, y + 110); grad.addColorStop(0, 'rgba(18,12,9,.55)'); grad.addColorStop(1, 'rgba(18,12,9,0)')
      g.fillStyle = grad; g.fillRect(x - 22, y + 20, 44, 100)
    }
  })
  cell(5, () => { scratch([[30, 128], [210, 128]], 5); scratch([[160, 80], [214, 128], [160, 176]], 5) })
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t
})

// ---------- shaders ----------
const shaftShader = {
  uniforms: { uTime: time },
  vertexShader: /* glsl */`varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vV;
    void main(){ vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vCol=color; vV=uv.y;
      gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */`uniform float uTime; varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vV;
    void main(){ vec3 view=normalize(cameraPosition-vWorld); float facing=abs(dot(normalize(vN),view));
      float core=pow(facing,2.2); float ends=smoothstep(0.,.18,vV)*smoothstep(1.,.86,vV);
      float bands=.82+.18*sin(vWorld.y*2.3-uTime*.7+vWorld.x);
      ${hazeGlsl}
      gl_FragColor=vec4(vCol*core*ends*bands*mix(.55,1.,vV)*hz,1.); }`,
}
const dustShader = {
  uniforms: { uTime: time },
  vertexShader: /* glsl */`uniform float uTime; attribute float aSeed; varying float vA; varying vec3 vWorld;
    void main(){ vec3 p=position+vec3(sin(uTime*.37+aSeed*11.)*.22,sin(uTime*.21+aSeed*7.)*.3,cos(uTime*.29+aSeed*5.)*.22);
      vec4 w=modelMatrix*vec4(p,1.); vWorld=w.xyz; vec4 mv=viewMatrix*w; gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((.016+aSeed*.03)*740./max(.5,-mv.z),1.,6.); vA=.35+.65*(.5+.5*sin(uTime*(.8+aSeed)+aSeed*30.)); }`,
  fragmentShader: /* glsl */`varying float vA; varying vec3 vWorld;
    void main(){ vec2 d=gl_PointCoord-.5; float a=smoothstep(.5,.0,length(d)); ${hazeGlsl}
      gl_FragColor=vec4(vec3(1.,.9,.72)*a*vA*.55*hz,1.); }`,
}
const mistShader = (alpha: number, scale: number, speed: number) => ({
  uniforms: { uTime: time },
  vertexShader: /* glsl */`varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */`uniform float uTime; varying vec3 vWorld;
    float hh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float nn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1.,0.)),f.x),mix(hh(i+vec2(0.,1.)),hh(i+vec2(1.,1.)),f.x),f.y);}
    float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*nn(p);p=p*2.07+11.3;a*=.5;}return v;}
    void main(){ vec2 p=vWorld.xz*${scale.toFixed(3)}; float n=fb(p+vec2(uTime*${speed.toFixed(3)},uTime*${(speed * .6).toFixed(3)}))*fb(p*1.7-uTime*${(speed * .8).toFixed(3)});
      float near=smoothstep(.6,3.5,length(vWorld-cameraPosition));
      gl_FragColor=vec4(vec3(.50,.58,.55),smoothstep(.12,.5,n)*${alpha.toFixed(3)}*near); }`,
})
const waterCompile = (shader: WebGLProgramParametersWithUniforms) => {
  hazeOnly(1)(shader)
  shader.uniforms.uTime = time
  shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader
    .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
      vec2 wq=vHorrorWorld.xz*1.6; float e=.08;
      float w0=hFbm(wq+uTime*vec2(.13,.09)), wx=hFbm(wq+vec2(e,0.)+uTime*vec2(.13,.09)), wz=hFbm(wq+vec2(0.,e)+uTime*vec2(.13,.09));
      float ring=sin(length(vHorrorWorld.xz-vec2(${HORROR_CRYPT.x.toFixed(2)},${HORROR_CRYPT.z.toFixed(2)}))*7.-uTime*1.3)*.012;
      vec3 wn=normalize(vec3(-(wx-w0)/e*.09-ring,1.,-(wz-w0)/e*.09));
      normal=normalize((viewMatrix*vec4(wn,0.)).xyz);`)
    .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      float deep=hFbm(vHorrorWorld.xz*.35-uTime*.02);
      totalEmissiveRadiance+=vec3(.006,.03,.022)*smoothstep(.35,.75,deep);
      totalEmissiveRadiance+=vec3(.16,.21,.24)*smoothstep(1.7,.2,length(vHorrorWorld.xz-vec2(${HORROR_CRYPT.x.toFixed(2)},${HORROR_CRYPT.z.toFixed(2)})))*(.55+.45*hNoise(vHorrorWorld.xz*3.+uTime*.6));`)
}

// ---------- components ----------
function Rubble() {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new DodecahedronGeometry(1, 0), [])
  useLayoutEffect(() => {
    const m = mesh.current; if (!m) return
    const q = new Quaternion(), s = new Vector3(), e = new Euler()
    RUBBLE.forEach((r, i) => m.setMatrixAt(i, new Matrix4().compose(new Vector3(...r.at), q.setFromEuler(e.set(r.spin * .7, r.spin, r.spin * 1.3)), s.set(r.radius, r.radius * .68, r.radius * 1.15))))
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere()
  }, [])
  return <instancedMesh ref={mesh} args={[geometry, undefined, RUBBLE.length]} name="horror-rubble"><GrimeMaterial kind="paint" color="#4d524b" flatShading /></instancedMesh>
}

function EffigyEyes() {
  const mesh = useRef<InstancedMesh>(null), color = useMemo(() => new Color(), [])
  const geometry = useMemo(() => new IcosahedronGeometry(.055, 1), [])
  useLayoutEffect(() => {
    const m = mesh.current; if (!m) return
    EFFIGY_EYES.forEach((p, i) => { m.setMatrixAt(i, new Matrix4().makeScale(1, .7, 1).setPosition(...p)); m.setColorAt(i, color.set('#ff5a2a')) })
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere()
  }, [color])
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return
    const t = clock.elapsedTime
    EFFIGY_EYES.forEach((_, i) => {
      const pair = i >> 1, glow = .25 + .75 * Math.max(0, Math.sin(t * .35 + pair * 2.1)) ** 3
      m.setColorAt(i, color.set('#ff5a2a').multiplyScalar(glow))
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geometry, undefined, EFFIGY_EYES.length]} name="horror-effigy-eyes"><HazedGlowMaterial vertexColors={false} /></instancedMesh>
}

/** Vault ribs, chains, cobwebs, wall marks, rubble, light shafts, dust, cistern water and mist, and the effigies' eyes. */
export function HorrorDressing() {
  const water = useMemo(() => new CircleGeometry(HORROR_CRYPT.rx - .55, 56).rotateX(-Math.PI / 2), [])
  const mistDisc = useMemo(() => new CircleGeometry(HORROR_CRYPT.rx + 1.6, 40).rotateX(-Math.PI / 2), [])
  const groundMist = useMemo(() => new PlaneGeometry(HORROR.x1 - HORROR.x0, HORROR.z1 - HORROR.z0).rotateX(-Math.PI / 2), [])
  useFrame(({ clock }) => { time.value = clock.elapsedTime })
  const top = f + HORROR_CRYPT.height
  return <group name="underground-dressing" userData={{ keepOpaque: true }}>
    <mesh geometry={vaultGeometry()} name="horror-vault-ribs"><HorrorStoneMaterial color="#545950" /></mesh>
    <mesh geometry={grateGeometry()} name="horror-ceiling-grate"><GrimeMaterial kind="metal" color="#2f3330" /></mesh>
    <mesh geometry={chainGeometry()} name="horror-chains" frustumCulled={false}>
      <meshLambertMaterial color="#7a766a" flatShading onBeforeCompile={chainCompile} customProgramCacheKey={() => 'local-horror-chain'} />
    </mesh>
    <mesh geometry={webGeometry()} name="horror-cobwebs" renderOrder={2}>
      <meshBasicMaterial map={webTexture()} transparent opacity={.42} depthWrite={false} side={DoubleSide} color="#7e847b"
        onBeforeCompile={hazeOnly(1)} customProgramCacheKey={() => 'local-horror-web'} />
    </mesh>
    <mesh geometry={markGeometry()} name="horror-wall-marks" renderOrder={1}>
      <meshLambertMaterial map={markTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}
        onBeforeCompile={hazeOnly(1)} customProgramCacheKey={() => 'local-horror-marks'} />
    </mesh>
    <Rubble />
    <EffigyEyes />
    <mesh geometry={water} position={[HORROR_CRYPT.x, top + .035, HORROR_CRYPT.z]} name="horror-cistern-water">
      <meshStandardMaterial color="#0b1716" roughness={.06} metalness={.3} onBeforeCompile={waterCompile} customProgramCacheKey={() => 'local-horror-water'} />
    </mesh>
    {[.22, .55, .95].map((h, i) => <mesh key={h} geometry={mistDisc} position={[HORROR_CRYPT.x, top + h, HORROR_CRYPT.z]} renderOrder={3 + i}>
      <shaderMaterial args={[mistShader(.2 - i * .04, .32 + i * .07, .05 + i * .02)]} transparent depthWrite={false} side={DoubleSide} />
    </mesh>)}
    <mesh geometry={groundMist} position={[(HORROR.x0 + HORROR.x1) / 2, f + .32, (HORROR.z0 + HORROR.z1) / 2]} renderOrder={3}>
      <shaderMaterial args={[mistShader(.13, .16, .025)]} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
    <mesh geometry={shaftGeometry()} name="horror-light-shafts" renderOrder={6}>
      <shaderMaterial args={[shaftShader]} vertexColors transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
    </mesh>
    <points geometry={dustGeometry()} name="horror-dust" renderOrder={7}>
      <shaderMaterial args={[dustShader]} transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  </group>
}
