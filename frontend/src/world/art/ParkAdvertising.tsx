import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Group,
} from 'three'
import { A_FRAME, A_FRAME_SIGNS, AD_BALLOON } from '../../config'
import { beam, Instances, yawPart, type Part, type XYZ } from './Instances'
import { environmentFrame } from '../environmentState'

import { parkAdvertisementUrl } from '../worldAssets'

// Independent of the ten-second building playlist. One image/texture shared by all eight faces.
const PARK_ADVERTISEMENT = {
  imageUrl: parkAdvertisementUrl,
  width: 2160,
  height: 2880,
} as const
const imageAspect = PARK_ADVERTISEMENT.width / PARK_ADVERTISEMENT.height
const posterGeometry = new PlaneGeometry(1, 1)
const frameParts: Part[] = [],
  feet: Part[] = [],
  hinges: Part[] = []
for (const site of A_FRAME_SIGNS) {
  const add = (list: Part[], part: Part) => {
    const [x, y, z] = part.p,
      c = Math.cos(site.yaw),
      s = Math.sin(site.yaw)
    part.p = [site.x + c * x + s * z, y, site.z - s * x + c * z]
    yawPart(part, site.yaw)
    list.push(part)
  }
  const bar = (from: XYZ, to: XYZ, size = 0.055) =>
    add(frameParts, beam(from, to, size, '#292e2d'))
  for (const x of [-0.62, 0.62])
    for (const side of [-1, 1]) {
      bar([x, 0.04, side * 0.44], [x * 0.87, 1.94, side * 0.035])
      add(feet, {
        p: [x, 0.025, side * 0.44],
        s: [0.09, 0.05, 0.09],
        c: '#131917',
      })
    }
  bar([-0.65, 1.94, 0], [0.65, 1.94, 0], 0.065)
  for (const z of [-1, 1])
    bar([-0.6, 0.3, z * 0.39], [0.6, 0.3, z * 0.39], 0.045)
  for (const x of [-0.58, 0.58]) {
    bar([x, 0.67, -0.29], [x, 0.67, 0.29], 0.028)
    add(
      hinges,
      beam([x - 0.03, 1.92, 0], [x + 0.03, 1.92, 0], 0.052, '#777c76'),
    )
  }
  for (const x of [-0.34, 0.34])
    bar(
      [x, 1.94, 0],
      [x, A_FRAME.panelY + A_FRAME.panelWidth / imageAspect / 2, 0],
      0.018,
    )
  for (const y of [
    A_FRAME.panelY - A_FRAME.panelWidth / imageAspect / 2,
    A_FRAME.panelY + A_FRAME.panelWidth / imageAspect / 2,
  ])
    bar([-0.51, y, 0], [0.51, y, 0], 0.024)
}
const bannerTop = AD_BALLOON.panelY + AD_BALLOON.panelWidth / imageAspect / 2
const bannerBottom = AD_BALLOON.panelY - AD_BALLOON.panelWidth / imageAspect / 2
const rig: Part[] = [
  beam([-1.68, bannerTop, 0], [1.68, bannerTop, 0], 0.035, '#bec6c2'),
  beam([-1.68, bannerBottom, 0], [1.68, bannerBottom, 0], 0.035, '#bec6c2'),
]
const ropes: Part[] = []
for (const side of [-1, 1]) {
  ropes.push(
    beam(
      [side * 0.64, 0.34, 0],
      [side * 1.55, bannerBottom, 0],
      0.012,
      '#9b9c8b',
    ),
  )
  ropes.push(
    beam(
      [side * 1.45, bannerTop, 0],
      [side * 1.48, AD_BALLOON.balloonY - 1.15, 0],
      0.018,
      '#cbd0bd',
    ),
  )
}

/** Two separate front-facing planes keep the text readable, never mirrored from behind. */
function Poster({
  width,
  y,
  material,
  name,
}: {
  width: number
  y: number
  material: MeshBasicMaterial
  name: string
}) {
  return (
    <>
      <mesh position={[0, y, 0]} name={`${name}-backing`}>
        <boxGeometry
          args={[width + 0.016, width / imageAspect + 0.016, 0.018]}
        />
        <meshStandardMaterial color="#e2e2d4" roughness={0.95} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          name="park-static-advertisement"
          onClick={name === 'air-balloon' ? (e) => {
            e.stopPropagation()
            if (e.delta < 5)
              window.dispatchEvent(new Event('ontap-open-pickus'))
          } : undefined}
          position={[0, y, side * 0.017]}
          rotation={[0, side < 0 ? Math.PI : 0, 0]}
          scale={[width, width / imageAspect, 1]}
          material={material}
          geometry={posterGeometry}
          userData={{
            slotId: name,
            face: side,
            imageUrl: PARK_ADVERTISEMENT.imageUrl,
            aspect: imageAspect,
          }}
          dispose={null}
        />
      ))}
    </>
  )
}

export function ParkAdvertising() {
  const texture = useLoader(TextureLoader, PARK_ADVERTISEMENT.imageUrl)
  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 16
    texture.needsUpdate = true
    return new MeshBasicMaterial({ map: texture, toneMapped: false })
  }, [texture])
  const air = useRef<Group>(null)
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => {
    // Small grounded sway keeps the tether endpoints attached; no React state updates.
    if (air.current)
      air.current.rotation.z = Math.sin(clock.elapsedTime * 0.45) * 0.009
    material.color.setScalar(1 - environmentFrame.night * 0.35)
  })
  return (
    <group
      name="park-advertising"
      userData={{
        assetId: 'original/park-a-frame',
        reference: 'advertisement_2.jpg',
      }}
    >
      <Instances
        parts={frameParts}
        shadow={false}
        material={<meshStandardMaterial metalness={0.55} roughness={0.48} />}
      >
        <boxGeometry />
      </Instances>
      <Instances parts={feet} shadow={false}>
        <boxGeometry />
      </Instances>
      <Instances
        parts={hinges}
        shadow={false}
        material={<meshStandardMaterial metalness={0.65} roughness={0.36} />}
      >
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </Instances>
      {A_FRAME_SIGNS.map((site) => (
        <group
          key={site.id}
          name={`a-frame-${site.id}`}
          position={[site.x, 0, site.z]}
          rotation={[0, site.yaw, 0]}
        >
          <Poster
            width={A_FRAME.panelWidth}
            y={A_FRAME.panelY}
            material={material}
            name={`a-frame-${site.id}`}
          />
        </group>
      ))}
      <group
        name="advertising-balloon"
        position={[AD_BALLOON.x, 0, AD_BALLOON.z]}
        rotation={[0, AD_BALLOON.yaw, 0]}
      >
        <group ref={air}>
          <Poster
            width={AD_BALLOON.panelWidth}
            y={AD_BALLOON.panelY}
            material={material}
            name="air-balloon"
          />
          <Instances
            parts={rig}
            shadow={false}
            material={<meshStandardMaterial metalness={0.45} roughness={0.4} />}
          >
            <cylinderGeometry args={[1, 1, 1, 8]} />
          </Instances>
          <Instances parts={ropes} shadow={false}>
            <cylinderGeometry args={[1, 1, 1, 6]} />
          </Instances>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 1.48, AD_BALLOON.balloonY, 0]}>
              <mesh scale={[1, 1.08, 1]}>
                <sphereGeometry args={[AD_BALLOON.balloonRadius, 24, 16]} />
                <meshStandardMaterial
                  color={side < 0 ? '#56b5d0' : '#b9d757'}
                  roughness={0.32}
                  metalness={0.06}
                />
              </mesh>
              <mesh position={[0, -1.2, 0]}>
                <coneGeometry args={[0.11, 0.23, 10]} />
                <meshStandardMaterial
                  color={side < 0 ? '#4491a8' : '#8dba44'}
                />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
