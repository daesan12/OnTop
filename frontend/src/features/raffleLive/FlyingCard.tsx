import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import type { Mesh } from 'three'
import { LIVE_LAYOUT } from './machineArt'
import { fitFont, roundRect, useCanvasPanel } from './parts'
import type { LiveScene } from './reel'
import { BOARD_H, BOARD_W, boardCellRect } from './ResultBoard'

const CARD_W = 512, CARD_H = 128
const ease = (u: number) => u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2

function drawCard(c: CanvasRenderingContext2D, w: number, h: number, name: string) {
  c.clearRect(0, 0, w, h)
  roundRect(c, 4, 4, w - 8, h - 8, h * .36)
  c.fillStyle = '#ffd56a'
  c.fill()
  c.lineWidth = 6
  c.strokeStyle = '#a8701c'
  c.stroke()
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  fitFont(c, name, h * .48, w * .86)
  c.fillStyle = '#3b2414'
  c.fillText(name, w / 2, h / 2 + 2)
}

/** 강조가 끝나면 당첨자 닉네임 카드가 이름 창에서 결과판의 해당 칸으로 날아간다. */
export function FlyingCard({ scene }: { scene: RefObject<LiveScene | null> }) {
  const mesh = useRef<Mesh>(null)
  const panel = useCanvasPanel(CARD_W, CARD_H)
  useFrame(() => {
    const live = scene.current, card = mesh.current
    if (!card) return
    const f = live?.frame, status = live?.status
    if (!live || !f || !status || f.fly < 0 || !f.result || status.currentSlotIndex === null) {
      card.visible = false
      return
    }
    const rect = boardCellRect(live.cells, status.currentSlotIndex)
    if (!rect) {
      card.visible = false
      return
    }
    if (panel.key !== f.result) {
      panel.key = f.result
      drawCard(panel.context, CARD_W, CARD_H, f.result)
      panel.texture.needsUpdate = true
    }
    const { position: [bx, , bz], yaw, face } = LIVE_LAYOUT.board
    const [fw, fh] = face.size
    const lx = (rect.x + rect.w / 2) / BOARD_W * fw - fw / 2
    const ly = face.position[1] + fh / 2 - (rect.y + rect.h / 2) / BOARD_H * fh
    const lz = face.position[2] + .08
    const tx = bx + lx * Math.cos(yaw) + lz * Math.sin(yaw), ty = ly, tz = bz - lx * Math.sin(yaw) + lz * Math.cos(yaw)
    const [sx, sy, sz] = LIVE_LAYOUT.display.position
    const u = ease(f.fly), arc = Math.sin(Math.PI * f.fly)
    card.visible = true
    card.position.set(sx + (tx - sx) * u, sy + (ty - sy) * u + arc * .9, sz + .12 + (tz - sz - .12) * u + arc * .8)
    card.rotation.set(0, yaw * u, 0)
    const w = 2.4 + (rect.w / BOARD_W * fw - 2.4) * u, h = .6 + (rect.h / BOARD_H * fh - .6) * u
    card.scale.set(w, h, 1)
  })
  return <mesh ref={mesh} name="raffle-live-flying-card" visible={false} renderOrder={3}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial map={panel.texture} transparent toneMapped={false} />
  </mesh>
}
