import { useImperativeHandle, useRef, type Ref } from 'react'
import type { Group, Mesh } from 'three'

type Axes = [x: number, y: number, z: number]
type Side = -1 | 1

export type PigeonLook = 'sage' | 'lilac' | 'ash' | 'pearl'
export type PigeonPose = {
  head?: Axes
  leftWing?: Axes
  rightWing?: Axes
  jaw?: number
  eyelids?: [left: number, right: number]
  gaze?: [x: number, y: number]
}

const plumage = {
  sage: { body: '#7d8994', breast: '#aeb5bc', face: '#637480', wing: '#586a7a', neck: '#568b7c', neckTip: '#80a394' },
  lilac: { body: '#8d929e', breast: '#bdbbc2', face: '#707686', wing: '#626a7c', neck: '#967cad', neckTip: '#af9abd' },
  ash: { body: '#727f8b', breast: '#a3aab0', face: '#5c6c79', wing: '#536271', neck: '#778f87', neckTip: '#92a69c' },
  pearl: { body: '#9c9faa', breast: '#c6c5ca', face: '#787d89', wing: '#727785', neck: '#8c8a9f', neckTip: '#aba6b7' },
} satisfies Record<PigeonLook, Record<string, string>>

const sides = [-1, 1] as const
const lidRestY = 0.005
export const pigeonHeadPivot: Axes = [0, 0.623, 0.103]

function Plume({ position, scale, color, rotation }: {
  position: Axes
  scale: Axes
  color: string
  rotation?: Axes
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial color={color} roughness={0.88} flatShading />
    </mesh>
  )
}

function Eye({ side, lid, gaze, face, lidRef, pupilRef }: {
  side: Side
  lid: number
  gaze: [number, number]
  face: string
  lidRef: Ref<Mesh>
  pupilRef: Ref<Group>
}) {
  const lidAngle = 0.72 + 1.05 * Math.min(1, Math.max(0, lid))
  return (
    <group position={[side * 0.142, 0.158, 0.218]} rotation={[0, side * 0.44, side * -0.08]}>
      <Plume position={[0, 0, 0]} scale={[0.092, 0.088, 0.042]} color="#43505b" />
      <Plume position={[0, 0, 0.018]} scale={[0.079, 0.074, 0.035]} color="#fff2dc" />
      <group ref={pupilRef} position={[gaze[0] * 0.025, gaze[1] * 0.017, 0.043]}>
        <Plume position={[0, 0, 0]} scale={[0.044, 0.05, 0.019]} color="#c99655" />
        <Plume position={[0, 0, 0.012]} scale={[0.035, 0.043, 0.014]} color="#26323a" />
        <Plume position={[-0.012, 0.016, 0.023]} scale={[0.011, 0.013, 0.007]} color="#fff7e5" />
      </group>
      <mesh ref={lidRef} position={[0, lidRestY, 0.023]} scale={[0.093, 0.088, 0.063]}>
        <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, lidAngle]} />
        <meshStandardMaterial color={face} roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

/** Feet at the origin, +Z forward. Pose and grip are independent of any game. */
export type PigeonRig = {
  body: Group
  head: Group
  leftWing: Group
  rightWing: Group
  jaw: Group
  legs: { shin: Mesh; foot: Group }[]
  setLidLift: (lift: number) => void
  setGaze: (x: number, y: number) => void
}

export function PigeonActor({ look, pose = {}, gripRef, rigRef }: {
  look: PigeonLook
  pose?: PigeonPose
  gripRef?: Ref<Group>
  rigRef?: Ref<PigeonRig>
}) {
  const head = useRef<Group>(null), leftWing = useRef<Group>(null), rightWing = useRef<Group>(null), jaw = useRef<Group>(null)
  const body = useRef<Group>(null)
  const lids = useRef<(Mesh | null)[]>([])
  const pupils = useRef<(Group | null)[]>([])
  const shins = useRef<(Mesh | null)[]>([])
  const feet = useRef<(Group | null)[]>([])
  useImperativeHandle(rigRef, () => ({
    body: body.current!, head: head.current!, leftWing: leftWing.current!, rightWing: rightWing.current!, jaw: jaw.current!,
    legs: sides.map((_, index) => ({ shin: shins.current[index]!, foot: feet.current[index]! })),
    setLidLift(lift) {
      for (const lid of lids.current) if (lid) lid.position.y = lidRestY + lift
    },
    setGaze(x, y) {
      for (const pupil of pupils.current) {
        pupil?.position.set(Math.max(-1, Math.min(1, x)) * 0.025, Math.max(-1, Math.min(1, y)) * 0.017, 0.043)
      }
    },
  }), [])
  const color = plumage[look]
  const eyelids = pose.eyelids ?? [0.25, 0.25]
  const gaze = pose.gaze ?? [0, 0]

  return (
    <group name="pigeon">
      {sides.map((side, index) => (
        <group key={side}>
          <mesh ref={shin => { shins.current[index] = shin }} position={[side * 0.145, 0.11, 0.015]}>
            <cylinderGeometry args={[0.034, 0.041, 0.174, 7]} />
            <meshStandardMaterial color="#aa776c" roughness={0.95} />
          </mesh>
          <group ref={foot => { feet.current[index] = foot }} position-x={side * 0.145}>
            {[-1, 0, 1].map(toe => (
              <Plume key={toe} position={[toe * 0.038, 0.033, 0.065]} rotation={[0, toe * 0.3, 0]}
                scale={[0.022, 0.026, 0.077]} color="#b97e70" />
            ))}
          </group>
        </group>
      ))}
      <group ref={body} name="body">
        <Plume position={[0, 0.39, -0.095]} scale={[0.37, 0.3, 0.438]} color={color.body} />
        <Plume position={[0, 0.405, 0.13]} scale={[0.285, 0.246, 0.245]} color={color.breast} rotation={[-0.15, 0, 0]} />
        {[-1, 0, 1].map(feather => (
          <Plume
            key={feather}
            position={[feather * 0.085, 0.32, -0.445]}
            rotation={[-0.23, feather * 0.22, 0]}
            scale={[0.079, 0.057, 0.235]}
            color={color.wing}
          />
        ))}
        {sides.map(side => (
          <group key={side}>
            <group
              name={side === -1 ? 'leftWing' : 'rightWing'}
              ref={side === -1 ? leftWing : rightWing}
              position={[side * 0.255, 0.46, -0.028]}
              rotation={side === -1 ? pose.leftWing : pose.rightWing}
            >
              <Plume position={[side * 0.07, -0.055, -0.16]} scale={[0.124, 0.157, 0.333]} color={color.wing} rotation={[-0.26, side * -0.11, 0]} />
              <Plume position={[side * 0.145, -0.02, -0.116]} scale={[0.045, 0.113, 0.225]} color={color.body} rotation={[-0.23, 0, 0]} />
              <Plume position={[side * 0.162, -0.063, -0.181]} scale={[0.029, 0.046, 0.149]} color={color.face} rotation={[-0.35, 0, 0]} />
            </group>
          </group>
        ))}
        <Plume position={[0, 0.571, 0.093]} scale={[0.225, 0.174, 0.214]} color={color.neck} />
        <Plume position={[0, 0.539, 0.197]} scale={[0.182, 0.097, 0.131]} color={color.neckTip} />
        <group ref={head} name="head" position={pigeonHeadPivot} rotation={pose.head}>
          <Plume position={[0, 0.125, 0.028]} scale={[0.23, 0.224, 0.224]} color={color.face} />
          {sides.map((side, index) => (
            <Eye key={side} side={side} lid={eyelids[index]!} gaze={gaze} face={color.face}
              lidRef={lid => { lids.current[index] = lid }} pupilRef={pupil => { pupils.current[index] = pupil }} />
          ))}
          <Plume position={[0, 0.093, 0.238]} scale={[0.067, 0.043, 0.037]} color="#d8c6b9" />
          <mesh position={[0, 0.054, 0.301]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.68]}>
            <cylinderGeometry args={[0.013, 0.076, 0.176, 6]} />
            <meshStandardMaterial color="#c49b71" roughness={0.9} flatShading />
          </mesh>
          <group ref={jaw} name="lowerBeak" position={[0, 0.017, 0.219]} rotation-x={pose.jaw ?? 0}>
            <mesh position={[0, -0.007, 0.074]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.44]}>
              <cylinderGeometry args={[0.011, 0.061, 0.158, 6]} />
              <meshStandardMaterial color="#967959" roughness={0.92} flatShading />
            </mesh>
          </group>
          <group name="beakGrip" ref={gripRef} position={[0, 0.028, 0.363]} />
        </group>
      </group>
    </group>
  )
}
