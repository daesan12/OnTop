import { useEffect,useState } from 'react'
import { JUMP_STAGES,JUMP_START,focusJumpStage } from './jumpCourse'
import { findJumpReturnPath,jumpReturnRoute } from './jumpNavigation'
import { jumpSession } from './jumpSimulation'
import type { PreviewView } from './PreviewCamera'

const time=(value:number)=>`${Math.floor(value/60)}:${Math.floor(value%60).toString().padStart(2,'0')}`
export function JumpHud({view,onView}:{view:PreviewView;onView:(v:PreviewView)=>void}) {
  const [,refresh]=useState(0)
  useEffect(()=>{const timer=setInterval(()=>refresh(v=>v+1),100);const key=(e:KeyboardEvent)=>{if(e.code==='F1'){e.preventDefault();jumpSession.manual=!jumpSession.manual;refresh(v=>v+1)}else if(e.code==='Escape'){jumpSession.manual=false;refresh(v=>v+1)}};window.addEventListener('keydown',key);return()=>{clearInterval(timer);window.removeEventListener('keydown',key);jumpSession.manual=false}},[])
  const s=jumpSession,review=view==='course',distance=Math.round(Math.hypot(s.x-JUMP_START.x,s.z-JUMP_START.z)),stage=Math.min(6,s.nextGate-1)
  return <>
    <section className="jump-tools" aria-label="점프맵 미리보기 도구">
      <button onClick={()=>onView(review?'jump':'course')}>{review?'출발 자리에서 체험':'전체 코스 살펴보기'}</button>
      <button aria-pressed={!s.muted} onClick={()=>{s.muted=!s.muted;refresh(v=>v+1)}}>효과음 {s.muted?'꺼짐':'켜짐'}</button>
      <button onClick={()=>{s.manual=true;refresh(v=>v+1)}}>F1 설명서</button>
      <small>FE 체험 · 보상 지급/기록 저장 없음 · 합성 효과음</small>
    </section>
    {review?<section className="jump-review" aria-label="점프맵 구간 둘러보기"><span>STONE TOWER CHALLENGE</span><h2>돌탑에서 호수까지</h2><p>7구간 · 발판 107개 · 엽전 문 6개<br/>최고 높이 약 46.5m</p>{JUMP_STAGES.map((g,i)=><button key={g.theme} onClick={()=>focusJumpStage(i)}><b>0{i+1}</b><strong>{g.name}<small>{g.count}개 · {g.asmr}</small></strong><em>+{g.reward}냥</em></button>)}</section>:<>
      {s.active&&<section className="jump-challenge" aria-label="점프맵 도전 상태"><small>{stage+1}구간 진행 중</small><h2>{JUMP_STAGES[stage]!.name}</h2><b>{s.y.toFixed(1)}<small> m</small></b><p>{time(s.elapsed)} · 최고 {s.maxHeight.toFixed(1)}m</p></section>}
      <section className="jump-wallet" aria-label="미리보기 엽전"><small>미리보기 예상 보상</small><strong>오늘 {s.today} / 100냥</strong><progress value={s.today} max={100}/><span>이번 판 +{s.coins}냥</span></section>
      {s.active&&<div className="jump-stage-strip" aria-label="점프맵 진행 구간">{JUMP_STAGES.map((g,i)=><div key={g.theme} className={i<stage?'passed':i===stage?'current':''}><b>{i+1} {g.name}</b><small>+{g.reward}냥</small></div>)}</div>}
      {!s.active&&distance<15&&!s.result&&<div className="jump-start-hint">첫 발판을 밟으면 시작해요.<br/><small>세이브 포인트 없음 · <kbd>Space</kbd> 점프 · <kbd>WASD</kbd> 이동</small></div>}
      {s.time<s.bannerUntil&&s.banner&&<div className="jump-banner" role="status">{s.banner}</div>}
      {s.result&&s.time-s.result.at<10&&<section className="jump-result" aria-label="점프맵 결과"><h2>{s.result.kind==='complete'?'완주!':s.result.kind==='water'?'호수에 빠졌어요':'떨어졌어요'}</h2><p>{s.result.kind==='complete'?`${time(s.result.time)} · ${s.result.best?'내 최고 기록!':`최고 ${time(s.bestTime)}`}`:`${s.result.stage}구간 통과 · 최고 ${s.maxHeight.toFixed(1)}m`}</p><p>이번 판 +{s.result.coins}냥 · 돌탑까지 {distance}m</p>{s.result.kind==='water'&&<small>마지막 연잎을 밟고 뛰어들어야 완주예요.</small>}{s.result.kind!=='complete'&&<button onClick={()=>{jumpReturnRoute.points=findJumpReturnPath(s);s.navigate=jumpReturnRoute.points.length>0;refresh(v=>v+1)}}>돌탑 길 안내</button>}</section>}
      {s.navigate&&<div className="jump-navigation"><b style={{display:'inline-block',transform:`rotate(${Math.atan2(JUMP_START.x-s.x,-(JUMP_START.z-s.z))+s.yaw}rad)`}}>↑</b> 돌탑 길 안내 중 · {distance}m <button onClick={()=>{s.navigate=false;refresh(v=>v+1)}}>안내 종료</button></div>}
      <div className="jump-crosshair" aria-hidden="true">+</div>
    </>}
    {s.manual&&<div className="jump-manual-backdrop"><section className="jump-manual" role="dialog" aria-modal="true" aria-label="돌탑 점프맵 설명서"><button aria-label="설명서 닫기" onClick={()=>{s.manual=false;refresh(v=>v+1)}}>×</button><small>FE PREVIEW</small><h2>돌탑 점프맵</h2><p>돌탑 첫 발판에 착지하면 시작합니다. 여섯 엽전 문을 차례로 지나 마지막 연잎에서 호수로 뛰어드세요.</p><div>{JUMP_STAGES.map((g,i)=><span key={g.theme}>{i+1}. {g.name}<b>+{g.reward}냥</b></span>)}</div><p>세이브 포인트는 없습니다. 떨어져도 지나온 구간의 예상 보상은 유지됩니다. 걸어서 돌아가 다시 도전하세요.</p><p><kbd>WASD</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>Space</kbd> 점프<br/>마우스 드래그로 시점 조절 · <kbd>F1 / Esc</kbd> 설명서 닫기</p><small>현재는 배치 검토를 위한 1인칭 체험입니다. 실제 엽전 지급·기록 저장·멀티플레이 및 서비스 이동 규칙은 연결하지 않았습니다. 효과음은 직접 합성한 임시 소리입니다.</small></section></div>}
  </>
}
