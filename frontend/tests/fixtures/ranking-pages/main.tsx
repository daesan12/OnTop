import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { rankingBoardArt, RankingBoardPanels } from '../../../src/layout-preview/RankingBoardModel'
import { RankingBoardDialog } from '../../../src/features/rankingBoard/RankingBoardDialog'
import { openRankingBoard, useRankingBoardEntry } from '../../../src/features/rankingBoard/model'
import { useRankingPages } from '../../../src/features/rankingBoard/pages'
import { useRankingPageCycle } from '../../../src/features/rankingBoard/pageCycle'
import { fetchParkRanking, parkRankingError } from '../../../src/features/rankingBoard/service'
import { beginRankingRefresh, completeRankingRefresh, failRankingRefresh, useRankingBoardFeed } from '../../../src/features/rankingBoard/state'
import '../../../src/features/parkMenus/parkMenus.css'

// Actual production widgets; only HTTP data/authentication is a local test fixture.
function refresh() {
  beginRankingRefresh()
  void fetchParkRanking(async path => {
    const response = await fetch(path)
    if (!response.ok) throw new Error('검수용 조회 실패')
    return response.json()
  }, new AbortController().signal).then(completeRankingRefresh).catch(error => failRankingRefresh(parkRankingError(error)))
}
function RenderReady() {
  useFrame(({ gl }) => { gl.domElement.dataset.rendered = 'true' })
  return null
}
function App() {
  const open = useRankingBoardEntry(s => s.open)
  const page = useRankingPages(s => s.boardPage)
  const ready = useRankingBoardFeed(s => !!s.snapshot)
  useRankingPageCycle(open)
  useEffect(refresh, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.code === 'KeyE' && !useRankingBoardEntry.getState().open) openRankingBoard() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <>
    <style>{`body{margin:0;background:#b6c5ab;font-family:'Malgun Gothic',sans-serif}#root{height:100vh}.qa-toolbar{position:absolute;z-index:2;top:20px;left:24px;padding:12px 18px;background:#254d3c;color:#fff5da;border:1px solid #c4a569;border-radius:9px}.qa-toolbar button{margin-left:16px;padding:9px 20px;border-radius:6px;background:#f3e2b5;color:#294735;border:0;font:inherit;cursor:pointer}.qa-note{position:absolute;bottom:18px;width:100%;text-align:center;color:#294735}`}</style>
    <div className="qa-toolbar">로컬 검수 · 실제 화면 컴포넌트 · 예시 기록 <span data-testid="board-page">{page + 1} / 2</span><button type="button" onClick={openRankingBoard}>E 자세히 보기</button></div>
    <Canvas orthographic camera={{ position: [0, 3, 12], zoom: 165 }} onCreated={({ camera }) => { camera.lookAt(0, 2.7, 0) }}>
      <RenderReady />
      <ambientLight intensity={2} />
      {Object.entries(rankingBoardArt).map(([key, geometry]) => <mesh key={key} geometry={geometry} dispose={null}><meshLambertMaterial vertexColors /></mesh>)}
      <RankingBoardPanels bothSides />
    </Canvas>
    <div className="qa-note" data-testid="ready">{ready ? '집계 준비 완료' : '집계 불러오는 중'} · 8초마다 자동 전환 · E 상세창은 수동 페이지</div>
    <RankingBoardDialog refresh={refresh} />
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
