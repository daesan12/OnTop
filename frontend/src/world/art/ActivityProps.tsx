import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { MINI_PROPS } from '../../config'
import { PropModel } from './PropModel'
import { vrBoothArt } from './activityPropGeometry'
import { CodeFishBreadCart } from './CodeFishBreadCart'
import { useSession } from '../../network/worldClient'
/** Original readable screen graphic; it is signage, not a playable VR screen. */
function ExperiencePanel({
  position,
  width,
  height,
  banner = false,
}: {
  position: [number, number, number]
  width: number
  height: number
  banner?: boolean
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = banner ? 1536 : 768
    const c = canvas.getContext('2d')!,
      w = canvas.width,
      h = canvas.height
    const sky = c.createLinearGradient(0, 0, w, h)
    sky.addColorStop(0, '#1e215d')
    sky.addColorStop(0.6, '#6445aa')
    sky.addColorStop(1, '#56bcd4')
    c.fillStyle = sky
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#d5d4ff'
    for (let i = 0; i < 45; i++) {
      const x = (Math.sin(i * 17.2) * 0.5 + 0.5) * w,
        y = (Math.cos(i * 7.1) * 0.5 + 0.5) * h * 0.7
      c.fillRect(x, y, 2 + (i % 3), 2 + (i % 3))
    }
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = ['#51449a', '#7276c5', '#a4a8df'][layer]
      c.beginPath()
      c.moveTo(0, h)
      for (let i = 0; i <= 8; i++)
        c.lineTo(
          (i * w) / 8,
          h * (0.72 - layer * 0.08) - Math.sin(i * 2.4 + layer) * h * 0.17,
        )
      c.lineTo(w, h)
      c.fill()
    }
    c.strokeStyle = '#acf5ff'
    c.lineWidth = 7
    c.beginPath()
    c.roundRect(w * 0.3, h * 0.35, w * 0.4, h * 0.14, 35)
    c.stroke()
    c.beginPath()
    c.moveTo(w * 0.45, h * 0.49)
    c.lineTo(w * 0.5, h * 0.46)
    c.lineTo(w * 0.55, h * 0.49)
    c.stroke()
    c.textAlign = 'center'
    c.fillStyle = '#fff'
    c.font = 'bold 130px "Malgun Gothic"'
    c.fillText('VR', w / 2, h * 0.23)
    c.font = 'bold 55px "Malgun Gothic"'
    c.fillText(banner ? '온탑 플레이존' : '새로운 공간으로', w / 2, h * 0.78)
    c.font = '35px "Malgun Gothic"'
    c.fillText('PC 점프맵 · 체험 안내', w / 2, h * 0.87)
    c.strokeStyle = '#b6b7f0'
    c.lineWidth = 6
    c.strokeRect(12, 12, w - 24, h - 24)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [banner])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
export function FishBreadCart() {
  const cart = MINI_PROPS[0]
  const [requested, setRequested] = useState(false)
  const requestedRef = useRef(false)
  useFrame(({ camera }) => {
    // One mount transition per page, never a state update on every frame.
    if (
      !requestedRef.current &&
      useSession.getState().status === 'connected' &&
      (camera.position.x - cart.x) ** 2 + (camera.position.z - cart.z) ** 2 <
        40 ** 2
    ) {
      requestedRef.current = true
      setRequested(true)
    }
  })
  return (
    <group
      name="fish-bread"
      position={[cart.x, 0, cart.z]}
      userData={{ assetId: 'user/repaired-fish-cart' }}
    >
      {requested && <CodeFishBreadCart />}
    </group>
  )
}
export function VrHanokBooth() {
  const hall = MINI_PROPS[1]
  return (
    <group
      name="vr-experience-hall"
      position={[hall.x, 0, hall.z]}
      userData={{ assetId: 'original/reference-vr-hanok' }}
    >
      <PropModel name="vr-hanok-model" art={vrBoothArt} />
      {[-3, 3].map((x) => (
        <ExperiencePanel
          key={x}
          position={[x, 2, -4.185]}
          width={5.4}
          height={2.5}
        />
      ))}
      {[-5.1, 5.1].map((x) => (
        <ExperiencePanel
          key={x}
          position={[x, 1.9, 3.7]}
          width={1.35}
          height={2.7}
          banner
        />
      ))}
    </group>
  )
}
