import { useEffect, useMemo, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { MeshPhysicalMaterial } from 'three'
import { ChessPiece3D, createChessPieceGeometry, disposeChessPieceGeometry } from './ChessPiece3D'
import { createChessMaterials } from './materials'
import './checkmate.css'

function VictoryKing() {
  const resources = useMemo(() => ({ geometry: createChessPieceGeometry(), materials: createChessMaterials(),
    king: new MeshPhysicalMaterial({ color: '#eac478', metalness: .48, roughness: .27, clearcoat: .35 }) }), [])
  useEffect(() => () => { disposeChessPieceGeometry(resources.geometry); resources.materials.dispose(); resources.king.dispose() }, [resources])
  return <>
    <ambientLight intensity={1.2} /><hemisphereLight args={['#fff2cf', '#6c4828', 1.5]} />
    <directionalLight position={[3, 4, 5]} intensity={3} /><directionalLight position={[-3, 2, -1]} intensity={1.5} color="#ffe0a0" />
    <group position={[0, -.73, 0]}>
      <ChessPiece3D piece="K" geometry={resources.geometry} material={resources.king} detail={resources.materials.gold}
        eye={resources.materials.eye} mane={resources.materials.whiteMane} />
    </group>
  </>
}

/** The same public winner appears on both clients; the badge clarifies each player's own outcome. */
export function ChessCheckmateHero({ winnerName, isWinner }: { winnerName: string; isWinner?: boolean }) {
  return <section className="chess-checkmate" aria-label="체크메이트 승자" data-outcome={isWinner === undefined ? 'spectator' : isWinner ? 'win' : 'lose'}>
    <div className="chess-checkmate-art" aria-hidden="true">
      <div className="chess-checkmate-halo" />
      <svg className="chess-checkmate-laurel" viewBox="0 0 260 190" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M95 170C35 155 20 92 52 45M165 170c60-15 75-78 43-125" />
        {[0, 1, 2, 3, 4].map(i => <g key={i} transform={`translate(0 ${i * 22})`}>
          <path d={`M${44 - i * 2} ${55 - i * 3}q-28-18-20-29q26 1 20 29q23-3 23-23q-24-4-23 23`} />
          <path d={`M${216 + i * 2} ${55 - i * 3}q28-18 20-29q-26 1-20 29q-23-3-23-23q24-4 23 23`} />
        </g>)}
      </svg>
      <div className="chess-checkmate-king">
        <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [2, 1.3, 3.5], fov: 34 }} gl={{ alpha: true, antialias: true }}>
          <VictoryKing />
        </Canvas>
      </div>
      <div className="chess-checkmate-sparks">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--spark': i } as CSSProperties} />)}</div>
    </div>
    <p className="chess-checkmate-eyebrow">CHECKMATE</p>
    <h2>체크메이트!</h2>
    <p className="chess-checkmate-winner" role="status" aria-live="polite"><strong>{winnerName}</strong><span>승리</span></p>
    <p className="chess-checkmate-outcome">{isWinner === undefined ? '체크메이트로 승부가 결정됐어요.' : isWinner ? '나의 승리 · 상대 킹을 체크메이트했어요.' : '나의 패배 · 내 킹이 체크메이트됐어요.'}</p>
  </section>
}
