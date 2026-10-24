import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, CanvasTexture, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, type Group, type InstancedMesh } from 'three'
import { TABLE_SEATS, type TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import type { Card, OneCard } from './protocol'
import { redCard, SUIT_GLYPH } from './presentation'

// Original generic artwork, generated locally. Only the approved public top card gets a texture.
const face = new PlaneGeometry(.3, .43), slab = new BoxGeometry(1, 1, 1)
const paper = new MeshStandardMaterial({ color: '#eee4cc', roughness: .9 }), back = new MeshStandardMaterial({ color: '#335f6d', roughness: .9 })
function faceTexture(card: Card) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 384
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f7f0da'; ctx.fillRect(0, 0, 256, 384)
  ctx.strokeStyle = '#d1c3a2'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 240, 368)
  ctx.fillStyle = redCard(card) ? '#ae393b' : '#243737'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `bold ${card.suit ? 48 : 27}px Georgia,serif`; ctx.fillText(card.suit ? card.rank : 'JOKER', 128, 55)
  ctx.fillText(card.suit ? card.rank : 'JOKER', 128, 326)
  ctx.font = '116px Georgia,serif'; ctx.fillText(card.suit ? SUIT_GLYPH[card.suit] : '✦', 128, 184)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
  return texture
}
function PublicCard({ card }: { card: Card }) {
  const root = useRef<Group>(null), progress = useRef(1)
  const texture = useMemo(() => faceTexture(card), [card.id, card.rank, card.suit])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture, roughness: .9 }), [texture])
  useEffect(() => { progress.current = 0; return () => { material.dispose(); texture.dispose() } }, [texture, material])
  useFrame((_, delta) => {
    if (!root.current || progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta * 3.2)
    const t = 1 - (1 - progress.current) ** 3
    root.current.position.y = 1.115 + Math.sin(t * Math.PI) * .09
    root.current.position.z = (1 - t) * .26; root.current.rotation.y = (1 - t) * -.28
  })
  return <group ref={root} name="onecard-public-top" position={[.23, 1.115, 0]} userData={{ cardId: card.id }} dispose={null}>
    <mesh geometry={slab} material={paper} scale={[.3, .006, .43]} />
    <mesh geometry={face} material={material} position={[0, .004, 0]} rotation={[-Math.PI / 2, 0, 0]} />
  </group>
}
function CardBacks({ players }: { players: OneCard['players'] }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => { const instances = mesh.current!; return () => instances.dispose() }, [])
  useLayoutEffect(() => {
    const instances = mesh.current!, transform = new Object3D(); let index = 0
    players.forEach((p, i) => {
      if (!p.active) return
      const count = Math.min(p.cardCount, 12), seat = TABLE_SEATS[i]!, angle = Math.atan2(seat.x, seat.z), distance = i < 2 ? .51 : .73
      for (let n = 0; n < count; n++) {
        const offset = (n - (count - 1) / 2) * .045
        transform.position.set(Math.sin(angle) * distance + Math.cos(angle) * offset, 1.108 + n * .003, Math.cos(angle) * distance - Math.sin(angle) * offset)
        transform.rotation.set(0, angle, 0); transform.scale.set(.12, .002, .18); transform.updateMatrix()
        instances.setMatrixAt(index++, transform.matrix)
      }
    })
    instances.count = index; instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere()
  }, [players])
  return <instancedMesh ref={mesh} name="onecard-public-card-backs" args={[slab, back, 48]} dispose={null} />
}
export function OneCardBoard({ anchor }: { anchor: TableAnchor }) {
  // Deliberately subscribe to public data only. No private hand reaches the scene or shared textures.
  const o = useGame(s => s.game?.onecard), role = useGame(s => s.game?.role), session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId })))
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  if (!o || !binding || (role === 'PLAYER' ? session.tableId : session.watchedTableId) !== binding.tableId) return null
  const height = Math.max(.012, o.drawCount * .001)
  return <group name="onecard-table" dispose={null}>
    {o.drawCount > 0 && <><mesh geometry={slab} material={paper} position={[-.28, 1.107 + height / 2, 0]} scale={[.3, height, .43]} />
      <mesh geometry={face} material={back} position={[-.28, 1.108 + height, 0]} rotation={[-Math.PI / 2, 0, 0]} /></>}
    <PublicCard card={o.topCard} /><CardBacks players={o.players} />
  </group>
}
