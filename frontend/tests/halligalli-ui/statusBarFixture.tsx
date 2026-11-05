import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { HalliStage } from '../../src/game/halligalli/HalliStage'
import { parseHalliGalli } from '../../src/game/halligalli/protocol'
import { halliPlayer, halliState } from '../fixtures/halligalli'
import '../../src/game/halligalli/halligalli.css'

type FixtureState = 'turn' | 'other' | 'last'

function hudScale() {
  if (window.innerWidth <= 900) return 1
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080)
}

function Fixture() {
  const query = new URLSearchParams(location.search)
  const playerCount = Math.min(4, Math.max(2, Number(query.get('players')) || 2))
  const state = (query.get('state') ?? 'turn') as FixtureState
  const ownName = query.get('name') ?? '나'
  const initialDraw = playerCount === 2 ? 27 : playerCount === 3 ? 18 : 13
  const drawCount = Math.max(0, Number(query.get('draw') ?? initialDraw))
  const faceUpCount = Math.max(0, Number(query.get('face') ?? 1))
  const [scale, setScale] = useState(hudScale)

  useEffect(() => {
    const update = () => setScale(hudScale())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const players = Array.from({ length: playerCount }, (_, index) => halliPlayer(index,
    index === 0
      ? { drawCount: state === 'last' ? 0 : drawCount, faceUpCount, cardCount: (state === 'last' ? 0 : drawCount) + faceUpCount }
      : {}))
  const halli = parseHalliGalli(halliState(playerCount, {
    turnUserId: state === 'other' ? '102' : '101',
    players,
    flipDeadline: new Date(Date.now() + 60_000).toISOString(),
  }))
  const names = Object.fromEntries(halli.players.map((player, index) =>
    [player.userId, index === 0 ? ownName : `참가자 ${index + 1}`]))

  return <main className="park-page" data-fixture={`${playerCount}-${state}`} style={{
    position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
    '--park-ui-scale': scale, '--park-edge': `${20 * scale}px`,
    background: 'radial-gradient(ellipse at 50% 48%, #897f68 0 17%, #536a49 48%, #26372b 100%)',
  } as CSSProperties}>
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '46%', width: '46vw', height: '32vh',
      transform: 'translate(-50%, -50%) perspective(500px) rotateX(12deg)', border: '18px solid #d4c9b1',
      borderRadius: 24, background: '#178454', boxShadow: '0 18px 45px #0008' }} />
    <section className="halligalli-panel" data-role="PLAYER" data-status="PLAYING" data-layout="stage" aria-label="과일 땡">
      <HalliStage halli={halli} gameId="fixture" viewerId="101" names={names}
        canFlip={state !== 'other'} canRing onFlip={() => undefined} onRing={() => undefined} keyHint />
    </section>
    <aside aria-label="fixture metadata" style={{ position: 'absolute', left: 18, top: 16, padding: '9px 13px',
      borderRadius: 8, color: '#fff', background: '#111b', font: '600 15px/1.4 Malgun Gothic, sans-serif' }}>
      {playerCount}인 · {state === 'turn' ? '내 차례' : state === 'last' ? '마지막 종 기회' : '상대 차례'}
    </aside>
  </main>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
