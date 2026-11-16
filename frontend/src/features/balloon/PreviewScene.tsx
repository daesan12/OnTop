import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { Buildings } from '../../../park-renewal-preview/Buildings'
import { CityBackdrop, ParkEnvironment } from '../../../park-renewal-preview/CityBackdrop'
import { ScenicDetails } from '../../../park-renewal-preview/ScenicDetails'
import { characterUrls } from '../../world/art/characterAssets'
import { balloonScale, flightMap, startPoint } from './previewMap'
import { cameraDrag, isPassenger, occupancy, usePreview } from './previewStore'
import { useBalloonModel } from './useBalloonModel'
import { balloonCanLook, CABIN_LOOK_HEIGHT, dragCabinCamera, setBalloonOrbit } from './cabinCamera'
import { CABIN_FLOOR_HEIGHT } from './cabin'

const slots = [[-.65, -.65], [.65, -.65], [-.65, .65], [.65, .65]] as const
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
      {slots.map(([x, z], index) => <group key={index} position={[x * balloonScale, CABIN_FLOOR_HEIGHT * balloonScale, z * balloonScale]} rotation-y={Math.PI}>
        <primitive object={avatars[index]!} />
      </group>)}
    </group>
  </>
}

function ParkScene() {
  const balloonRef = useRef<Group>(null)
  useBalloonModel(balloonRef)
  const cameraGoal = useRef(new Vector3())
  const target = useRef(new Vector3())

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, .1)
    usePreview.getState().tick(dt, delta)
    const { flight, walker, boarded } = usePreview.getState()
    const { x, y, z } = flight.position
    if (balloonRef.current) {
      balloonRef.current.visible = flight.phase !== 'removed'
      balloonRef.current.position.set(x, y, z)
    }

    const flying = balloonCanLook(flight.phase)
    if (flying && isPassenger) {
      const angle = cameraDrag.yaw
      const eye = cameraGoal.current.set(x + .7, y + CABIN_LOOK_HEIGHT, z + .65)
      target.current.set(eye.x + Math.sin(angle) * 12, eye.y - 1.2, eye.z - Math.cos(angle) * 12)
    } else if (flying) {
      setBalloonOrbit(flight.position, cameraGoal.current, target.current, true)
    } else if (flight.phase === 'landed' || flight.phase === 'removed') {
      cameraGoal.current.set(walker.x + 2, walker.y + 3.8, walker.z + 6)
      target.current.set(walker.x, walker.y + 1.15, walker.z - 2)
    } else {
      const focus = boarded ? flightMap.dock : walker
      cameraGoal.current.set(focus.x - 2.8, focus.y + 4.4, focus.z + 8.5)
      target.current.set(focus.x, focus.y + 2.5, focus.z - 7)
    }
    camera.position.lerp(cameraGoal.current, 1 - Math.exp(-7 * dt))
    camera.lookAt(target.current)
  })

  // The park scene uses positive frame priorities for environment updates.
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 1)

  return <>
    <ParkEnvironment night={false} />
    <CityBackdrop distanceLod />
    <directionalLight position={[-100, 190, 90]} intensity={2.2} color="#fff0d6" />
    <ScenicDetails />
    <Buildings showDockedBalloon={false} showBalloonWayfinding />
    <group ref={balloonRef} scale={balloonScale} position={[flightMap.dock.x, flightMap.dock.y, flightMap.dock.z]} />
    <Suspense fallback={null}><Riders /></Suspense>
  </>
}

export function PreviewScene() {
  const dragging = useRef<{ id: number; x: number; y: number } | null>(null)
  return <div className="balloon-scene" onPointerDown={event => {
    if (dragging.current || event.button !== 0 || !balloonCanLook(usePreview.getState().flight.phase)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }} onPointerMove={event => {
    const pointer = dragging.current
    if (!pointer || pointer.id !== event.pointerId || !balloonCanLook(usePreview.getState().flight.phase)) return
    const dx = event.clientX - pointer.x
    if (isPassenger) cameraDrag.yaw -= dx * .008
    else dragCabinCamera(dx, event.clientY - pointer.y)
    pointer.x = event.clientX
    pointer.y = event.clientY
  }} onLostPointerCapture={event => { if (dragging.current?.id === event.pointerId) dragging.current = null }}>
    <Canvas camera={{ position: [startPoint.x - 2.8, startPoint.y + 4.4, startPoint.z + 8.5], fov: 52, near: .1, far: 1500 }} dpr={[1, 1.5]}>
      <ParkScene />
    </Canvas>
  </div>
}
