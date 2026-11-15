import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'
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

const fragment = `
uniform vec3 topColor, horizonColor, sunDirection;
uniform float daylight, twilight, night, clearDay;
uniform bool showConstellationLines;
varying vec3 vDirection;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float segmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 span = end - start;
  float along = clamp(dot(point - start, span) / dot(span, span), 0., 1.);
  return length(point - start - span * along);
}

vec2 bigDipper(vec2 point) {
  vec2 stars[7];
  stars[0] = vec2(-.154, .055);
  stars[1] = vec2(-.105, .032);
  stars[2] = vec2(-.059, .003);
  stars[3] = vec2(-.009, -.013);
  stars[4] = vec2(.018, -.079);
  stars[5] = vec2(.108, -.074);
  stars[6] = vec2(.13, .003);
  float line = segmentDistance(point, stars[6], stars[3]);
  float dotDistance = length(point - stars[0]);
  for (int i = 1; i < 7; i++) {
    line = min(line, segmentDistance(point, stars[i - 1], stars[i]));
    dotDistance = min(dotDistance, length(point - stars[i]));
  }
  return vec2(line, dotDistance);
}

vec2 cassiopeia(vec2 point) {
  vec2 stars[5];
  stars[0] = vec2(-.123, .039);
  stars[1] = vec2(-.068, -.04);
  stars[2] = vec2(-.005, .052);
  stars[3] = vec2(.052, -.019);
  stars[4] = vec2(.111, .058);
  float line = 1.;
  float dotDistance = length(point - stars[0]);
  for (int i = 1; i < 5; i++) {
    line = min(line, segmentDistance(point, stars[i - 1], stars[i]));
    dotDistance = min(dotDistance, length(point - stars[i]));
  }
  return vec2(line, dotDistance);
}

vec3 constellationLight(vec2 sky) {
  // Draw stylized patterns in fixed sky directions and shade only their immediate surroundings.
  vec2 dipper = (sky - vec2(-1.93, .42)) * vec2(.91, 1.);
  vec2 queen = (sky - vec2(-1.18, .58)) * vec2(.84, 1.);
  vec2 distances;
  if (abs(dipper.x) < .18 && abs(dipper.y) < .11) {
    distances = bigDipper(dipper);
  } else if (abs(queen.x) < .15 && abs(queen.y) < .09) {
    distances = cassiopeia(queen);
  } else {
    return vec3(0.);
  }
  float star = 1. - smoothstep(.0014, .0043, distances.y);
  float halo = 1. - smoothstep(.003, .009, distances.y);
  vec3 light = vec3(.72, .86, 1.) * (star * 1.18 + halo * .19);
  if (showConstellationLines) {
    float line = 1. - smoothstep(.0006, .0024, distances.x);
    light += vec3(.34, .54, .8) * line * .32;
  }
  return light;
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
      showConstellationLines: { value: false },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: BackSide,
    depthWrite: false,
    toneMapped: !simple,
  }), [simple])
  useEffect(() => () => material.dispose(), [material])

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
      const lines = camera.userData.showConstellationLines === true
      if (material.uniforms.showConstellationLines.value === lines) return
      material.uniforms.showConstellationLines.value = lines
      material.uniformsNeedUpdate = true
    }}>
    <sphereGeometry args={[600, 32, 16]} />
    <primitive object={material} attach="material" />
  </mesh>
}
