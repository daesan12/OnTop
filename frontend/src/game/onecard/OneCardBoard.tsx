import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { BoxGeometry, MeshStandardMaterial, Object3D, PlaneGeometry, type Group, type InstancedMesh } from 'three'
import { TABLE_SEATS, type TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import type { Card, OneCard } from './protocol'
import { createBackTexture, createFaceTexture, createFeltTexture } from './artwork'

// Original generic artwork, generated locally. Only the approved public top card gets a texture.
const face = new PlaneGeometry(.3, .43), slab = new BoxGeometry(1, 1, 1)
const paper = new MeshStandardMaterial({ color: '#eee4cc', roughness: .9 }), back = new MeshStandardMaterial({ color: '#335f6d', roughness: .9 })
const matBase = new BoxGeometry(1.85, .022, 1.34), feltPlane = new PlaneGeometry(1.79, 1.28)
const deckBack = new PlaneGeometry(.3, .43)
const wood = new MeshStandardMaterial({ color: '#bfa16a', metalness: .25, roughness: .55 })
// Module-owned artwork is allocated only when a One Card table is shown and reused on remount.
let sharedArtwork: { felt: MeshStandardMaterial; back: MeshStandardMaterial } | undefined
function tableArtwork() {
  return sharedArtwork ??= {
    felt: new MeshStandardMaterial({ map: createFeltTexture(), roughness: 1 }),
    back: new MeshStandardMaterial({ map: createBackTexture(), roughness: .8 }),
  }
}
function PublicCard({ card, surfaceY }: { card: Card; surfaceY: number }) {
  const root = useRef<Group>(null), progress = useRef(1)
  const texture = useMemo(() => createFaceTexture(card), [card.id, card.rank, card.suit])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture, roughness: .9 }), [texture])
  useEffect(() => { progress.current = 0; return () => { material.dispose(); texture.dispose() } }, [texture, material])
  useFrame((_, delta) => {
    if (!root.current || progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta * 3.2)
    const t = 1 - (1 - progress.current) ** 3
    root.current.position.y = surfaceY + Math.sin(t * Math.PI) * .09
    root.current.position.z = (1 - t) * .26; root.current.rotation.y = (1 - t) * -.28
  })
  return <group ref={root} name="onecard-public-top" position={[.23, surfaceY, 0]} scale={[.8, 1, .8]} userData={{ cardId: card.id }} dispose={null}>
    <mesh geometry={slab} material={paper} scale={[.3, .006, .43]} />
    <mesh geometry={face} material={material} position={[0, .004, 0]} rotation={[-Math.PI / 2, 0, 0]} />
  </group>
}
function CardBacks({ players, surfaceY }: { players: OneCard['players']; surfaceY: number }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => { const instances = mesh.current!; return () => instances.dispose() }, [])
  useLayoutEffect(() => {
    const instances = mesh.current!, transform = new Object3D(); let index = 0
    players.forEach((p, i) => {
      if (!p.active) return
      const count = Math.min(p.cardCount, 12), seat = TABLE_SEATS[i]!, angle = Math.atan2(seat.x, seat.z), distance = i < 2 ? .51 : .73
      for (let n = 0; n < count; n++) {
        const offset = (n - (count - 1) / 2) * .045
        transform.position.set(Math.sin(angle) * distance + Math.cos(angle) * offset, surfaceY + n * .003, Math.cos(angle) * distance - Math.sin(angle) * offset)
        transform.rotation.set(0, angle, 0); transform.scale.set(.096, .002, .144); transform.updateMatrix()
        instances.setMatrixAt(index++, transform.matrix)
      }
    })
    instances.count = index; instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere()
  }, [players, surfaceY])
  return <instancedMesh ref={mesh} name="onecard-public-card-backs" args={[slab, back, 48]} dispose={null} />
}
export function OneCardBoard({ anchor }: { anchor: TableAnchor }) {
  // Deliberately subscribe to public data only. No private hand reaches the scene or shared textures.
  const state = useGame(useShallow(s => ({ onecard: s.game?.onecard, role: s.game?.role }))), session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId, tableStates: s.tableStates })))
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = state?.onecard && !!binding && (state.role === 'PLAYER' ? session.tableId : session.watchedTableId) === binding.tableId
  const selected = !!binding && session.tableStates[binding.tableId]?.gameCode === 'ONE_CARD'
  if (!relevant && !selected) return null
  const o = relevant ? state.onecard : null
  const drawCount = o?.drawCount ?? 1, height = Math.max(.012, drawCount * .001)
  const mainPavilion = anchor.pavilionId === 'P0', deckY = mainPavilion ? 1.064 + height / 2 : 1.112
  const art = tableArtwork()
  return <group name="onecard-table" dispose={null}>
    <group name="onecard-felt-mat">
      {!mainPavilion && <mesh geometry={matBase} material={wood} position={[0, 1.075, 0]} />}
      <mesh geometry={feltPlane} material={art.felt} position={[0, mainPavilion ? 1.07 : 1.088, 0]}
        scale={mainPavilion ? [.91, .89, 1] : 1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
    {drawCount > 0 && <group name={o ? 'onecard-draw-deck' : 'onecard-preparation-prop'} position={[-.28, 0, 0]} scale={[.8, 1, .8]}><mesh geometry={slab} material={paper} position={[0, deckY, 0]} scale={[.3, height, .43]} />
      <mesh geometry={deckBack} material={art.back} position={[0, deckY + height / 2 + .006, 0]} rotation={[-Math.PI / 2, 0, 0]} /></group>}
    {o && <><PublicCard card={o.topCard} surfaceY={mainPavilion ? 1.078 : 1.112} /><CardBacks players={o.players} surfaceY={mainPavilion ? 1.077 : 1.107} /></>}
  </group>
}
