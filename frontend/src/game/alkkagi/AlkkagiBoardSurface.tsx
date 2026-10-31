import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace } from 'three'

function createBoardTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1200
  const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height
  // 고정된 나무결과 평면 테두리. 렌더 장식은 충돌체나 새로운 경계를 만들지 않는다.
  ctx.fillStyle = '#603b27'; ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = i % 3 ? '#78492e' : '#4b2c1d'; ctx.lineWidth = i % 4 === 0 ? 2 : 1
    ctx.beginPath(); ctx.moveTo(0, i * 8); ctx.bezierCurveTo(w * .3, i * 8 - 9, w * .7, i * 8 + 8, w, i * 8 + 1); ctx.stroke()
  }
  const margin = 36
  const wood = ctx.createLinearGradient(0, 0, w, h)
  wood.addColorStop(0, '#dcb77c'); wood.addColorStop(.45, '#ebcf98'); wood.addColorStop(1, '#cca468')
  ctx.fillStyle = wood; ctx.fillRect(margin, margin, w - margin * 2, h - margin * 2)
  ctx.save(); ctx.beginPath(); ctx.rect(margin, margin, w - margin * 2, h - margin * 2); ctx.clip()
  for (let i = 0; i < 230; i++) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(112,68,28,${i % 5 === 0 ? .075 : .032})`; ctx.lineWidth = i % 7 === 0 ? 2 : 1
    for (let y = 0; y <= h; y += 12) {
      const x = i * 5 + Math.sin(y / 150 + i * .53) * 8 + Math.sin(y / 47 + i * .2) * 1.7
      if (!y) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = '#b78b4b'; ctx.lineWidth = 2; ctx.strokeRect(12, 12, w - 24, h - 24)
  ctx.strokeStyle = '#f6dfab'; ctx.lineWidth = 2; ctx.strokeRect(33, 33, w - 66, h - 66)
  ctx.strokeStyle = '#946b3d'; ctx.lineWidth = 3; ctx.strokeRect(38, 38, w - 76, h - 76)
  const x = (v: number) => (v / 9 + .5) * w, y = (v: number) => (v / 10 + .5) * h
  ctx.strokeStyle = '#76532f'; ctx.lineWidth = 1.9
  const line = (a: number, b: number, c: number, d: number) => { ctx.beginPath(); ctx.moveTo(x(a), y(b)); ctx.lineTo(x(c), y(d)); ctx.stroke() }
  for (let i = -4; i <= 4; i++) line(i, -4.5, i, 4.5)
  for (let i = 0; i < 10; i++) line(-4, i - 4.5, 4, i - 4.5)
  ctx.lineWidth = 3; ctx.strokeRect(x(-4), y(-4.5), x(4) - x(-4), y(4.5) - y(-4.5))
  // 궁성 대각선은 표면 무늬이며 알 배치·이동 규칙과 무관하다.
  ctx.lineWidth = 1.6
  for (const sign of [-1, 1]) { line(-1, sign * 2.5, 1, sign * 4.5); line(1, sign * 2.5, -1, sign * 4.5) }
  ctx.fillStyle = '#e5c17f'
  for (const [cx, cy] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore()
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}

/** 기존9×10·윗면Y=0과 포인터 평면을 유지한다. 아래 받침은 렌더 전용이다. */
export function AlkkagiBoardSurface({ onPointerDown, onPointerMove }: {
  onPointerDown(event: ThreeEvent<PointerEvent>): void; onPointerMove(event: ThreeEvent<PointerEvent>): void
}) {
  const map = useMemo(createBoardTexture, [])
  useEffect(() => () => map.dispose(), [map])
  return <group>
    <mesh position={[0, -.141, 0]} receiveShadow raycast={() => {}}>
      <boxGeometry args={[9, .28, 10]} /><meshStandardMaterial color="#754a2c" roughness={.62} />
    </mesh>
    <mesh position={[0, -.32, 0]} raycast={() => {}}>
      <boxGeometry args={[8.84, .08, 9.84]} /><meshStandardMaterial color="#38271c" roughness={.75} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
      <planeGeometry args={[9, 10]} /><meshStandardMaterial map={map} roughness={.78} metalness={0} />
    </mesh>
  </group>
}
