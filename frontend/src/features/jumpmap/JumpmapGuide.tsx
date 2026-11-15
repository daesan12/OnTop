import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput } from '../../world/inputOwnership'
import { JUMPMAP_ENABLED } from '../../park/mapSelection'
import { closeJumpmapGuide, jumpmapGuideScope, useJumpmapGuide } from './guideState'
import { useJumpmap } from './state'
import { DAILY_CAP, STAGES } from './activeCourse'
import { JumpmapRanking, type RankingLoader } from './JumpmapRanking'
import './jumpmapGuide.css'
import './jumpmapCompletion.css'
import './rewardFeedback.css'

const steps = [
  { title:'첫 발판에서 바로 출발', body:'첫 번째 돌을 밟으면 도전이 시작돼요. 이동과 점프를 이어가며 위로 올라가세요.' },
  { title:STAGES.length===10?'열 가지 하늘길 통과':'일곱 가지 하늘길 통과', body:STAGES.length===10?'관문을 순서대로 통과하세요. 연잎은 3초 뒤 떨어지고, 두더지는 잠깐 내려가요. 오르내리는 비둘기 다음은 고정 오리 발판이에요.':'석탑부터 오목돌·붕어빵·구름·청사초롱·방패연·연잎까지! 구간 문을 순서대로 지나가요.' },
  { title:STAGES.length===10?'오리를 지나 호수섬에서 완주':'마지막 연잎에서 완주', body:STAGES.length===10?'마지막 오리까지 밟고 호수섬에 도착하면 완주해요. 떨어져도 받은 엽전은 유지돼요.':'마지막 연잎을 밟으면 기록을 확인할 수 있어요. 떨어져도 받은 엽전은 유지되고 다시 도전할 수 있어요.' },
]
function StepIcon({ step }: { step:number }) {
  return <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {step===0 ? <><path d="M8 40h48M12 39V29h13V19h13V9h14v30M18 12l6-6m-5 0h5v5" /><path d="M7 21h5m-2-3v6" /></>
      : step===1 ? <><path d="M7 37h14V26h14V15h15" /><circle cx="12" cy="12" r="5" /><path d="m44 10 7 5-7 5M46 38l4-4 4 4-4 4Z" /></>
        : <><path d="M23 6h20v14c0 10-5 15-10 15s-10-5-10-15V6ZM23 10H13v5c0 9 6 12 12 12M43 10h10v5c0 9-6 12-12 12M33 35v8m-10 0h20" /><path d="m29 17 3 3 6-7" /></>}
  </svg>
}

/** 준비 화면은 설명만 한다. 닫기만으로 도전 시작·이동·보상 요청을 보내지 않는다. */
export function JumpmapGuideDialog({ onClose, loadRankings }: { onClose():void; loadRankings?: RankingLoader }) {
  const [rankingOpen, setRankingOpen] = useState(false)
  const rankingButton = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)
  const closeRanking = () => { returning.current = true; setRankingOpen(false) }
  useEffect(() => { clearRoamingInput(); return clearRoamingInput }, [])
  return createPortal(<div className="jm-guide-root">
    {rankingOpen ? <PaperPopup key="ranking" title="돌탑 타임어택 랭킹" label="돌탑 타임어택 랭킹"
      className="jm-completion-paper jm-ranking-paper" closeLabel="랭킹 닫기" onClose={closeRanking}>
      <JumpmapRanking load={loadRankings} onBack={closeRanking} backLabel="안내로 돌아가기" />
    </PaperPopup> : <PaperPopup key="guide" title="미니게임 · 준비 안내" label="돌탑 점프맵 준비 안내"
      className="jm-guide-paper" closeLabel="돌탑 안내 닫기" onClose={onClose} initialFocusRef={returning.current ? rankingButton : undefined}>
      <header className="jm-guide-intro">
        <div><span className="jm-guide-eyebrow">{STAGES.length===10?'공원 위, 열 구간의 하늘길':'공원 위, 일곱 구간의 하늘길'}</span><h2>돌탑 점프맵</h2><p>한 걸음, 한 번의 점프로<br />{STAGES.length===10?'오리를 따라 호수섬까지 가 볼까요?':'마지막 연잎까지 올라가 볼까요?'}</p></div>
        <img src="/art/jumpmap/guide-3.webp" alt="연잎과 다양한 발판을 따라 점프하는 캐릭터" width="300" height="200" />
      </header>
      <div className="jm-guide-sound"><span aria-hidden="true">♫</span><div><strong>소리들으며 플레이 하면 재미가 2배!!</strong><p>발판마다 다른 착지 소리가 들려요. 설정에서 효과음 음량을 켜고 즐겨보세요.</p></div></div>
      <ol className="jm-guide-steps" aria-label="돌탑 점프맵 놀이 방법">{steps.map((step,index)=><li key={step.title}>
        <StepIcon step={index} /><h3><span>{index+1}</span>{step.title}</h3><p>{step.body}</p>
      </li>)}</ol>
      <section className="jm-guide-rewards" aria-label="점프맵 보상 안내"><h3>완주하면 총 {STAGES.reduce((sum, stage) => sum + stage.reward, 0)}냥</h3>
        <p>구간을 지날 때마다 받아요. 떨어져도 받은 엽전은 그대로예요.</p>
        <ol>{STAGES.map(stage => <li key={stage.stage}><span>{stage.name}</span><b>+{stage.reward}냥</b></li>)}</ol>
        <small>미니게임 합산 하루 최대 {DAILY_CAP}냥<br />남은 일일 한도만큼 지급해요.</small>
      </section>
      <div className="jm-guide-controls" aria-label="돌탑 조작 안내"><span><kbd>WASD</kbd> 이동</span><span><kbd>Space</kbd> 점프</span><span><kbd>Shift</kbd> 달리기</span></div>
      <section className="jm-guide-ranking" aria-label="타임어택 랭킹 안내"><span aria-hidden="true"><StepIcon step={2} /></span><div>
        <h3>타임어택 랭킹에 도전해요!</h3><p>완주 시간으로 순위를 겨뤄요. 내 최고 기록을 줄여보세요.</p>
        {loadRankings && <button ref={rankingButton} type="button" aria-haspopup="dialog" onClick={() => setRankingOpen(true)}>타임어택 랭킹 보기</button>}
      </div></section>
      <p className="jm-guide-optional">이 화면은 가이드예요. <strong>매번 확인하지 않고 첫 발판에서 바로 도전해도 돼요.</strong><br />{STAGES.length === 10 ? '점프맵 비석' : '출발 표식'}에서 <kbd>E</kbd>를 누르면 언제든 다시 읽을 수 있어요.</p>
      <button type="button" className="paper-primary jm-guide-depart" onClick={onClose}>안내 닫고 출발하기</button>
      <p className="jm-guide-close-hint"><kbd>Esc</kbd> 안내 닫기</p>
    </PaperPopup>}
  </div>,document.body)
}

export const JumpmapGuide = memo(function JumpmapGuide({ loadRankings }: { loadRankings: RankingLoader }) {
  const scope=useJumpmapGuide(s=>s.scope), context=useSession(jumpmapGuideScope)
  const connected=useSession(s=>s.status==='connected'&&s.mapCompatible)
  const running=useJumpmap(s=>!!s.run)
  useEffect(()=>{
    if(scope&&(!connected||running||scope!==context)) closeJumpmapGuide()
  },[scope,connected,running,context])
  useEffect(()=>()=>closeJumpmapGuide(),[])
  if(!JUMPMAP_ENABLED||!scope||scope!==context||!connected||running) return null
  return <JumpmapGuideDialog loadRankings={loadRankings} onClose={()=>{
    closeJumpmapGuide()
    document.querySelector<HTMLCanvasElement>('canvas')?.focus({preventScroll:true})
  }} />
})
