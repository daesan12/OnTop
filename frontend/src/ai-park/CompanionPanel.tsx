import {companionPath} from '../features/ai/serviceFeatures'
import {useEffect,useRef,useState} from 'react'
import {parkRuntime} from '../park/runtime/runtime'
import {useSession} from '../network/worldClient'
import {useCompanions,acceptCompanions,resetCompanionActors} from '../features/ai/companions'
import './companions.css'

export function CompanionPanel(){
 const connected=useSession(s=>s.status==='connected'),channel=useSession(s=>s.roomId),tableId=useSession(s=>s.tableId)
 const table=useSession(s=>s.tableStates[tableId]),own=useSession(s=>s.sessionId)
 const s=useCompanions(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[difficulty,setDifficulty]=useState('NORMAL'),[persona,setPersona]=useState('omok'),[question,setQuestion]=useState('')
 const previousGame=useRef('')
 useEffect(()=>{if(!connected||!channel){resetCompanionActors();useCompanions.setState({practice:null,observedPractice:null,practiceChat:null,practicePending:false,practiceError:'',reply:'',waitSeconds:-1});return}
  let active=true,timer:ReturnType<typeof setTimeout>
  const poll=async()=>{try{const value=await parkRuntime.requestJSON(companionPath('status'));if(active)acceptCompanions(value)}catch{if(active)useCompanions.setState({practice:null,observedPractice:null,practiceChat:null})}finally{if(active)timer=setTimeout(()=>void poll(),650)}}
  void poll();return()=>{active=false;clearTimeout(timer)}
 },[connected,channel])
 useEffect(()=>{const id=s.practice?.snapshot.gameId??'';if(id&&id!==previousGame.current){setOpen(false);setError('')}previousGame.current=id},[s.practice?.snapshot.gameId])
 const send=async(path:string,body:object)=>{if(busy)return;setBusy(true);setError('')
  try{const result=await parkRuntime.requestJSON(companionPath(path),{method:'POST',body:JSON.stringify(body)});if(result&&typeof result==='object'&&'message'in result)setError(String(result.message));const value=await parkRuntime.requestJSON(companionPath('status'));acceptCompanions(value);return true}catch{setError('처리하지 못했어요. 최신 판·차례·현재 좌석을 확인하고 다시 시도해주세요.');return false}finally{setBusy(false)}}
 const arriving=s.practice?.phase==='ARRIVING',g=s.practice?.snapshot,mine=String(g?.turnUserId)===own,ended=!!g?.endedAt
 const canInvite=!!tableId&&table?.gameCode==='OMOK'&&table.seats.filter(p=>p.userId).length===1
 const residentBusy=s.actors.some(a=>a.difficulty===difficulty&&['PLAY_OMOK','APPROACH_OMOK'].includes(a.action??''))
 const act=(kind:string,extra:object={})=>void send('action',{kind,gameId:g?.gameId,version:g?.version,actionId:crypto.randomUUID(),...extra})
 return <>
  <button className="ai-companion-launch" onClick={()=>setOpen(v=>!v)}>{s.practice?'주민과 오목':canInvite?'주민과 두기 · 난이도 선택':'주민 · 대화 / 오목'}</button>
  {open&&<section className="ai-companion-panel" role="dialog" aria-label="NPC 대화와 오목 연습">
   <header><strong>{s.practice?s.practice.name+'과 오목':'마을 주민'}</strong><button aria-label="NPC 창 닫기" onClick={()=>setOpen(false)}>닫기</button></header>
   <p>NPC전 0엽전 · 15×15 렌주 · 한 수 30초 · 무르기/무승부 제안 거절</p>
   {error&&<p role="alert">{error}</p>}
   {s.error&&<p role="alert">NPC 상태 갱신을 재시도하고 있어요. {s.error}</p>}
   {!s.practice?<>
    <p>{canInvite?s.autoPaused?'자동 초대를 멈췄어요. 다시 부르면 시작해요.':`혼자 대기하면 약 ${Math.max(0,s.waitSeconds)}초 후 보통 · 윤한수을 불러요.`:'테이블에 혼자 앉아 오목을 선택하면 NPC를 부를 수 있어요.'}</p>
    <label>상대 주민 <select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="EASY">쉬움 · 강잼민</option><option value="NORMAL">보통 · 윤한수</option><option value="HARD">어려움 · 박영감</option></select></label>
    <button disabled={busy||!canInvite||residentBusy} onClick={()=>void send('invite',{difficulty})}>주민과 두기</button>
    <p>주민이 뛰어와 앉으면 대결을 시작해요. 자동 초대 상대는 보통 난이도예요. {residentBusy&&'선택한 주민은 다른 대결 중이에요. 다른 주민을 선택해 주세요.'}</p><small>사람과의 경기 준비는 기존 대기실에서 진행하세요. {s.engine==='RAPFI'?'Rapfi 엔진 연결됨':'엔진 미설치 · 로컬 전술 대체'}</small>
   </>:<>
    <p role="status">{arriving?s.practice.name+'이(가) 뛰어오고 있어요. 잠시 기다려주세요.':ended?g?.winnerUserId?String(g.winnerUserId)===own?'내 승리 · 엽전 변동 없음':'NPC 승리 · 엽전 변동 없음':'무승부 · 엽전 변동 없음':s.practice.thinking?s.practice.name+'이(가) 생각 중…':mine?'내 차례 · 흑돌':'NPC 차례'}</p>
    <p>진행 {g?.board.moveCount}수 {!arriving&&g?.turnDeadline&&`· 제한 시각 ${new Date(g.turnDeadline).toLocaleTimeString('ko-KR')}`}</p>
    <p>공원 테이블의 오목판에서 돌을 놓아주세요. 차례와 남은 시간은 경기 화면에서 확인할 수 있어요.</p>
    <blockquote>{s.practice.speech}</blockquote>
    <small>{s.practice.speechSource} · {s.practice.analysisNote}</small>
    {s.practice.analysis.blackEstimate!=null&&<p>직전 국면 흑 평가 지표 {(s.practice.analysis.blackEstimate*100).toFixed(0)}% · 실제 승률 아님</p>}
    {arriving&&<button disabled={busy} onClick={()=>act('stop')}>주민 호출 취소</button>}
   </>}
   {s.commentary?.map(c=><section key={c.gameId} aria-label="주민 경기 해설"><strong>{c.name??'주민'} · 경기 해설</strong><blockquote>{c.speech}</blockquote><small>{c.source} · 국면 v{c.version} · {c.evaluation}</small></section>)}
   <form onSubmit={e=>{e.preventDefault();const draft=question;void send('talk',{persona,question:draft}).then(ok=>{if(ok)setQuestion(current=>current===draft?'':current)})}}>
    <label>박영감에게 <select value={persona} onChange={e=>setPersona(e.target.value)}><option value="guide">공원 안내 묻기</option><option value="omok">오목 이야기하기</option></select></label>
    <input aria-label="NPC에게 질문" maxLength={300} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="인사나 오목 규칙을 물어보세요"/>
    <button disabled={busy||!question.trim()}>말 걸기</button>
   </form>
   {s.reply&&<p role="status">{s.reply}<small>{s.replySource}</small></p>}
  </section>}
 </>
}
