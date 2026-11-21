import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, TextureLoader } from 'three'
import type { BangCard, BangState } from './protocol'
import { ART_INDEX } from './BangCard'
import { CARD_NAME, cardRank } from './presentation'

function CardMesh({ card, back = false, position, rotation = 0, scale = 1 }: { card?: BangCard; back?: boolean; position: [number, number, number]; rotation?: number; scale?: number }) {
  const atlas = useLoader(TextureLoader, '/art/bang/card-atlas.webp')
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 352
    const context = canvas.getContext('2d')!
    const index = back ? 23 : card ? ART_INDEX[card.kind] : 23
    const source = atlas.image as HTMLImageElement, w = source.width / 6, h = source.height / 4
    context.fillStyle = back ? '#6c3422' : '#e6c995'; context.fillRect(0, 0, 256, 352)
    context.drawImage(source, index % 6 * w, Math.floor(index / 6) * h, w, h, 12, back ? 0 : 54, 232, back ? 352 : 232)
    context.strokeStyle = '#72502f'; context.lineWidth = 7; context.strokeRect(5, 5, 246, 342)
    if (!back && card) {
      context.textAlign = 'center'; context.fillStyle = '#3c2819'; context.font = 'bold 26px "Malgun Gothic", sans-serif'
      context.fillText(CARD_NAME[card.kind], 128, 38, 224)
      context.font = 'bold 24px serif'; context.fillStyle = card.suit === 'HEARTS' || card.suit === 'DIAMONDS' ? '#8d3225' : '#38281b'
      context.fillText(cardRank(card), 128, 326)
    }
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; result.anisotropy = 4
    return result
  }, [atlas, card?.id, back])
  useEffect(() => () => texture.dispose(), [texture])
  return <group position={position} rotation={[0, rotation, 0]} scale={scale}>
    <mesh castShadow receiveShadow><boxGeometry args={[.82, .035, 1.13]} /><meshStandardMaterial color="#b58d57" roughness={.9} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]}><planeGeometry args={[.82, 1.13]} /><meshStandardMaterial map={texture} roughness={.83} /></mesh>
  </group>
}

function Bullet({ x, z, filled = true }: { x: number; z: number; filled?: boolean }) {
  return <group position={[x, .14, z]}>
    <mesh castShadow><cylinderGeometry args={[.055, .063, .24, 12]} /><meshStandardMaterial color={filled ? '#c79437' : '#4b3c2d'} metalness={.7} roughness={.3} /></mesh>
    <mesh position={[0, .15, 0]}><sphereGeometry args={[.055, 12, 8]} /><meshStandardMaterial color={filled ? '#b58543' : '#4b3c2d'} metalness={.7} roughness={.3} /></mesh>
  </group>
}

function Table({ state, ownId }: { state: BangState; ownId: string }) {
  const wood = useLoader(TextureLoader, '/art/farkle/walnut-albedo-v1.webp')
  const { camera, size } = useThree()
  useEffect(() => {
    const factor = Math.max(1, 1.35 / (size.width / size.height))
    camera.position.set(0, 11.5 * factor, 7.8 * factor); camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  const own = Math.max(0, state.players.findIndex(player => player.userId === ownId))
  return <>
    <color attach="background" args={['#1b110b']} />
    <ambientLight intensity={1.1} color="#ffe4b9" />
    <directionalLight position={[-4, 10, 4]} intensity={2.5} color="#ffdeb0" castShadow shadow-mapSize={[1024, 1024]} />
    <pointLight position={[6, 3, -4]} color="#ff9e45" intensity={18} distance={16} />
    <mesh position={[0, -.25, 0]} receiveShadow><cylinderGeometry args={[7.7, 7.8, .42, 96]} /><meshStandardMaterial map={wood} color="#8c6547" roughness={.88} /></mesh>
    <mesh position={[0, -.5, 0]}><cylinderGeometry args={[7.8, 7.8, .1, 96]} /><meshStandardMaterial color="#3b2415" roughness={.7} /></mesh>
    <CardMesh position={[-.65, .13, .25]} back scale={1.5} />
    {[0, 1, 2, 3, 4].map(i => <CardMesh key={i} position={[-.65 + i * .005, .04 + i * .013, .25]} back scale={1.5} />)}
    {state.topDiscard ? <CardMesh position={[1, .035, .25]} card={state.topDiscard} scale={1.5} rotation={-.06} /> : null}
    {state.players.map((player, index) => {
      const angle = ((index - own + state.players.length) % state.players.length) / state.players.length * Math.PI * 2
      const x = Math.sin(angle) * 4.5, z = Math.cos(angle) * 4.25
      return <group key={player.userId} position={[x, 0, z]} rotation={[0, angle, 0]}>
        {Array.from({ length: Math.min(7, player.cardCount) }, (_, i) => <CardMesh key={i} position={[(i - Math.min(6, player.cardCount - 1) / 2) * .16, .05 + i * .006, 0]} back rotation={(i - 2) * .035} />)}
        {Array.from({ length: player.maxHp }, (_, i) => <Bullet key={i} x={(i - (player.maxHp - 1) / 2) * .17} z={.9} filled={i < player.hp} />)}
        {player.equipment.map((card, i) => <CardMesh key={card.id} position={[(i - (player.equipment.length - 1) / 2) * .55, .035 + i * .003, -1.15]} scale={.65} card={card} />)}
      </group>
    })}
    <group position={[5.8, .35, -1.5]}>
      <mesh castShadow><cylinderGeometry args={[.32, .38, .8, 16]} /><meshStandardMaterial map={wood} color="#80552c" /></mesh>
      {[-.28, .28].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[.365, .365, .055, 16]} /><meshStandardMaterial color="#544c3c" metalness={.6} /></mesh>)}
    </group>
    <group position={[-5.9, .12, 1]} rotation={[0, .4, .8]}>
      {[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * .17, 0, 0]} castShadow><cylinderGeometry args={[.09, .09, .75, 12]} /><meshStandardMaterial color="#9f3528" roughness={.85} /></mesh>)}
    </group>
  </>
}

/** 별도 게임 카메라를 사용하며 unmount하면 기존 공원 카메라·아바타 시점이 그대로 복원된다. */
export function BangScene({ state, ownId }: { state: BangState; ownId: string }) {
  return <div className="bang-scene" aria-hidden="true"><Canvas shadows dpr={[1, 1.5]} camera={{ fov: 48, near: .1, far: 100 }}>
    <Suspense fallback={null}><Table state={state} ownId={ownId} /></Suspense>
  </Canvas></div>
}
