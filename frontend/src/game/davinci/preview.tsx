import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DavinciScreen } from './DavinciScreen'
import type { CodeTile, DavinciHand, DavinciState } from './protocol'
import '../../styles.css'
import { Canvas } from '@react-three/fiber'
import { Tile } from './DavinciBoard'

function TileShowcase() {
  const samples = [{color:'BLACK' as const,value:6},{color:'WHITE' as const,value:9},{color:'BLACK' as const,value:-1},{color:'WHITE' as const,value:-1}]
  return <main style={{height:'100dvh',background:'#ded8c5',color:'#163d29',display:'flex',flexDirection:'column'}}>
    <header style={{padding:'16px 24px'}}><h1 style={{margin:0,fontSize:24}}>흑백수사 · 숫자패와 매화 조커</h1><p>원목 테두리 · 기와 먹색 / 상아색 · 동일한 창살 뒷면 · 에셋 검수</p></header>
    <div style={{flex:1,minHeight:250}}><Canvas camera={{position:[0,2.3,6.4],fov:38}} onCreated={({camera})=>camera.lookAt(0,.45,0)}>
      <color attach="background" args={['#ded8c5']}/><ambientLight intensity={2}/><directionalLight position={[2,6,4]} intensity={2.1}/>
      {samples.map((s,i)=><group key={i} position={[(i-1.5)*.95,0,0]}><Tile tile={{...s,id:`asset-${i}`,revealed:false}} hidden={false} faceUp={false} selected={false} clickable={false} scale={1.2} onClick={()=>{}}/></group>)}
      {(['BLACK','WHITE'] as const).map((color,i)=><group key={color} position={[(i-.5)*4.8,0,0]} rotation={[0,Math.PI,0]}><Tile tile={{id:`back-${i}`,color,value:null,revealed:false}} hidden faceUp={false} selected={false} clickable={false} onClick={()=>{}}/></group>)}
      <mesh position={[0,-.05,0]}><boxGeometry args={[5.6,.08,3.8]}/><meshStandardMaterial color="#31513c" roughness={1}/></mesh>
    </Canvas></div>
  </main>
}

/** 독립적인 2~4인 배치/접근성 검수. 규칙 판정·다인 통신 검수는 공원 엔트리와 BE 테스트에서 한다. */
function Preview() {
  const [count, setCount] = useState(4), [notice, setNotice] = useState('')
  const fixture = useMemo(() => {
    const deck: CodeTile[] = []
    for (const value of [...Array.from({ length: 12 }, (_, i) => i), -1]) {
      for (const color of ['BLACK', 'WHITE'] as const) deck.push({ id: `preview-${color}-${value}`, color, value, revealed: false })
    }
    const each = count === 4 ? 3 : 4
    const own = deck.slice(0, each)
    const players = Array.from({ length: count }, (_, seat) => ({ userId: String(101 * (seat + 1)), seat, active: true,
      forfeited: false, ready: true, tileCount: each, tiles: deck.slice(seat * each, (seat + 1) * each).map((t, i) => ({ ...t, value: seat === 1 && i === 0 ? t.value : null, revealed: seat === 1 && i === 0 })) }))
    const state: DavinciState = { gameCode: 'DAVINCI_CODE', status: 'PLAYING', stage: 'CONTINUE', version: 1,
      turnUserId: '101', turnDeadline: new Date(Date.now() + 120_000).toISOString(), endedAt: null, endReason: null, winnerUserIds: [], players,
      supply: deck.slice(count * each).map(({ id, color }) => ({ id, color })), lastEvent: null }
    const hand: DavinciHand = { userId: '101', tiles: own, pendingTile: null, validPositions: [], unplacedJokerIds: [] }
    return { state, hand }
  }, [count])
  return <DavinciScreen key={count} {...fixture} viewerId="101" names={{ '101': '온탑', '202': '봄바람', '303': '솔잎', '404': '달빛' }}
    enabled busy={false} error={notice} act={() => setNotice('화면 프리뷰예요. 실제 판정과 다인 플레이는 공원에서 확인해주세요.')}
    recover={() => setNotice('')} topActions={<><span>화면 프리뷰 · 서버 미연결</span>{[2, 3, 4].map(n => <button key={n} aria-pressed={count === n} onClick={() => { setCount(n); setNotice('') }}>{n}인</button>)}</>}
  />
}

if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('view') === 'tiles' ? <TileShowcase /> : <Preview />)
} else document.getElementById('root')!.textContent = '로컬 화면 검수 전용입니다.'
