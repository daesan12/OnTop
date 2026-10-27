import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, MeshStandardMaterial, PlaneGeometry, Vector3, type Group } from 'three'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { useGame } from '../store'
import { avatars } from '../../network/worldClient'
import { createBackTexture } from './artwork'
import { oneCardHeldCount } from './heldHand'

const cardPlane = new PlaneGeometry(.17, .23)
let sharedBack: MeshStandardMaterial | undefined
const backMaterial = () => sharedBack ??= new MeshStandardMaterial({ map: createBackTexture(), roughness: .8, side: DoubleSide })

/** Avatar-local prop: both sides use generic backs, never an opponent's private cards. */
export function OneCardHeldHand({ userId, model }: { userId: string; model: ReturnType<typeof createCharacterRig> }) {
  const root = useRef<Group>(null)
  const points = useMemo(() => ({ left: new Vector3(), right: new Vector3() }), [])
  const count = useGame(s => {
    const o = s.game?.onecard, p = o?.players.find(p => p.userId === userId)
    return o?.status === 'PLAYING' && p?.active ? p.cardCount : 0
  })
  const visibleCount = Math.min(count, 10)
  const cards = useMemo(() => Array.from({ length: visibleCount }, (_, i) => {
    const offset = i - (visibleCount - 1) / 2
    return { x: offset * Math.min(.045, .3 / Math.max(1, visibleCount - 1)), y: -.003 * offset ** 2, angle: -offset * .09 }
  }), [visibleCount])
  useFrame(() => {
    const avatar = avatars.get(userId)
    if (!root.current) return
    root.current.visible = !!avatar && avatar.seatIndex >= 0 && oneCardHeldCount(userId, avatar.tableId) > 0
    if (!root.current.visible || !root.current.parent) return
    model.bones.hand_L.getWorldPosition(points.left); model.bones.hand_R.getWorldPosition(points.right)
    points.left.add(points.right).multiplyScalar(.5)
    root.current.parent.worldToLocal(points.left)
    root.current.position.copy(points.left)
    root.current.position.y += .07; root.current.position.z += .025
  })
  if (!count) return null
  return <group ref={root} name={`onecard-held-hand-${userId}`} rotation={[.35, 0, 0]}
    userData={{ cardCount: count, displayedCount: visibleCount }} dispose={null}>
    {cards.map((card, i) => <mesh key={i} geometry={cardPlane} material={backMaterial()} position={[card.x, card.y, i * .002]}
      rotation={[0, 0, card.angle]} />)}
  </group>
}
