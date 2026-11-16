import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, CanvasTexture, Color, ShaderMaterial, Vector3 } from 'three'
import type { Camera } from 'three'
import { ENVIRONMENT } from '../config'
import { environmentFrame as frame } from './environmentState'
import { simpleEnvironmentPalette } from './simpleEnvironmentPalette'

const vertex = `
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
  gl_Position = clip.xyww;
}`

// The park map uses -Z for north and +Z for south. Azimuth is atan(z, x).
const constellations = [
  {
    name: '북두칠성', azimuth: -1.93, elevation: .42, horizontalScale: .91,
    bounds: [.18, -.14, .11], label: [.015, -.116],
    stars: [[-.154, .055], [-.105, .032], [-.059, .003], [-.009, -.013], [.018, -.079], [.108, -.074], [.13, .003]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: '카시오페이아자리', azimuth: -1.18, elevation: .58, horizontalScale: .84,
    bounds: [.15, -.12, .09], label: [0, -.082],
    stars: [[-.123, .039], [-.068, -.04], [-.005, .052], [.052, -.019], [.111, .058]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    name: '오리온자리', azimuth: Math.PI / 2, elevation: .44, horizontalScale: .91,
    bounds: [.15, -.16, .14], label: [0, -.135],
    stars: [[-.039, -.009], [0, .001], [.035, .012], [-.094, .086], [.076, .118], [-.083, -.097], [.105, -.084]],
    edges: [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [0, 5], [5, 6], [6, 2]],
  },
] as const

const constellationDirections = constellations.map(({ azimuth, elevation }) => new Vector3(
  Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation),
))
const glslFloat = (value: number) => value.toFixed(5)
const glslPoint = ([x, y]: readonly [number, number]) => `vec2(${glslFloat(x)}, ${glslFloat(y)})`

const constellationFunctions = constellations.map(({ stars, edges }, index) => `
vec3 drawConstellation${index}(vec2 point, bool focused) {
  vec2 stars[${stars.length}];
  ${stars.map((point, index) => `stars[${index}] = ${glslPoint(point)};`).join('\n  ')}
  vec3 light = vec3(0.);
  for (int i = 0; i < ${stars.length}; i++) {
    float distanceToStar = length(point - stars[i]);
    light = max(light, constellationStar(distanceToStar, float(i), focused));
  }
  if (focused) {
    float line = 0.;
    ${edges.map(([start, end], step) => `line = max(line, joiningLight(point, stars[${start}], stars[${end}], ${glslFloat(step)}));`).join('\n    ')}
    light += vec3(.34, .54, .8) * line;
  }
  return light;
}`).join('\n')

const constellationRegions = constellations.map(({ azimuth, elevation, horizontalScale, bounds, label }, index) => `
  {
    vec2 point = (sky - ${glslPoint([azimuth, elevation])}) * ${glslPoint([horizontalScale, 1])};
    if (abs(point.x) < ${glslFloat(bounds[0])} && point.y > ${glslFloat(bounds[1])} && point.y < ${glslFloat(bounds[2])}) {
      bool focused = focusedConstellation == ${index};
      vec3 light = drawConstellation${index}(point, focused);
      if (focused) {
        float label = constellationName(point - ${glslPoint(label)}, ${glslFloat(constellations.length - index - 1)});
        light += vec3(.52, .65, .8) * label * .55 * smoothstep(1.7, 2.3, revealTime);
      }
      return light;
    }
  }`).join('\n')

const fragment = `
uniform vec3 topColor, horizonColor, sunDirection;
uniform float daylight, twilight, night, clearDay;
uniform int focusedConstellation;
uniform float revealTime, shimmerTime;
uniform sampler2D constellationNames;
varying vec3 vDirection;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec3 constellationStar(float distanceToStar, float index, bool focused) {
  float star = 1. - smoothstep(.0014, .0043, distanceToStar);
  float halo = 1. - smoothstep(.003, .009, distanceToStar);
  float flicker = 0.;
  if (focused) {
    float sparkle = .5 + .5 * sin(shimmerTime * 4. + index * 1.7);
    float arrival = 1. - smoothstep(.035, .24, abs(revealTime - (.08 + index * .17)));
    flicker = .22 * sparkle + .58 * arrival;
  }
  return vec3(.72, .86, 1.) * (star * (1.18 + flicker) + halo * (.19 + flicker * .48));
}

float joiningLight(vec2 point, vec2 start, vec2 end, float stepIndex) {
  float progress = clamp((revealTime - .28 - stepIndex * .19) / .34, 0., 1.);
  if (progress <= 0.) return 0.;
  vec2 span = end - start;
  float along = clamp(dot(point - start, span) / dot(span, span), 0., progress);
  float distanceToLine = length(point - start - span * along);
  float line = 1. - smoothstep(.00025, .00155, distanceToLine);
  float tip = (1. - smoothstep(.015, .075, abs(along - progress))) * (1. - step(1., progress));
  return line * (.085 + tip * .16);
}

float constellationName(vec2 offset, float row) {
  vec2 uv = offset / vec2(.15, .0375) + .5;
  if (any(lessThanEqual(uv, vec2(0.))) || any(greaterThanEqual(uv, vec2(1.)))) return 0.;
  return texture2D(constellationNames, vec2(uv.x, (uv.y + row) / ${glslFloat(constellations.length)})).a;
}

${constellationFunctions}

vec3 constellationLight(vec2 sky) {
  ${constellationRegions}
  return vec3(0.);
}

#ifndef SIMPLE_SKY
float noise2D(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
    mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
}
#endif

void main() {
  vec3 d = normalize(vDirection);
  vec3 c = mix(horizonColor, topColor, smoothstep(-.08, .72, d.y));
  float sun = max(0., dot(d, sunDirection));
  float glow = pow(sun, 7.) * (1. - smoothstep(.04, .55, d.y));
  vec3 horizon = mix(vec3(.38, .12, .23), vec3(1., .38, .12), glow);
  c = mix(c, horizon, twilight * (1. - smoothstep(-.025, .5, d.y)) * .8);
  c += vec3(1., .47, .17) * pow(sun, 30.) * twilight * .6;
  c += vec3(1., .82, .52) * smoothstep(.99945, .9998, sun) * max(daylight, twilight) * .85;
  float moon = max(0., dot(d, -sunDirection));
  c += vec3(.58, .66, .78) * smoothstep(.99965, .9999, moon) * night * .5;

  if (night > .01) {
    vec2 sky = vec2(atan(d.z, d.x), asin(d.y));
    vec2 grid = (sky * vec2(.15915494, .31830989) + .5) * vec2(320., 135.);
    c += constellationLight(sky) * night * night;
    vec2 cell = floor(grid);
    float seed = hash(cell);
    if (seed >= .89 && hash(cell + 101.) < .35) {
      vec2 center = mix(vec2(.27), vec2(.73), vec2(hash(cell + 37.), hash(cell + 61.)));
      float distanceToStar = length(fract(grid) - center);
      float radius = mix(.055, .19, pow(seed, 6.));
      float star = 1. - smoothstep(radius * .28, radius, distanceToStar);
      vec3 tint = mix(vec3(.68, .83, 1.), vec3(1., .86, .65), hash(cell + 17.));
      c += tint * star * .33 * night * night * smoothstep(.02, .24, d.y);
    }
  }

#ifndef SIMPLE_SKY
  vec2 p = d.xz / max(.12, d.y) * 2.;
  float cloud = noise2D(p) * .6 + noise2D(p * 2.1) * .28 + noise2D(p * 4.2) * .12;
  float cover = smoothstep(.53 + .07 * clearDay, .72 + .05 * clearDay, cloud) * smoothstep(.02, .2, d.y);
  vec3 cloudColor = mix(vec3(.065, .086, .13), mix(vec3(.93, .94, .91), vec3(1., 1.02, 1.07), clearDay), daylight);
  cloudColor = mix(cloudColor, mix(vec3(.36, .16, .29), vec3(1., .52, .31), glow), twilight * .7);
  c = mix(c, cloudColor, cover * mix(.78, .55, clearDay));
#endif
  gl_FragColor = vec4(c * (1. + .18 * clearDay), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function createConstellationNames() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = constellations.length * 128
  const context = canvas.getContext('2d')!
  context.font = '500 64px "Malgun Gothic", "Noto Sans KR", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#fff'
  constellations.forEach(({ name }, index) => context.fillText(name, 256, index * 128 + 64, 472))
  return new CanvasTexture(canvas)
}

export function ParkSky({ simple = false, matchServiceBrightness = false }: {
  simple?: boolean
  matchServiceBrightness?: boolean
}) {
  const palette = useMemo(() => ({
    dayTop: new Color(simple ? '#76c6ec' : '#669bc5'),
    dayHorizon: new Color(simple ? '#c3e7f3' : '#c7d8e3'),
    nightTop: new Color(simple ? '#101d37' : ENVIRONMENT.palette.nightSky),
    nightHorizon: new Color(simple ? simpleEnvironmentPalette.nightSky : '#293849'),
    clearTop: new Color('#56adf0'),
    clearHorizon: new Color('#c4edff'),
  }), [simple])
  const names = useMemo(createConstellationNames, [])
  // The VR lens and the ordinary park (including both headset eyes) draw this sky in turn.
  const focusByCamera = useMemo(() => new WeakMap<Camera, { index: number; startedAt: number; lastAt: number }>(), [])
  const viewDirection = useMemo(() => new Vector3(), [])
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  const material = useMemo(() => new ShaderMaterial({
    defines: simple ? { SIMPLE_SKY: 1 } : {},
    uniforms: {
      topColor: { value: new Color() },
      horizonColor: { value: new Color() },
      sunDirection: { value: new Vector3() },
      daylight: { value: 1 },
      twilight: { value: 0 },
      night: { value: 0 },
      clearDay: { value: 0 },
      focusedConstellation: { value: -1 },
      revealTime: { value: 0 },
      shimmerTime: { value: 0 },
      constellationNames: { value: names },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: BackSide,
    depthWrite: false,
    toneMapped: !simple,
  }), [names, simple])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => names.dispose(), [names])

  useFrame(() => {
    const { uniforms } = material
    const clearDay = matchServiceBrightness ? frame.daylight * (1 - frame.twilight) : 0
    uniforms.topColor.value.copy(palette.nightTop).lerp(palette.dayTop, frame.daylight).lerp(palette.clearTop, clearDay)
    uniforms.horizonColor.value.copy(palette.nightHorizon).lerp(palette.dayHorizon, frame.daylight).lerp(palette.clearHorizon, clearDay)
    uniforms.sunDirection.value.set(frame.sunX, frame.sunY, frame.sunZ).normalize()
    uniforms.daylight.value = frame.daylight
    uniforms.twilight.value = frame.twilight
    uniforms.night.value = frame.night
    uniforms.clearDay.value = clearDay
  })

  // At far-plane depth, opaque park geometry can reject hidden sky pixels.
  return <mesh name="dynamic-sky" renderOrder={100} frustumCulled={false}
    onBeforeRender={(_renderer, _scene, camera) => {
      let index = -1
      if (camera.userData.showConstellationLines === true && frame.night > .01) {
        camera.getWorldDirection(viewDirection)
        let bestAlignment = .95
        for (const [candidate, direction] of constellationDirections.entries()) {
          const alignment = direction.dot(viewDirection)
          if (alignment <= bestAlignment) continue
          bestAlignment = alignment
          index = candidate
        }
      }
      const now = performance.now() / 1000
      let revealTime = 0
      if (index >= 0) {
        let focus = focusByCamera.get(camera)
        // A lens that stopped rendering should start the reveal again when it reopens.
        if (!focus || focus.index !== index || now - focus.lastAt > 1) {
          focus = { index, startedAt: now, lastAt: now }
          focusByCamera.set(camera, focus)
        }
        focus.lastAt = now
        revealTime = reducedMotion.matches ? 2.7 : Math.min(2.7, now - focus.startedAt)
      } else {
        focusByCamera.delete(camera)
      }
      const { uniforms } = material
      uniforms.focusedConstellation.value = index
      uniforms.revealTime.value = revealTime
      uniforms.shimmerTime.value = reducedMotion.matches ? 0 : now % (Math.PI / 2)
      material.uniformsNeedUpdate = true
    }}>
    <sphereGeometry args={[600, 32, 16]} />
    <primitive object={material} attach="material" />
  </mesh>
}
