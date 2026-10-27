import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, MeshStandardMaterial, Object3D, PlaneGeometry, Vector3, type Group, type InstancedMesh } from 'three'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { useGame } from '../store'
import { avatars } from '../../network/worldClient'
import { createBackTexture } from './artwork'
import { heldCardPose, oneCardHeldCount } from './heldHand'

const cardPlane = new PlaneGeometry(.17, .23)
let sharedBack: MeshStandardMaterial | undefined
const backMaterial = () => sharedBack ??= new MeshStandardMaterial({ map: createBackTexture(), roughness: .8, side: DoubleSide })

/** Avatar-local prop: both sides use generic backs, never an opponent's private cards. */
export function OneCardHeldHand({ userId, model }: { userId: string; model: ReturnType<typeof createCharacterRig> }) {
  const root = useRef<Group>(null)
  const mesh = useRef<InstancedMesh>(null)
  const points = useMemo(() => ({ left: new Vector3(), right: new Vector3() }), [])
  const transform = useMemo(() => new Object3D(), [])
  const count = useGame(s => {
    const o = s.game?.onecard, p = o?.players.find(p => p.userId === userId)
    return o?.status === 'PLAYING' && p?.active ? p.cardCount : 0
  })
  const hasCards = count > 0
  useLayoutEffect(() => { const instance = mesh.current; return () => instance?.dispose() }, [hasCards])
  useLayoutEffect(() => {
    const instance = mesh.current
    if (!instance) return
    for (let i = 0; i < count; i++) {
      const card = heldCardPose(i, count)
      transform.position.set(card.x, card.y, card.z); transform.rotation.set(0, 0, card.angle); transform.updateMatrix()
      instance.setMatrixAt(i, transform.matrix)
    }
    instance.count = count; instance.instanceMatrix.needsUpdate = true; instance.computeBoundingSphere()
  }, [count, transform])
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
    userData={{ cardCount: count, displayedCount: count }} dispose={null}>
    <instancedMesh ref={mesh} name={`onecard-held-cards-${userId}`} args={[cardPlane, backMaterial(), 54]} dispose={null} />
  </group>
}
