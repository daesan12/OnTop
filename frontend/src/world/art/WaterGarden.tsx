import { SIMPLE_MAP } from './mapRenderProfile'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CatmullRomCurve3,
  Color,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three'
import { environmentFrame as environment } from '../environmentState'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  BRIDGE,
  COLONNADE,
  FOUNTAIN,
  LAKE,
  SHORE_ARCS,
  bridgeHeight,
  positiveModulo,
  type Vec3,
} from '../../config'
import { beam, Instances, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BeveledBox } from './BeveledBox'

// Translucent single-pass water: sky tint + Fresnel, with no extra reflection camera.
function DetailedWater({
  position,
  radius,
}: {
  position: Vec3
  radius: [number, number]
}) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          phases: { value: new Float32Array(6) },
          daylight: { value: 1 },
          skyColor: { value: new Color() },
          sun: { value: new Vector3() },
        },
        vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){vUv=uv; vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
        fragmentShader: `uniform float phases[6];uniform float daylight;uniform vec3 skyColor,sun;varying vec2 vUv;varying vec3 vWorld;
      void main(){
      vec2 p=vWorld.xz;
      vec2 slope=vec2(0.);
      for(int i=0;i<6;i++){
        float f=float(i); vec2 d=vec2(sin(f*2.4+.3),cos(f*2.4+.3));
        slope+=d*cos(dot(p,d)*(2.4+f*2.13)+phases[i])*.017/(1.+f*.2);
      }
      vec3 normal=normalize(vec3(slope.x,1.,slope.y));
      vec3 view=normalize(cameraPosition-vWorld);
      float fresnel=.035+.965*pow(1.-max(dot(view,normal),0.),5.);
      float shore=smoothstep(.75,1.,length((vUv-.5)*2.));
      vec3 bed=mix(vec3(.048,.105,.091),vec3(.15,.20,.14),shore);
      vec3 sky=skyColor;
      vec3 color=mix(bed,sky,fresnel*.8);
      vec3 halfLight=normalize(view+normalize(sun));
      float glint=pow(max(dot(normal,halfLight),0.),40.);
      color*=.25+.75*daylight;
      color+=vec3(1.,.88,.68)*glint*.08*daylight;
      float ripple=sin(p.x*3.+phases[1]+sin(p.y*2.+phases[2]))*sin(p.y*2.3+phases[3]);
      color+=vec3(.018,.025,.025)*smoothstep(.83,1.,ripple)*(.25+.75*daylight);
      color*=1.-shore*.15;
      float alpha=mix(mix(.70,.90,fresnel),.36,shore);
      gl_FragColor=vec4(color,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
      }),
    [],
  )
  useFrame(() => {
    for (let i = 0; i < 6; i++)
      material.uniforms.phases.value[i] = positiveModulo(
        environment.seconds * (0.6 + i * 0.13),
        Math.PI * 2,
      )
    material.uniforms.daylight.value = environment.daylight
    material.uniforms.skyColor.value.setRGB(
      0.06 + 0.4 * environment.daylight,
      0.09 + 0.5 * environment.daylight,
      0.14 + 0.52 * environment.daylight,
    )
    material.uniforms.sun.value.set(
      environment.sunX,
      environment.sunY,
      environment.sunZ,
    )
  })
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh
      name="water-surface"
      renderOrder={2}
      position={[...position]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[radius[0], radius[1], 1]}
      material={material}
    >
      <circleGeometry args={[1, 96]} />
    </mesh>
  )
}

function buildGarden() {
  const wood: Part[] = [],
    rails: Part[] = [],
    stone: Part[] = [],
    poles: Part[] = [],
    roofs: Part[] = [],
    shrubs: Part[] = []
  for (const arc of SHORE_ARCS) {
    arc.forEach((p, i) => {
      if (i % 2 === 0)
        poles.push({
          p: [p[0], 0.7, p[2]],
          s: [0.055, 1.4, 0.055],
          c: '#41574f',
        })
      if (i > 0)
        for (const y of [0.5, 1.32])
          rails.push(
            beam(
              [arc[i - 1]![0], y, arc[i - 1]![2]],
              [p[0], y, p[2]],
              0.035,
              '#53695b',
            ),
          )
    })
  }
  for (let i = 0; i < BRIDGE.segments; i++) {
    const x = BRIDGE.startX + (i + 0.5) * 0.5,
      y = bridgeHeight(x)
    wood.push({
      p: [x, y - 0.08, BRIDGE.z],
      s: [0.49, 0.16, BRIDGE.halfWidth * 2],
      c: i % 3 ? '#a27b4d' : '#b28b56',
    })
  }
  for (const side of [-1, 1]) {
    const z = BRIDGE.z + side * BRIDGE.halfWidth
    for (let i = 0; i <= 24; i++) {
      const x = BRIDGE.startX + i,
        y = bridgeHeight(x)
      if (i % 2 === 0) {
        wood.push({
          p: [x, (y + 1.4) / 2, z],
          s: [0.15, y + 1.4, 0.15],
          c: '#67533a',
        })
        stone.push({ p: [x, y + 1.44, z], s: [0.21, 0.1, 0.21], c: '#c5ad79' })
      }
      if (i > 0)
        for (const h of [0.54, 1.34])
          rails.push(
            beam(
              [x - 1, bridgeHeight(x - 1) + h, z],
              [x, y + h, z],
              0.057,
              '#826039',
            ),
          )
      if (i % 4 === 0)
        wood.push({ p: [x, 0.15, z], s: [0.24, 0.4, 0.24], c: '#574d3c' })
    }
  }
  // West-side covered walk, a restrained interpretation of reference 1.
  for (const side of [-1, 1]) {
    const x = COLONNADE.x + side * 1.8
    for (const dz of [-8, -4, 0, 4, 8]) {
      poles.push({
        p: [x, 1.65, COLONNADE.z + dz],
        s: [0.17, 3.3, 0.17],
        c: '#87513c',
      })
      stone.push({
        p: [x, 0.12, COLONNADE.z + dz],
        s: [0.48, 0.24, 0.48],
        c: '#bab6a4',
      })
      wood.push({
        p: [COLONNADE.x, 3.1, COLONNADE.z + dz],
        s: [4.1, 0.2, 0.18],
        c: '#56766a',
      })
    }
    roofs.push({
      p: [COLONNADE.x + side * 1.25, 3.55, COLONNADE.z],
      s: [2.75, 0.16, 19.5],
      r: [0, 0, -side * 0.24],
      c: '#495655',
    })
    wood.push({
      p: [x, 3.16, COLONNADE.z],
      s: [0.16, 0.23, 18.5],
      c: '#426558',
    })
  }
  roofs.push({
    p: [COLONNADE.x, 3.93, COLONNADE.z],
    s: [0.22, 0.19, 19.6],
    c: '#647068',
  })
  for (let i = 0; i < 65; i++)
    for (const side of [-1, 1])
      rails.push(
        beam(
          [COLONNADE.x, 3.95, COLONNADE.z - 9.6 + i * 0.3],
          [COLONNADE.x + side * 2.58, 3.37, COLONNADE.z - 9.6 + i * 0.3],
          0.034,
          '#66726d',
        ),
      )
  // Entry gate and square stone footings.
  for (const x of [-3.3, 3.3]) {
    poles.push({ p: [x, 1.8, 43], s: [0.23, 3.6, 0.23], c: '#92543e' })
    stone.push({ p: [x, 0.15, 43], s: [0.7, 0.3, 0.7], c: '#bab8ab' })
  }
  wood.push({ p: [0, 3.3, 43], s: [7.3, 0.35, 0.38], c: '#486b5c' })
  for (const side of [-1, 1])
    roofs.push({
      p: [0, 3.85, 43 + side * 0.78],
      s: [9, 0.18, 1.8],
      r: [side * 0.24, 0, 0],
      c: '#424f50',
    })
  roofs.push({ p: [0, 4.09, 43], s: [9.15, 0.18, 0.22], c: '#63726d' })
  // Concentric clipped hedges around the fountain, with four open approaches.
  for (const radius of [4.8, 7])
    for (let i = 0; i < 64; i++) {
      const a = (i * Math.PI * 2) / 64
      if (Math.abs(Math.sin(a)) < 0.23 || Math.abs(Math.cos(a)) < 0.23) continue
      shrubs.push({
        p: [
          FOUNTAIN.x + Math.cos(a) * radius,
          0.36,
          FOUNTAIN.z + Math.sin(a) * radius,
        ],
        s: [0.45, 0.4, 0.45],
        c: i % 4 ? '#416b44' : '#618353',
      })
    }
  return {
    wood,
    stone,
    poles,
    roofs,
    shrubs,
    rails: rails.filter((p) => p.c === '#826039'),
    metalRails: rails.filter((p) => p.c === '#53695b'),
    roofRibs: rails.filter((p) => p.c === '#66726d'),
  }
}
const art = buildGarden()

function Fountain() {
  const jets = useMemo(() => {
    const parts = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      const points = [
        new Vector3(0, 1.5, 0),
        new Vector3(Math.cos(a) * 0.8, 2.8, Math.sin(a) * 0.8),
        new Vector3(Math.cos(a) * 2.25, 0.67, Math.sin(a) * 2.25),
      ]
      return new TubeGeometry(new CatmullRomCurve3(points), 18, 0.026, 4, false)
    })
    const geometry = mergeGeometries(parts)!
    parts.forEach((p) => p.dispose())
    return geometry
  }, [])
  useEffect(() => () => jets.dispose(), [jets])
  return (
    <group name="fountain-garden" position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[6, 0.24, 6]} />
        <SurfaceMaterial kind="stone" mapping="box" color="#bab8a9" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[2.9, 3, 0.48, 48]} />
        <SurfaceMaterial kind="stone" color="#a6aca2" />
      </mesh>
      <mesh position={[0, 0.69, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 2.95, 64]} />
        <SurfaceMaterial kind="stone" color="#d5d3be" />
      </mesh>
      <Water position={[0, 0.675, 0]} radius={[2.5, 2.5]} />
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.35, 0.62, 1, 16]} />
        <SurfaceMaterial kind="stone" color="#c0c4b8" />
      </mesh>
      <mesh position={[0, 1.56, 0]}>
        <sphereGeometry args={[0.32, 16, 10]} />
        <meshStandardMaterial color="#91a998" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh geometry={jets}>
        <meshBasicMaterial
          color="#d3eee5"
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
export function WaterGarden() {
  return (
    <group name="expanded-water-garden">
      <mesh
        position={[LAKE.x, 0.04, LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[LAKE.radiusX, LAKE.radiusZ, 1]}
        receiveShadow
      >
        <ringGeometry args={[0.98, 1.07, 96]} />
        <SurfaceMaterial kind="stone" color="#b7b5a2" strength={0.6} />
      </mesh>
      <Water
        position={[LAKE.x, 0.065, LAKE.z]}
        radius={[LAKE.radiusX, LAKE.radiusZ]}
      />
      <Instances
        parts={art.wood}
        material={<SurfaceMaterial kind="wood" mapping="box" />}
      >
        <BeveledBox />
      </Instances>
      <Instances parts={art.rails} material={<SurfaceMaterial kind="wood" />}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances
        parts={art.metalRails}
        material={<meshStandardMaterial roughness={0.6} metalness={0.35} />}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances
        parts={art.roofRibs}
        material={<SurfaceMaterial kind="stone" strength={0.12} />}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances
        parts={art.poles}
        material={<SurfaceMaterial kind="wood" strength={0.25} />}
      >
        <cylinderGeometry args={[1, 1, 1, 8]} />
      </Instances>
      <Instances
        parts={art.stone}
        material={<SurfaceMaterial kind="stone" mapping="box" />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={art.roofs}
        material={
          <SurfaceMaterial kind="stone" mapping="box" strength={0.15} />
        }
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={art.shrubs}
        material={
          <SurfaceMaterial
            kind="grass"
            strength={0.7}
            color="#b0c090"
            detail={0.28}
          />
        }
      >
        <icosahedronGeometry args={[1, 1]} />
      </Instances>
      <Fountain />
    </group>
  )
}

export function Water(props: Parameters<typeof DetailedWater>[0]) {
  return SIMPLE_MAP ? <mesh name="water-surface" renderOrder={2} position={[...props.position]} rotation={[-Math.PI/2,0,0]} scale={[...props.radius,1]}><circleGeometry args={[1,32]}/><meshLambertMaterial color="#5a9fa5" transparent opacity={.6} depthWrite={false}/></mesh> : <DetailedWater {...props}/>
}
