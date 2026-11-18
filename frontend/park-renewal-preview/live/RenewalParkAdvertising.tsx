import { useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  CanvasTexture,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { A_FRAME } from '../../src/config/parkAdvertising'
import parkSignTeaserUrl from '../../src/features/advertisements/art/park-sign-teaser.webp'
import { beam, Instances, yawPart, type Part, type XYZ } from '../../src/world/art/Instances'
import { environmentFrame } from '../../src/world/environmentState'
import { groundSurfaceHeight } from '../groundSurface'
import { renewalAdSigns } from './advertisingPlacement'

const sites = renewalAdSigns.map(site => ({ ...site, y: groundSurfaceHeight(site.x, site.z) }))

// Independent of the ten-second building playlist.
const PARK_ADVERTISEMENT = {
  imageUrl: parkSignTeaserUrl,
  width: 1080,
  height: 1440,
} as const
const imageAspect = PARK_ADVERTISEMENT.width / PARK_ADVERTISEMENT.height
const posterGeometry = new PlaneGeometry(1, 1)
function buildAFrameParts() {
  const frameParts: Part[] = [], feet: Part[] = [], hinges: Part[] = []
  for (const site of sites) {
    const add = (list: Part[], part: Part) => {
      const [x, y, z] = part.p,
        c = Math.cos(site.yaw),
        s = Math.sin(site.yaw)
      part.p = [site.x + c * x + s * z, site.y + y, site.z - s * x + c * z]
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
  return { frameParts, feet, hinges }
}

const { frameParts, feet, hinges } = buildAFrameParts()

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

function useParkAdvertisementMaterial() {
  const texture = useLoader(TextureLoader, PARK_ADVERTISEMENT.imageUrl)
  const material = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = PARK_ADVERTISEMENT.width
    canvas.height = PARK_ADVERTISEMENT.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height)
    // Replace the poster's printed mouse button with the shortcut shown by the HUD.
    ctx.beginPath()
    ctx.roundRect(24, 1250, 476, 158, 79)
    ctx.fillStyle = '#073319'
    ctx.fill()
    ctx.fillStyle = '#ffe282'
    ctx.font = 'bold 78px "Malgun Gothic", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('E · 광고 보기', 262, 1329, 410)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 16
    return new MeshBasicMaterial({ map, toneMapped: false })
  }, [texture])
  useEffect(() => () => { material.map?.dispose(); material.dispose() }, [material])
  useFrame(() => material.color.setScalar(1 - environmentFrame.night * 0.35))
  return material
}

export function RenewalParkAdvertising() {
  const material = useParkAdvertisementMaterial()
  return (
    <group name="renewal-park-advertising">
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
      {sites.map((site) => (
        <group
          key={site.id}
          name={`a-frame-${site.id}`}
          position={[site.x, site.y, site.z]}
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
    </group>
  )
}
