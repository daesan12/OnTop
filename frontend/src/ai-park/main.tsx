import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../park/ParkPage'
import { useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'
import { exchangeCallbackCode } from '../auth/authFlow'
import { openFeedback } from '../features/feedback/controller'
import { useFeedbackState } from '../features/feedback/state'
import { useWorldAi } from '../features/ai/worldAi'
import { CompanionPanel } from './CompanionPanel'
import {JokeContestPanel} from './JokeContestPanel'
import {useDisplayGame} from '../game/displayGame'
import '../styles.css'

function Controls() {
  const attempted=useRef(false), state=useSession(), [notice,setNotice]=useState(''), [mode,setMode]=useState('모드 확인 중')
  const feedbackOpen=useFeedbackState(s => s.open)
  const npcGame=useDisplayGame(s=>!!s.localPractice)
  const [inspection,setInspection]=useState('')
  const policeAction=useWorldAi(s => s.npcs[0]?.action)
  useEffect(() => {
    if(state.status!=='connected' || !state.roomId) return
    if(state.sessionId!=='101'){setMode('일반 테스트 계정 · 검수 상태는 A에서 확인');setInspection('');return}
    let active=true, timer:ReturnType<typeof setTimeout> | undefined
    const load=async () => {
      try {
        const value=await parkRuntime.requestJSON('/local/ai/status')
        if(!active) return
        if(value && typeof value==='object' && 'mode' in value && typeof value.mode==='string') setMode(value.mode)
        if(value && typeof value==='object' && 'worker' in value && value.worker && typeof value.worker==='object') {
          const worker=value.worker
          if('pending' in worker && typeof worker.pending==='number' && 'oldestPendingAgeMs' in worker && typeof worker.oldestPendingAgeMs==='number')
            setInspection(`검수 대기 ${worker.pending}개 · 최장 ${(worker.oldestPendingAgeMs/1000).toFixed(1)}초 · ${'lastError' in worker && worker.lastError?'검수 오류 · 재시도 대기':'검수 정상'}`)
        }
        timer=setTimeout(() => void load(),2000)
      } catch { if(active) { setMode('상태는 A 화면에서 확인'); setInspection('') } }
    }
    void load()
    return () => { active=false; clearTimeout(timer) }
  },[state.status,state.roomId,state.sessionId])
  useEffect(() => {
    if(attempted.current || state.roomId || state.status!=='connected' || state.pending || !state.channels.length) return
    attempted.current=true; void parkRuntime.selectChannel('channel-1')
  },[state.status,state.pending,state.roomId,state.channels.length])
  const act=async (path:string) => {
    try { await parkRuntime.requestJSON('/local/ai/'+path,{method:'POST'}); setNotice('요청했어요.') }
    catch { setNotice('공원 연결과 관리자 역할을 확인해주세요.') }
  }
  return <nav aria-label="공원 AI 로컬 검수" hidden={feedbackOpen||npcGame} style={{position:'fixed',top:80,left:8,zIndex:80,background:'#fff8df',padding:8,borderRadius:8}}>
    <strong>AI 공원 · 테스트 계정 · 저장소 대역 · {mode}</strong> · <a href="?role=red" target="_blank">A</a> · <a href="?role=green" target="_blank">B</a> · <a href="?role=viewer" target="_blank">C</a>
    {inspection && <span> · {inspection}</span>}
    <span> 경찰: {policeAction==='PATROL'?'순찰 중':policeAction==='RESPOND'?'출동 중':policeAction==='TALK'?'안내 중':['RETURN','RETURN_JUMP'].includes(policeAction??'')?'순찰 복귀 중':policeAction==='RETURN_WAIT'?'복귀 경로 확인 중':policeAction==='WAITING_PATH'?'경로 확인 중':policeAction==='WAITING_TELEPORT'?'순간이동 준비':policeAction==='TELEPORT_WARNING'?'순간이동 경고':'준비 중'}</span>
    <button onClick={() => void act('feedback-position')}>소리함 앞으로</button>
    <button onClick={() => void act('table-position')}>오목 테이블 앞으로</button>
    <button onClick={() => void act('jumpmap-position')}>점프맵 위 검수</button>
    <button onClick={() => void act('roof-position')}>높은 곳 검수</button>
    <button onClick={() => setNotice(openFeedback()?'소리함을 열었어요.':'소리함 앞으로 이동한 뒤 열린 창을 닫고 다시 눌러주세요.')}>소리함 열기</button>
    <button disabled={state.sessionId!=='101'} onClick={() => void act('flush')}>지금 검수</button>
    <button disabled={state.sessionId!=='101'} onClick={() => void act('digest')}>일반 제보 요약</button><span role="status">{notice}</span>
  </nav>
}
async function boot() {
  if(!import.meta.env.DEV || !['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('로컬 검수 전용 화면입니다.')
  const role=new URLSearchParams(location.search).get('role') ?? 'red'
  const response=await fetch('/dev/alkkagi-park/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})})
  if(!response.ok) throw new Error('AI 공원 서버 연결을 확인해주세요.')
  const {exchangeCode}=await response.json()
  location.hash=new URLSearchParams({exchange_code:exchangeCode}).toString()
  await exchangeCallbackCode()
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
      onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <Controls />
    <CompanionPanel />
    <JokeContestPanel />
  </>)
}
void boot().catch(() => { document.getElementById('root')!.textContent='AI 공원 서버를 실행한 뒤 다시 열어주세요.' })
