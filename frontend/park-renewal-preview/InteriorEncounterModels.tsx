import type { ReactNode } from 'react'
import { CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { encounterFinishes, type Finish } from './interiorEncounterMaterials'

type Vec = [number, number, number]
const up = new Vector3(0,1,0)
const rounded = new RoundedBoxGeometry(1,1,1,2,.10)
const oval = new SphereGeometry(.5,24,14)

function Surface({ color, finish = 'stone' }: { color: string; finish?: Finish }) {
  const { texture, roughness, metalness, bumpScale } = encounterFinishes[finish]
  return <meshStandardMaterial color={color} map={texture} bumpMap={texture}
    bumpScale={bumpScale} roughness={roughness} metalness={metalness} />
}

export function Shape({ at, size, color, sphere = false, rotation, finish }: {
  at: Vec; size: Vec; color: string; sphere?: boolean; rotation?: Vec; finish?: Finish
}) {
  return <mesh position={at} scale={size} rotation={rotation} geometry={sphere ? oval : rounded} dispose={null}>
    <Surface color={color} finish={finish} />
  </mesh>
}

function Rod({ from, to, width, color, finish }: { from: Vec; to: Vec; width: number; color: string; finish?: Finish }) {
  const [x, y, z] = from
  const dx = to[0] - x, dy = to[1] - y, dz = to[2] - z
  const length = Math.hypot(dx, dy, dz)
  const direction = new Vector3(dx,dy,dz).normalize()
  return <group position={[x + dx/2, y + dy/2, z + dz/2]}
    quaternion={new Quaternion().setFromUnitVectors(up,direction)}>
    <mesh>
      <cylinderGeometry args={[width * .72, width, length, 10]} />
      <Surface color={color} finish={finish} />
    </mesh>
  </group>
}

const drape = new CylinderGeometry(.52,1,1,36,16,true)
const clothVertices = drape.getAttribute('position')
for (let i = 0; i < clothVertices.count; i++) {
  const x = clothVertices.getX(i), y = clothVertices.getY(i), z = clothVertices.getZ(i)
  const angle = Math.atan2(z,x)
  const fold = 1 + (.10 + (.5-y)*.09) * Math.sin(angle*9 + y*2.1) + .055*Math.cos(angle*4-y*3.2)
  clothVertices.setXYZ(i,x*fold,y + (.5-y)*.045*Math.sin(angle*5),z*fold)
}
drape.computeVertexNormals()

function Shroud({ color, height, radius }: { color: string; height: number; radius: number }) {
  return <mesh position={[0,height/2,0]} scale={[radius,height,radius*.72]} geometry={drape} dispose={null}>
    <Surface color={color} finish="cloth" />
  </mesh>
}

function Basin() {
  return <>
    <group name="pool-ripples" rotation={[-Math.PI/2,0,0]} position={[0,.09,0]}>
      {[1.04,.74,.49].map((radius,i) => <mesh key={radius} position={[i*.19,-i*.08,.002*i]} scale={[1.13,.84,1]}>
        <circleGeometry args={[radius,42]} /><Surface color="#273a38" finish="water" />
      </mesh>)}
      {[.39,.72,.95].map((radius, i) => <mesh key={radius} position={[0,0,.009 + .003*i]}
        rotation={[0,0,i*1.3]} scale={[1.06,.82,1]}>
        <ringGeometry args={[radius - .011,radius,42,1,.22,4.7]} />
        <meshBasicMaterial color="#67827a" transparent opacity={.39} depthWrite={false} />
      </mesh>)}
    </group>
    <group name="pool-figure">
      <Shroud color="#465b56" height={1.48} radius={.39} />
      <Shape at={[0,1.54,-.15]} size={[.49,.60,.44]} color="#43534c" sphere finish="cloth" />
      <Shape at={[0,1.48,.059]} size={[.20,.22,.017]} color="#262d2c" sphere finish="cloth" />
      {[-1,1].map(side => <group key={side}>
        <Shape at={[side*.33,.83,.14]} size={[.28,.82,.32]} color="#4c6159" rotation={[-.48,0,side*.18]} sphere finish="cloth" />
        <Shape at={[side*.42,.48,.35]} size={[.20,.60,.24]} color="#3c524e" rotation={[-.54,0,-side*.14]} sphere finish="cloth" />
      </group>)}
    </group>
  </>
}

function Watchers() {
  return <group name="watcher-wall">
    {Array.from({length: 11}, (_,i) => {
      const center = i === 0
      const angle = 2*Math.PI*(i-1)/10
      const x = center ? 0 : Math.cos(angle)*1.16
      const y = center ? 1.25 : 1.25 + Math.sin(angle)*(.53 + .16*(i%2))
      const size = center ? .86 : .39 + (i%4)*.05
      return <group key={i} position={[x,y,-.09*x*x + (center ? .18 : 0)]}
        rotation={[0,-x*.17,center?0:Math.cos(i*4)*.37]} scale={size}>
        <Shape at={[0,0,0]} size={[.97,.51,.14]} color="#706d57" sphere />
        <Shape at={[0,0,.061]} size={[.77,.33,.036]} color="#383831" sphere />
        <group name="watcher-lid">
          <Shape at={[0,0,.078]} size={[.71,.27,.055]} color="#948777" sphere />
          <group name="watcher-pupil">
            <Shape at={[0,0,.109]} size={[.245,.218,.027]} color="#706e56" sphere finish="metal" />
            <Shape at={[0,0,.128]} size={[.105,.142,.016]} color="#272c28" sphere />
            <Shape at={[-.043,.044,.138]} size={[.035,.028,.009]} color="#bdb39e" sphere finish="metal" />
          </group>
        </group>
      </group>
    })}
  </group>
}

const stone = '#797e70'
const straw = '#a59470'
const rust = '#725245'
const cloth = '#4a3a36'
const bone = '#b7af91'

export const encounterModels: Record<number, ReactNode> = {
  1: <>
    <Shape at={[0,1.49,0]} size={[.44,.72,.23]} color="#9b8170" sphere />
    <Shape at={[.06,1.59,.113]} size={[.22,.14,.03]} color="#21191e" sphere rotation={[0,0,-.35]} />
    <Shape at={[.08,1.59,.133]} size={[.041,.065,.02]} color="#f0b47f" sphere />
    <Shape at={[-.07,1.42,.098]} size={[.035,.28,.03]} color="#362727" rotation={[0,0,-.65]} />
    <Shape at={[-.05,1.19,-.01]} size={[.28,.24,.18]} color="#684b48" sphere />
  </>,
  2: <>
    <Shape at={[0,.17,0]} size={[1.14,.32,.75]} color="#4b554e" />
    <Shape at={[0,.83,0]} size={[.84,1.04,.48]} color={stone} rotation={[0,0,.06]} />
    <Shape at={[0,1.46,0]} size={[.57,.61,.46]} color="#a1a087" rotation={[.12,0,.14]} />
    <Shape at={[.03,1.47,.238]} size={[.54,.074,.037]} color="#323b37" rotation={[0,0,.22]} />
    <Rod from={[-.36,1.08,.28]} to={[.34,1.22,.33]} width={.14} color="#646e64" />
    <Rod from={[-.05,1.7,.25]} to={[-.17,1.39,.26]} width={.014} color="#3b4038" />
  </>,
  3: <>
    <Rod from={[0,1.02,0]} to={[0,8.8,0]} width={.035} color={straw} finish="cloth" />
    <group position={[0,1.02,0]} rotation={[0,0,Math.PI]}>
      <Shroud color="#8d7a60" height={1.48} radius={.38} />
      <Shape at={[0,.55,.13]} size={[.19,1.18,.026]} color="#594944" />
      {[-1,1].map(side => <Rod key={side} from={[side*.25,.91,0]}
        to={[side*.43,1.68,.13]} width={.049} color="#74604f" />)}
    </group>
  </>,
  4: <>
    <group name="door-leaf">
      {[0,1,2,3].map(i => <Shape key={i} at={[-.795 + .23*i,1.11,0]}
        size={[.23,2.22,.16]} color={i%2 ? '#6e5140' : '#785844'} finish="wood" />)}
      {[.36,1.7].map(y => <Shape key={y} at={[-.45,y,.09]} size={[.91,.09,.05]} color={rust} finish="metal" />)}
    </group>
    <group name="door-beast">
      <Shape at={[0,.79,0]} size={[1.26,.73,1.1]} color="#6e453d" sphere />
      <Shape at={[0,.84,.53]} size={[.49,.41,.57]} color="#493337" sphere />
      {[-1,1].map(side => <group key={side}>
        <Rod from={[side*.47,.72,.2]} to={[side*.68,.15,.72]} width={.115} color="#6a4844" />
        <Shape at={[side*.31,1.02,.49]} size={[.16,.24,.19]} color={bone} rotation={[0,0,-side*.3]} sphere />
      </group>)}
    </group>
  </>,
  5: <>
    <Shape at={[0,1.02,-.08]} size={[.75,.89,.14]} color="#242627" rotation={[0,0,-.09]} />
    <group name="reaching-hand">
      <Shape at={[.02,1.02,.21]} size={[.28,.29,.49]} color="#74695c" sphere />
      {[0,1,2,3].map(i => <group key={i}>
        <Rod from={[.12,1.16-i*.089,.32]} to={[.43+i*.038,1.20-i*.089,.48]} width={.042} color="#ae9a7d" />
        <Rod from={[.43+i*.038,1.20-i*.089,.48]} to={[.59+i*.036,1.10-i*.089,.65]} width={.036} color="#937c61" />
      </group>)}
      <Rod from={[.06,.93,.38]} to={[.28,.8,.54]} width={.054} color="#93826d" />
    </group>
  </>,
  6: <>
    <Shape at={[0,1.0,-.09]} size={[1.46,1.95,.05]} color="#5d5745" />
    <group name="wall-shadow">
      <Shape at={[0,.71,0]} size={[.41,1.25,.02]} color="#131319" sphere />
      <Shape at={[.17,1.35,0]} size={[.28,.35,.022]} color="#131319" sphere />
      <Rod from={[-.1,.91,.012]} to={[-.6,1.42,.012]} width={.057} color="#131319" />
      <Rod from={[.09,.81,.012]} to={[.43,.31,.012]} width={.048} color="#131319" />
    </group>
  </>,
  7: <>
    {Array.from({length:6}, (_,i) => <group key={i} position={[(i%2 ? .19 : -.19),(i+1)*.003,1.2-i*.49]}>
      <Shape at={[0,.012,0]} size={[.22,.024,.41]} color="#917258" sphere rotation={[0,(i%2?1:-1)*.24,0]} />
      <Shape at={[.015,.012,.21]} size={[.14,.024,.13]} color="#b68f62" sphere />
    </group>)}
    <group name="running-coat"><Shroud color="#343845" height={1.55} radius={.32} />
      <Shape at={[0,1.56,.08]} size={[.34,.14,.39]} color="#665e54" rotation={[.3,0,0]} />
    </group>
  </>,
  8: <>
    {[-.57,-.28,0,.28,.57].map(x => <Shape key={x} at={[x,1.06,.57]} size={[.046,2.15,.052]} color={rust} finish="metal" />)}
    {[.11,2.04].map(y => <Shape key={y} at={[0,y,.57]} size={[1.21,.08,.07]} color="#66594a" finish="metal" />)}
    <group name="lift-passenger" position={[0,0,-.12]}>
      <Shroud color={cloth} height={1.39} radius={.49} />
      <Shape at={[0,1.42,-.02]} size={[.55,.61,.54]} color="#6c5f55" sphere finish="cloth" />
      <mesh position={[0,1.05,.26]}><octahedronGeometry args={[.11]} /><Surface color="#a7bba5" finish="metal" /></mesh>
      <Rod from={[-.07,1.3,.27]} to={[.08,1.1,.27]} width={.025} color="#9a8060" />
    </group>
  </>,
  9: <>
    <Shroud color="#101419" height={2.24} radius={.71} />
    <Shape at={[0,1.86,.06]} size={[.95,.66,.5]} color="#181a25" sphere />
    <Shape at={[-.23,1.89,.303]} size={[.066,.055,.018]} color="#e4a762" sphere />
    <Shape at={[.25,1.75,.309]} size={[.037,.116,.018]} color="#974d4c" sphere />
  </>,
  10: <>
    <Shroud color="#646a67" height={1.57} radius={.49} />
    <Shape at={[0,1.39,-.04]} size={[.77,.39,.48]} color="#666c68" sphere finish="cloth" />
    <Shape at={[0,1.64,-.03]} size={[.47,.63,.46]} color="#747672" sphere finish="cloth" />
    <Shape at={[0,1.61,.175]} size={[.30,.34,.068]} color="#343b39" sphere finish="cloth" />
    <Shape at={[0,1.40,.18]} size={[.43,.14,.19]} color="#71726a" sphere finish="cloth" />
    <Rod from={[-.27,1.34,.165]} to={[.12,.37,.18]} width={.026} color="#7b7768" finish="cloth" />
  </>,
  11: <Basin />,
  12: <Watchers />,
}
