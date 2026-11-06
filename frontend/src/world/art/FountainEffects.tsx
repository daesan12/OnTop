import { cameraWorldPosition } from '../xrView'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  ENVIRONMENT_QUALITY,
  FOUNTAIN,
  positiveModulo,
  type QualityPreset,
} from '../../config'
import { environmentFrame as frame } from '../environmentState'

export function fountainPoint(jet: number, phase: number) {
  const outer = jet >= 6,
    angle = ((jet - (outer ? 6 : 0)) * Math.PI * 2) / (outer ? 12 : 6)
  const start = outer ? 3.5 : 0.4,
    end = outer ? 1.8 : 1.3,
    velocity = outer ? 7 : 9.6
  const flight = (2 * velocity) / 9.8,
    t = phase * flight,
    r = start + (end - start) * phase
  return {
    x: Math.cos(angle) * r,
    y: 0.64 + velocity * t - 4.9 * t * t,
    z: Math.sin(angle) * r,
  }
}
export function FountainEffects({ quality }: { quality: QualityPreset }) {
  const preset = ENVIRONMENT_QUALITY[quality],
    group = useRef<Group>(null),
    ripples = useRef<InstancedMesh>(null)
  const object = useMemo(() => new Object3D(), [])
  const resources = useMemo(() => {
    const tubes = Array.from(
      { length: 18 },
      (_, jet) =>
        new TubeGeometry(
          new CatmullRomCurve3(
            Array.from({ length: 25 }, (_, i) => {
              const p = fountainPoint(jet, i / 24)
              return new Vector3(p.x, p.y, p.z)
            }),
          ),
          32,
          jet < 6 ? 0.065 : 0.032,
          5,
          false,
        ),
    )
    const tube = mergeGeometries(tubes)
    tubes.forEach((t) => t.dispose())
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(preset.droplets * 3), 3).setUsage(
        DynamicDrawUsage,
      ),
    )
    geometry.setAttribute(
      'alpha',
      new BufferAttribute(new Float32Array(preset.droplets), 1).setUsage(
        DynamicDrawUsage,
      ),
    )
    const rippleGeometry = new PlaneGeometry(2, 2)
    rippleGeometry.setAttribute(
      'alpha',
      new InstancedBufferAttribute(new Float32Array(36), 1).setUsage(
        DynamicDrawUsage,
      ),
    )
    const streams = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, daylight: { value: 1 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float time,daylight;varying vec2 vUv;void main(){float flow=.5+.5*sin(vUv.x*95.-time*22.);vec3 c=mix(vec3(.35,.52,.58),vec3(.88,.95,1.),daylight);gl_FragColor=vec4(c,.38+flow*.28);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    })
    const drops = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { daylight: { value: 1 }, scale: { value: 500 } },
      vertexShader: `uniform float scale;attribute float alpha;varying float vAlpha;void main(){vAlpha=alpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(scale*.055/-p.z,1.,6.);}`,
      fragmentShader: `uniform float daylight;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(mix(vec3(.35,.5,.6),vec3(.8,.92,.95),daylight),(1.-r*r)*.75*vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    })
    const rings = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { daylight: { value: 1 } },
      vertexShader: `attribute float alpha;varying float vAlpha;varying vec2 vUv;void main(){vAlpha=alpha;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float daylight;varying float vAlpha;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=exp(-pow((r-.8)*35.,2.))*.35*vAlpha;gl_FragColor=vec4(vec3(.55,.76,.8)*(.45+.55*daylight),a);
      #include <colorspace_fragment>
      }`,
    })
    return { tube, geometry, rippleGeometry, streams, drops, rings }
  }, [preset.droplets])
  useEffect(
    () => () => {
      resources.tube.dispose()
      resources.geometry.dispose()
      resources.rippleGeometry.dispose()
      resources.streams.dispose()
      resources.drops.dispose()
      resources.rings.dispose()
    },
    [resources],
  )
  useFrame(({ camera, size, gl }) => {
    const visible =
      Math.hypot(
        cameraWorldPosition(camera).x - FOUNTAIN.x,
        cameraWorldPosition(camera).z - FOUNTAIN.z,
      ) < preset.effectDistance
    if (group.current) group.current.visible = visible
    resources.streams.uniforms.time.value = positiveModulo(
      frame.seconds,
      Math.PI / 11,
    )
    resources.streams.uniforms.daylight.value = frame.daylight
    // The stream silhouette remains visible at a distance; only fine spray is culled.
    if (!visible) return
    resources.drops.uniforms.daylight.value = frame.daylight
    resources.rings.uniforms.daylight.value = frame.daylight
    resources.drops.uniforms.scale.value = size.height * gl.getPixelRatio()
    const positions = resources.geometry.getAttribute(
      'position',
    ) as BufferAttribute
    const alphas = resources.geometry.getAttribute('alpha') as BufferAttribute
    for (let i = 0; i < preset.droplets; i++) {
      const jet = i % 18,
        flight = (2 * (jet < 6 ? 9.6 : 7)) / 9.8
      const cycle = positiveModulo(frame.seconds + i * 0.618034, flight + 0.36)
      const phase = Math.min(cycle / flight, 1),
        p = fountainPoint(jet, phase)
      const splash = Math.max(0, (cycle - flight) / 0.36)
      const spread = 0.025 + phase * 0.12 + splash * 0.45
      positions.setXYZ(
        i,
        p.x + Math.sin(i * 7.1 + phase * 6) * spread,
        p.y + 1.05 * splash * (1 - splash),
        p.z + Math.cos(i * 3.7 + phase * 5) * spread,
      )
      alphas.setX(i, 1 - splash)
    }
    positions.needsUpdate = true
    alphas.needsUpdate = true
    if (ripples.current) {
      ripples.current.instanceMatrix.setUsage(DynamicDrawUsage)
      const rippleAlphas = resources.rippleGeometry.getAttribute(
        'alpha',
      ) as InstancedBufferAttribute
      for (let i = 0; i < 36; i++) {
        const jet = i % 18,
          age = positiveModulo(frame.seconds * 0.65 + i * 0.37, 1),
          p = fountainPoint(jet, 1)
        object.position.set(p.x, 0.655, p.z)
        object.rotation.set(-Math.PI / 2, 0, 0)
        object.scale.setScalar(0.08 + age * 0.8)
        object.updateMatrix()
        ripples.current.setMatrixAt(i, object.matrix)
        rippleAlphas.setX(i, Math.sin(age * Math.PI) * (1 - age))
      }
      ripples.current.instanceMatrix.needsUpdate = true
      rippleAlphas.needsUpdate = true
    }
  })
  return (
    <>
      <mesh name="flowing-fountain-jets" geometry={resources.tube}>
        <primitive object={resources.streams} attach="material" />
      </mesh>
      <group ref={group} name="fountain-spray">
        <points geometry={resources.geometry} frustumCulled={false}>
          <primitive object={resources.drops} attach="material" />
        </points>
        <instancedMesh
          ref={ripples}
          args={[undefined, undefined, 36]}
          geometry={resources.rippleGeometry}
          frustumCulled={false}
        >
          <primitive object={resources.rings} attach="material" />
        </instancedMesh>
      </group>
    </>
  )
}
