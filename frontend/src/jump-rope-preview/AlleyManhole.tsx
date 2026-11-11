import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, SRGBColorSpace, type Group } from 'three'
import type { DistractionPose } from './pigeonDistractionMotion'

export const manholeFootprint = { x: -1.25, z: 1.83, openingRadius: 0.332 }

const lidRadius = 0.333
const shaftRadius = 0.311
const segments = 40

function paintIronLid() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const center = 128

  const iron = ctx.createRadialGradient(102, 98, 14, center, center, center)
  iron.addColorStop(0, '#71736a')
  iron.addColorStop(0.7, '#62655d')
  iron.addColorStop(1, '#565951')
  ctx.fillStyle = iron
  ctx.fillRect(0, 0, 256, 256)

  function band(radius: number, tint: string, width: number, start = 0, end = 2 * Math.PI) {
    ctx.beginPath()
    ctx.arc(center, center, radius, start, end)
    ctx.lineWidth = width
    ctx.strokeStyle = tint
    ctx.stroke()
  }

  band(114, '#464a43', 4)
  band(109, '#818174', 2)
  band(93, '#494d46', 4)
  band(90, '#77786d', 2)

  ctx.save()
  ctx.beginPath()
  ctx.arc(center, center, 87, 0, 2 * Math.PI)
  ctx.clip()
  for (let offset = -72; offset <= 72; offset += 24) {
    const line = center + offset
    ctx.beginPath()
    ctx.moveTo(38, line)
    ctx.lineTo(218, line)
    ctx.moveTo(line, 38)
    ctx.lineTo(line, 218)
    ctx.lineWidth = 4
    ctx.strokeStyle = '#4e514a'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(38, line + 2.6)
    ctx.lineTo(218, line + 2.6)
    ctx.moveTo(line + 2.6, 38)
    ctx.lineTo(line + 2.6, 218)
    ctx.lineWidth = 1.25
    ctx.strokeStyle = '#87877a'
    ctx.stroke()
  }
  ctx.restore()

  for (const x of [25, 231]) {
    ctx.beginPath()
    ctx.roundRect(x - 4, center - 11, 8, 22, 3)
    ctx.fillStyle = '#3e413a'
    ctx.fill()
  }
  for (const [x, y, radius] of [[186, 209, 24], [205, 198, 18], [59, 59, 20], [91, 233, 13]]) {
    const patina = ctx.createRadialGradient(x, y, 0, x, y, radius)
    patina.addColorStop(0, '#875c42a0')
    patina.addColorStop(1, 'transparent')
    ctx.fillStyle = patina
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  band(109, '#b0aa904d', 2, 2.93, 3.49)
  band(114, '#9b715276', 3, 0.78, 1.18)
  band(119, '#7b573e72', 2, 3.87, 4.32)

  return canvas
}

export function AlleyManhole({ surfaceY, distractionPose }: {
  surfaceY: number
  distractionPose: RefObject<DistractionPose | null>
}) {
  const ironLid = useMemo(paintIronLid, [])
  const lidRef = useRef<Group>(null)
  useFrame(() => {
    const lid = lidRef.current
    if (!lid) return
    const pose = distractionPose.current
    if (pose?.kind === 'manhole') {
      lid.position.set(pose.lid.x, pose.lid.y, pose.lid.z)
      lid.rotation.set(pose.lid.pitch, pose.lid.yaw, pose.lid.roll)
    } else {
      lid.position.set(0, 0, 0)
      lid.rotation.set(0, 0, 0)
    }
  })

  return (
    <group name="alley-manhole" position={[manholeFootprint.x, surfaceY, manholeFootprint.z]} rotation-y={0.22}>
      <group name="alley-manhole-frame">
        <mesh position-y={-0.16}>
          <cylinderGeometry args={[shaftRadius, shaftRadius, 0.32, segments, 1, true]} />
          <meshStandardMaterial color="#32332b" roughness={1} side={BackSide} />
        </mesh>
        <mesh position-y={-0.315} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[shaftRadius, segments]} />
          <meshBasicMaterial color="#21231f" />
        </mesh>
        <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[shaftRadius, 0.36, segments]} />
          <meshStandardMaterial color="#41423a" roughness={1} />
        </mesh>
        <mesh position-y={0.002} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.357, 0.395, segments]} />
          <meshStandardMaterial color="#aaa598" roughness={1} />
        </mesh>
        <mesh position-y={0.005} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.34, 0.36, segments]} />
          <meshStandardMaterial color="#67675b" roughness={0.94} metalness={0.12} />
        </mesh>
      </group>
      {/* The lid's closed position and rotation are both zero in this group. */}
      <group ref={lidRef} name="alley-manhole-lid">
        <mesh position-y={-0.018}>
          <cylinderGeometry args={[lidRadius, lidRadius - 0.008, 0.044, segments]} />
          <meshStandardMaterial color="#4d4f45" roughness={0.94} metalness={0.14} />
        </mesh>
        <mesh position-y={0.005} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[lidRadius, segments]} />
          <meshStandardMaterial roughness={0.94} metalness={0.14}>
            <canvasTexture attach="map" args={[ironLid]} colorSpace={SRGBColorSpace} anisotropy={4} />
          </meshStandardMaterial>
        </mesh>
      </group>
    </group>
  )
}
