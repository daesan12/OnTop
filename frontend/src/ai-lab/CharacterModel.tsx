import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { ModelRole } from './sceneMath'

interface Props { role: ModelRole; moving: boolean; talking: boolean; selected?: boolean; color?: string;motionSpeed?:{current:number};airborne?:boolean }

/** Original primitive models. No borrowed mesh, download, texture, paid generation, or private product rig. */
export function CharacterModel({ role, moving, talking, selected = false, color,motionSpeed,airborne=false }: Props) {
  const body = useRef<Group>(null), leftArm = useRef<Group>(null), rightArm = useRef<Group>(null)
  const leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null), head = useRef<Group>(null)
  const police = role === 'POLICE', elder = role === 'GUIDE'
  const coat = color ?? (police ? '#304d72' : elder ? '#826349' : '#b46a49')
  const gait=useRef({phase:0,amount:0})
  useFrame(({ clock },dt) => {
    const velocity=motionSpeed?motionSpeed.current:moving?1.6:0
    gait.current.phase+=dt*(3+velocity*2.5)
    gait.current.amount+=(Math.min(1,velocity/1.4)-gait.current.amount)*(1-Math.exp(-10*dt))
    const phase = gait.current.phase
    const stride = Math.sin(phase) * .38*gait.current.amount
    if (leftLeg.current) leftLeg.current.rotation.x = airborne?-.45:stride
    if (rightLeg.current) rightLeg.current.rotation.x = airborne?.25:-stride
    if (leftArm.current) leftArm.current.rotation.x = airborne?-.5:-stride * .65
    if (rightArm.current) rightArm.current.rotation.x = airborne?-.5:talking ? -.65 + Math.sin(clock.elapsedTime * 4) * .1 : stride * .65
    if (body.current) body.current.position.y = Math.abs(Math.sin(phase))*.035*gait.current.amount+Math.sin(clock.elapsedTime*1.6)*.012*(1-gait.current.amount)
    if (head.current) head.current.rotation.z = talking ? Math.sin(clock.elapsedTime * 2) * .045 : 0
  })
  return <group name={`lab-character-${role.toLowerCase()}`}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .025, 0]}><circleGeometry args={[.55, 24]}/><meshBasicMaterial color={selected ? '#e6b65c' : '#62705a'} transparent opacity={selected ? .5 : .16} depthWrite={false}/></mesh>
    <group ref={body}>
      <group ref={leftLeg} position={[-.17, .62, 0]}><mesh position={[0, -.23, 0]} castShadow><boxGeometry args={[.24, .48, .27]}/><meshStandardMaterial color={police ? '#243b56' : '#4b4941'}/></mesh><mesh position={[0, -.49, .075]} castShadow><boxGeometry args={[.29, .15, .43]}/><meshStandardMaterial color="#383a33"/></mesh></group>
      <group ref={rightLeg} position={[.17, .62, 0]}><mesh position={[0, -.23, 0]} castShadow><boxGeometry args={[.24, .48, .27]}/><meshStandardMaterial color={police ? '#243b56' : '#4b4941'}/></mesh><mesh position={[0, -.49, .075]} castShadow><boxGeometry args={[.29, .15, .43]}/><meshStandardMaterial color="#383a33"/></mesh></group>
      <mesh position={[0, .98, 0]} castShadow><cylinderGeometry args={[.31, .39, .8, 8]}/><meshStandardMaterial color={coat} flatShading/></mesh>
      <mesh position={[0, .65, .012]}><boxGeometry args={[.69, .09, .48]}/><meshStandardMaterial color={police ? '#1b293a' : '#645444'}/></mesh>
      <mesh position={[0, 1.24, .26]} rotation={[0, 0, .07]}><boxGeometry args={[.12, .4, .035]}/><meshStandardMaterial color={police ? '#e1dfc8' : '#d5c3a3'}/></mesh>
      <group ref={leftArm} position={[-.4, 1.24, 0]}><mesh position={[0, -.25, 0]} castShadow><capsuleGeometry args={[.115, .35, 2, 6]}/><meshStandardMaterial color={coat}/></mesh><mesh position={[0, -.5, .02]}><sphereGeometry args={[.115, 8, 6]}/><meshStandardMaterial color="#e8c29a"/></mesh></group>
      <group ref={rightArm} position={[.4, 1.24, 0]}><mesh position={[0, -.25, 0]} castShadow><capsuleGeometry args={[.115, .35, 2, 6]}/><meshStandardMaterial color={coat}/></mesh><mesh position={[0, -.5, .02]}><sphereGeometry args={[.115, 8, 6]}/><meshStandardMaterial color="#e8c29a"/></mesh></group>
      {police && <><mesh position={[-.17, 1.18, .3]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.085, .085, .025, 5]}/><meshStandardMaterial color="#e2b75a" metalness={.35} roughness={.45}/></mesh><mesh position={[0, 1.25, .303]}><boxGeometry args={[.035, .27, .035]}/><meshStandardMaterial color="#243247"/></mesh></>}
      <group ref={head} position={[0, 1.7, .025]}>
        <mesh castShadow><sphereGeometry args={[.33, 12, 10]}/><meshStandardMaterial color="#ebc8a2" flatShading/></mesh>
        <mesh position={[-.115, .035, .295]}><sphereGeometry args={[.032, 6, 6]}/><meshStandardMaterial color="#353629"/></mesh><mesh position={[.115, .035, .295]}><sphereGeometry args={[.032, 6, 6]}/><meshStandardMaterial color="#353629"/></mesh>
        <mesh position={[0, -.025, .325]}><sphereGeometry args={[.055, 6, 6]}/><meshStandardMaterial color="#d8ac88"/></mesh>
        {elder && <><mesh position={[-.115, .035, .31]}><torusGeometry args={[.08, .014, 4, 12]}/><meshStandardMaterial color="#5b5140"/></mesh><mesh position={[.115, .035, .31]}><torusGeometry args={[.08, .014, 4, 12]}/><meshStandardMaterial color="#5b5140"/></mesh><mesh position={[0, .04, .315]}><boxGeometry args={[.08, .02, .02]}/><meshStandardMaterial color="#5b5140"/></mesh><mesh position={[0, -.13, .28]} scale={[1, .4, 1]}><sphereGeometry args={[.13, 8, 6]}/><meshStandardMaterial color="#ddd9cb"/></mesh></>}
        <mesh position={[0, .245, 0]} castShadow><cylinderGeometry args={[police ? .32 : .37, .36, .17, police ? 10 : 8]}/><meshStandardMaterial color={police ? '#233c5b' : elder ? '#62583f' : '#5c6550'}/></mesh>
        <mesh position={[0, .19, .04]} castShadow><cylinderGeometry args={[police ? .4 : .47, police ? .4 : .47, .045, 12]}/><meshStandardMaterial color={police ? '#21344c' : '#75664b'}/></mesh>
        {police && <mesh position={[0, .28, .32]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.065, .065, .02, 5]}/><meshStandardMaterial color="#e2b75a"/></mesh>}
      </group>
    </group>
    {elder && <group position={[.6, 0, .12]}><mesh position={[0, .48, 0]} castShadow><cylinderGeometry args={[.035, .035, .95, 6]}/><meshStandardMaterial color="#68503a"/></mesh><mesh position={[-.045, .96, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.045, .045, .14, 6]}/><meshStandardMaterial color="#68503a"/></mesh></group>}
  </group>
}
