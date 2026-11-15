import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Mesh, Vector3 } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { factory } from '../../../park-renewal-preview/assetFactories'
import { Buildings } from '../../../park-renewal-preview/Buildings'
import { CityBackdrop, ParkEnvironment } from '../../../park-renewal-preview/CityBackdrop'
import { ScenicDetails } from '../../../park-renewal-preview/ScenicDetails'
import { characterUrls } from '../../world/art/characterAssets'
import { balloonScale, flightMap, startPoint } from './previewMap'
import { cameraDrag, isPassenger, occupancy, usePreview } from './previewStore'

const slots = [[-.65, .425, -.65], [.65, .425, -.65], [-.65, .425, .65], [.65, .425, .65]] as const
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
      {slots.map(([x, y, z], index) => <group key={index} position={[x * balloonScale, y * balloonScale, z * balloonScale]} rotation-y={Math.PI}>
        <primitive object={avatars[index]!} />
      </group>)}
    </group>
  </>
}

function ParkScene() {
  const [balloon] = useState(() => factory('balloon'))
  const balloonRef = useRef<Group>(null)
  const cameraGoal = useRef(new Vector3())
  const target = useRef(new Vector3())
  useEffect(() => () => {
    balloon.traverse(object => {
      if (!(object instanceof Mesh)) return
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
  }, [balloon])

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, .1)
    usePreview.getState().tick(dt, delta)
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
    <Buildings showDockedBalloon={false} />
    <group ref={balloonRef} scale={balloonScale} position={[flightMap.dock.x, flightMap.dock.y, flightMap.dock.z]}>
      <primitive object={balloon} />
    </group>
    <Suspense fallback={null}><Riders /></Suspense>
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
    <Canvas camera={{ position: [startPoint.x - 2.8, startPoint.y + 4.4, startPoint.z + 8.5], fov: 52, near: .1, far: 1500 }} dpr={[1, 1.5]}>
      <ParkScene />
    </Canvas>
  </div>
}
