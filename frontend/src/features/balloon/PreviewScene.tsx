import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createLowPolyBalloon } from '../../../park-renewal-preview/approved/열기구_로우폴리_1/asset.js'
import { createLowPolyStation } from '../../../park-renewal-preview/approved/탑승장_로우폴리_1/asset.js'
import { characterUrls } from '../../world/art/characterAssets'
import { DOCK, FLIGHT_LIMIT } from './flight'
import { cameraDrag, isPassenger, occupancy, usePreview } from './previewStore'

const slots = [[-.65, .38, -.65], [.65, .38, -.65], [-.65, .38, .65], [.65, .38, .65]] as const
const trees = Array.from({ length: 41 }, (_, index) => {
  const angle = index * 2.39996
  const radius = 16 + (index * 17 % 52)
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, size: 1.4 + (index % 5) * .32 }
}).filter(({ x, z }) => Math.abs(x) > 9 || z < 8 || z > 30)

function Riders() {
  const models = useLoader(ParkAssetLoader, characterUrls)
  const avatars = useMemo(() => Array.from({ length: 5 }, (_, index) => clone(models[index % models.length]!.scene)), [models])
  const walkerRef = useRef<Group>(null)
  const passengerRef = useRef<Group>(null)

  useFrame(() => {
    const { boarded, flight, walker } = usePreview.getState()
    if (walkerRef.current) {
      walkerRef.current.visible = !boarded
      walkerRef.current.position.set(walker.x, walker.y, walker.z)
    }
    if (passengerRef.current) {
      passengerRef.current.position.set(flight.position.x, flight.position.y, flight.position.z)
      passengerRef.current.visible = flight.phase !== 'removed' && flight.phase !== 'landed'
      passengerRef.current.children.forEach((child, index) => { child.visible = index < occupancy(boarded) })
    }
  })

  return <>
    <group ref={walkerRef} rotation-y={Math.PI}><primitive object={avatars[4]!} /></group>
    <group ref={passengerRef}>
      {slots.map(([x, y, z], index) => <group key={index} position={[x, y, z]} rotation-y={Math.PI}>
        <primitive object={avatars[index]!} />
      </group>)}
    </group>
  </>
}

function ParkTerrain() {
  return <>
    <mesh rotation-x={-Math.PI / 2} position-y={-.02}>
      <planeGeometry args={[210, 210]} /><meshStandardMaterial color="#8fa759" />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.005, 24]}>
      <planeGeometry args={[3.4, 26]} /><meshStandardMaterial color="#c8b88f" />
    </mesh>
    {trees.map(({ x, z, size }) => <group key={x} position={[x, 0, z]} scale={size}>
      <mesh position-y={.65}>
        <cylinderGeometry args={[.1, .16, 1.3, 5]} /><meshStandardMaterial color="#795638" />
      </mesh>
      <mesh position-y={1.55}>
        <icosahedronGeometry args={[.9, 1]} /><meshStandardMaterial color="#567843" flatShading />
      </mesh>
    </group>)}
    {[[-57, -44, 12], [14, -70, 18], [51, -62, 12], [-71, 18, 10], [69, 32, 16]].map(([x, z, h]) =>
      <mesh key={x} position={[x!, -3, z!]} scale={[24, h!, 17]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#789060" flatShading />
      </mesh>)}
  </>
}

function ParkScene() {
  const [station] = useState(() => createLowPolyStation({ quality: 'light', deckAccent: '#687a53' }))
  const [balloon] = useState(() => createLowPolyBalloon({ quality: 'light', accent: '#435b36', cream: '#ead4a5', decoration: 'simple' }))
  const balloonRef = useRef<Group>(null)
  const cameraGoal = useRef(new Vector3())
  const target = useRef(new Vector3())
  const boundary = usePreview(s => s.flight.atBoundary)
  useEffect(() => () => { station.dispose(); balloon.dispose() }, [station, balloon])

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, .1)
    usePreview.getState().tick(dt)
    const { flight, walker, boarded } = usePreview.getState()
    const { x, y, z } = flight.position
    if (balloonRef.current) {
      balloonRef.current.visible = flight.phase !== 'removed'
      balloonRef.current.position.set(x, y, z)
    }

    const flying = flight.phase === 'takeoff' || flight.phase === 'flying' || flight.phase === 'returning'
    if (flying && isPassenger) {
      const angle = cameraDrag.yaw
      cameraGoal.current.set(x + .7, y + 1.94, z + .65)
      target.current.set(x + Math.sin(angle) * 12, y - 2, z - Math.cos(angle) * 12)
    } else if (flying) {
      cameraGoal.current.set(x + 6, y + 5, z + 9)
      target.current.set(x, y + 1, z - 5)
    } else if (flight.phase === 'landed' || flight.phase === 'removed') {
      cameraGoal.current.set(walker.x + 2, walker.y + 3.8, walker.z + 6)
      target.current.set(walker.x, walker.y + 1.15, walker.z - 2)
    } else {
      const base = boarded ? 11 : walker.z
      cameraGoal.current.set(walker.x - 2.8, 3.2, base + 7.5)
      target.current.set(DOCK.x * .47, boarded ? 3.5 : 2.5, 2)
    }
    camera.position.lerp(cameraGoal.current, 1 - Math.exp(-7 * dt))
    camera.lookAt(target.current)
  })

  return <>
    <color attach="background" args={['#a5d0ed']} />
    <fog attach="fog" args={['#b5d1de', 64, 148]} />
    <hemisphereLight args={['#fff0d5', '#68794e', 2.2]} />
    <directionalLight position={[24, 32, 15]} intensity={2} />
    <ParkTerrain />
    <primitive object={station.group} />
    <group ref={balloonRef} position={[DOCK.x, DOCK.y, DOCK.z]}>
      <primitive object={balloon.group} />
    </group>
    <Suspense fallback={null}><Riders /></Suspense>
    {boundary ? <group>
      {[-FLIGHT_LIMIT, FLIGHT_LIMIT].map(edge => <group key={edge}>
        <mesh position={[edge, .03, 0]}>
          <boxGeometry args={[.22, .025, FLIGHT_LIMIT * 2]} /><meshBasicMaterial color="#e8bb59" />
        </mesh>
        <mesh position={[0, .03, edge]}>
          <boxGeometry args={[FLIGHT_LIMIT * 2, .025, .22]} /><meshBasicMaterial color="#e8bb59" />
        </mesh>
      </group>)}
    </group> : null}
  </>
}

export function PreviewScene() {
  const dragging = useRef<number | null>(null)
  return <div className="balloon-scene" onPointerDown={event => {
    if (!isPassenger || usePreview.getState().flight.phase !== 'flying') return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = event.clientX
  }} onPointerMove={event => {
    if (dragging.current === null) return
    cameraDrag.yaw += (dragging.current - event.clientX) * .008
    dragging.current = event.clientX
  }} onLostPointerCapture={() => { dragging.current = null }}>
    <Canvas camera={{ position: [-2.8, 3.2, 21.5], fov: 52, near: .1, far: 180 }} dpr={[1, 1.5]}>
      <ParkScene />
    </Canvas>
  </div>
}
