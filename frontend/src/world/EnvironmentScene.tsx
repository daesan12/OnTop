import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { outdoorReflectionMap } from './art/ornamentTextures'
import { SimpleSkyClouds } from './SimpleSkyClouds'
import { ENVIRONMENT } from '../config'
import {
  BackSide,
  Color,
  Fog,
  ShaderMaterial,
  Vector3,
  type HemisphereLight,
  type Mesh,
} from 'three'
import {
  environmentFrame as frame,
  updateEnvironmentFrame,
} from './environmentState'

const skyVertex = `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
const skyFragment = `
uniform vec3 topColor,horizonColor,sunDirection; uniform float daylight,twilight;
varying vec3 vDirection;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 vec3 d=normalize(vDirection);
 vec3 c=mix(horizonColor,topColor,smoothstep(-.08,.65,d.y));
 float sun=max(0.,dot(d,sunDirection));
 c+=vec3(1.,.55,.23)*pow(sun,12.)*twilight*.3;
 c+=vec3(1.,.82,.52)*smoothstep(.9994,.99985,sun)*daylight*.85;
 float moon=max(0.,dot(d,-sunDirection));
 c+=vec3(.58,.66,.78)*smoothstep(.99965,.9999,moon)*(1.-daylight)*.5;
 vec3 cell=floor(d*360.); float star=step(.994,hash(cell));
 vec3 q=fract(d*360.)-.5;
 c+=vec3(1.4,1.5,1.7)*star*exp(-dot(q,q)*22.)*(1.-daylight)*smoothstep(.05,.3,d.y);
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`

export function EnvironmentScene() {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const previous = scene.environment
    const intensity = scene.environmentIntensity
    scene.environment = outdoorReflectionMap
    return () => {
      scene.environment = previous
      scene.environmentIntensity = intensity
    }
  }, [scene])
  const sky = useRef<Mesh>(null),
    ambient = useRef<HemisphereLight>(null)
  const values = useMemo(
    () => ({
      dayTop: new Color('#669bc5'),
      dayHorizon: new Color('#c7d8e3'),
      nightTop: new Color(ENVIRONMENT.palette.nightSky),
      nightHorizon: new Color('#293849'),
      sunset: new Color('#d7a28a'),
      dayLight: new Color('#e4edf6'),
      nightLight: new Color('#c9d7eb'),
      ground: new Color('#747464'),
      nightGround: new Color('#b1aa9a'),
      fog: new Fog('#c7d8e3', 220, 750),
    }),
    [],
  )
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          topColor: { value: new Color() },
          horizonColor: { value: new Color() },
          sunDirection: { value: new Vector3() },
          daylight: { value: 1 },
          twilight: { value: 0 },
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: BackSide,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ camera, scene }) => {
    updateEnvironmentFrame(performance.now())
    const u = material.uniforms
    u.topColor.value.copy(values.nightTop).lerp(values.dayTop, frame.daylight)
    u.horizonColor.value
      .copy(values.nightHorizon)
      .lerp(values.dayHorizon, frame.daylight)
      .lerp(values.sunset, frame.twilight * 0.65)
    u.sunDirection.value.set(frame.sunX, frame.sunY, frame.sunZ).normalize()
    u.daylight.value = frame.daylight
    u.twilight.value = frame.twilight
    values.fog.color.copy(u.horizonColor.value)
    scene.fog = values.fog
    if (sky.current) sky.current.position.copy(camera.position)
    if (ambient.current) {
      ambient.current.color
        .copy(values.nightLight)
        .lerp(values.dayLight, frame.daylight)
      ambient.current.groundColor
        .copy(values.nightGround)
        .lerp(values.ground, frame.daylight)
      // Balance diffuse fill against the shared outdoor reflection lighting.
      ambient.current.intensity = 1.45 + frame.daylight * 0.12
    }
    scene.environmentIntensity = 0.08 + frame.daylight * 0.42
    // Keep diagnostics on scene metadata, without subscriptions or React reconciliation.
    scene.userData.environment = frame
  }, -100)
  return (
    <>
      <mesh
        ref={sky}
        name="dynamic-sky"
        renderOrder={-100}
        frustumCulled={false}
      >
        <sphereGeometry args={[600, 16, 8]} />
        <primitive object={material} attach="material" />
      </mesh>
      <SimpleSkyClouds />
      <hemisphereLight ref={ambient} layers-mask={3} />
    </>
  )
}
