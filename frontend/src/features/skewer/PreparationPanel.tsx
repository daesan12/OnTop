import { useState } from 'react'
import { INGREDIENTS } from './game'
import { IngredientIcon } from './OrderDisplay'
import vrIllustration from '../vrZone/art/skewer-vr-lowpoly.png'
import pcIllustration from '../vrZone/art/skewer-pc-lowpoly.png'
import { TouchControllerGuide } from '../vrGuide/TouchControllerDiagram'

interface PreparationProps {
  start: () => void
  startVR: () => void
  pending: boolean
  notice: string
  supported: boolean | null
  entryFee?: number
  exit: () => void
  playMode?: 'pc' | 'vr'
  changeMode?: () => void
}

const VR_STEPS = [
  ['트리거로 음식 집기', '검지로 트리거를 누른 채 음식을 집어 옮겨요.'],
  ['꼬치 끝에 맞춰 놓기', '음식 중심과 꼬치 방향을 맞춘 뒤 트리거를 놓아요.'],
  ['그립으로 꼬치 잡고 서빙', '옆면 그립으로 꼬치를 잡고 뒤쪽 접시에 수평으로 가져간 뒤, 그립을 놓아 서빙해요.'],
] as const
const PC_STEPS = [
  ['재료 고르기', '화면의 재료를 클릭하거나 숫자 1–6으로 선택해요.'],
  ['Space로 음식 꽂기', '선택한 재료를 꽂아요. 3D 음식을 꼬치 끝으로 드래그해도 돼요.'],
  ['Enter로 서빙하기', '완성한 꼬치를 서빙해요. 화면의 서빙하기 버튼도 사용할 수 있어요.'],
] as const

function PrepCloud() {
  return <svg viewBox="0 0 180 52" fill="none" aria-hidden="true"><path d="M4 39h57c17 0 17-12 0-12H39c-11 0-11-10 0-10h73c15 0 15-11 6-11-7 0-8 6-3 6M61 31h15M17 39h-6" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /><path d="M92 17h83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

function VRControls() {
  return <section className="sk-prep-controls sk-prep-vr-controls" aria-label="VR 전용 조작 안내">
    <div><h3>시작 전 준비</h3><p>Quest 2를 착용하고 양손 컨트롤러를 준비해요.</p><p>정면을 바라보고 팔을 움직일 공간을 확인해요.</p></div>
    <div><h3>다시 만들고 싶다면</h3><p>앞쪽 안내판의 <strong>끝 재료 빼기</strong>를 누르면 끝에서 하나씩 돌려놓아요.</p><p>집은 재료는 <strong>선택 취소</strong>로 내려놓아요.</p></div>
    <div><h3>안내판도 컨트롤러로</h3><p>버튼을 가리키고 트리거로 눌러요.</p><p>손님이 오면 <strong>서빙 / 인사</strong>를, 쉬고 싶으면 <strong>일시정지</strong>를 눌러요.</p></div>
  </section>
}

function PCControls() {
  return <section className="sk-prep-controls sk-prep-pc-controls" aria-label="키보드·마우스 조작 안내">
    <div><h3>재료 선택</h3><ul>{INGREDIENTS.map(item => <li key={item.id}><kbd>{item.key}</kbd><IngredientIcon id={item.id} /><span>{item.name}</span></li>)}</ul></div>
    <div><h3>꽂기 · 서빙 · 되돌리기</h3><p><kbd>Space</kbd> 선택한 음식 꽂기</p><p><kbd>Enter</kbd> 서빙 / 손님 인사</p><p><kbd>Backspace</kbd> 끝 재료 빼기</p></div>
    <div><h3>시점과 일시정지</h3><p><strong>오른쪽 드래그</strong> 조리대 둘러보기</p><p><strong>마우스 휠</strong> 확대 · 축소</p><p><kbd>Esc</kbd> 일시정지 / 계속하기</p></div>
  </section>
}

export function EntryPanel({ start, startVR, pending, notice, supported, entryFee, exit, playMode, changeMode }: PreparationProps) {
  const [practiceMode, setPracticeMode] = useState<'pc' | 'vr'>('pc')
  const mode = playMode ?? practiceMode
  const vr = mode === 'vr'
  const steps = vr ? VR_STEPS : PC_STEPS
  const label = vr ? 'VR로 플레이' : 'VR 없이 플레이'
  return <section className="sk-preparation sk-mode-preparation" data-play-mode={mode} aria-labelledby="sk-preparation-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending) exit() }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'radio') {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.querySelector('form')?.requestSubmit()
    }
  }}>
    <header className="sk-prep-title"><span><PrepCloud /></span><h2 id="sk-preparation-title"><IngredientIcon id="tomato" />온탑 꼬치왕</h2><span><PrepCloud /></span></header>
    <p className="sk-prep-intro">{vr ? '양손 컨트롤러로 음식을 집어 나만의 꼬치를 완성해요.' : '키보드·마우스로 주문에 맞는 꼬치를 만들어보세요.'}</p>
    <div className="sk-prep-guide">
      <figure className="sk-prep-mode-art"><img src={vr ? vrIllustration : pcIllustration} alt={vr ? '헤드셋과 양손 컨트롤러로 음식을 집는 로우폴리 게임 모습' : '컴퓨터에서 키보드와 마우스로 꼬치를 만드는 로우폴리 게임 모습'} width="1664" height="941" /><figcaption>{vr ? 'Quest 2 · 양손 컨트롤러' : '키보드 · 마우스'}</figcaption></figure>
      <div className="sk-prep-mode-instructions"><div className="sk-prep-guide-heading"><h3>{vr ? 'VR 플레이 준비' : '키보드·마우스 가이드'}</h3>{playMode ? <button type="button" className="sk-prep-change-mode" onClick={changeMode} disabled={pending}>플레이 방식 바꾸기</button> : null}</div>
        <ol className="sk-prep-mode-steps" aria-label={vr ? 'VR 플레이 순서' : '일반 플레이 순서'}>{steps.map(([title, detail], index) => <li key={title}><span>{index + 1}</span><div><h4>{title}</h4><p>{detail}</p></div></li>)}</ol>
      </div>
    </div>
    {vr ? <><TouchControllerGuide mode="solo" /><VRControls /></> : <PCControls />}
    <div className="sk-prep-wrap-tip"><strong>그림대로 한 조각씩 꽂아요</strong><p>치즈·베이컨은 <b>큐브 모양으로 각각 최대 2개</b> 사용할 수 있어요.</p></div>
    <p className="sk-prep-rules">혼자 플레이 · 주문당 35초 · 끝에서부터 하나씩 빼기</p>
    <form id="sk-preparation-form" onSubmit={event => { event.preventDefault(); if (!pending) { if (vr) startVR(); else start() } }}>
      {playMode ? <div className="sk-prep-selected-mode"><span>{label}</span></div> : <fieldset className="sk-prep-mode" disabled={pending}><legend>플레이 방식</legend><label><input type="radio" name="sk-play-mode" value="pc" checked={!vr} onChange={() => setPracticeMode('pc')} />PC 연습</label><label><input type="radio" name="sk-play-mode" value="vr" checked={vr} onChange={() => setPracticeMode('vr')} />VR 플레이</label></fieldset>}
      <div className="sk-prep-launch"><p className="sk-prep-fee">{entryFee ? <>한 판 이용료 <strong>{entryFee}냥</strong><small>{vr ? 'VR 연결 후 시작할 때 한 번만 차감해요.' : '시작할 때 한 번만 차감해요. 주문마다 차감하지 않아요.'}</small></> : <>개별 연습 모드<small>이 화면에서는 이용료 없이 연습해요.</small></>}</p>
        <button type="submit" className="sk-prep-start" disabled={pending} aria-describedby="sk-vr-help">{pending ? vr ? 'VR 시작 준비 중…' : '시작 준비 중…' : `${vr ? 'VR 연결하고 시작' : '시작'}${entryFee ? ` · ${entryFee}냥` : ''}`}</button>
      </div>
    </form>
    <p id="sk-vr-help" className="sk-prep-device" role="status">{vr ? supported === null ? '이 브라우저의 VR 지원 여부를 확인하고 있어요.' : supported ? '시작을 누르면 VR 연결과 이용 권한을 확인해요. 연결되면 카운트다운이 시작돼요.' : 'VR 플레이는 Quest의 VR 지원 브라우저에서 열어주세요. 연결되지 않으면 이용료는 차감하지 않아요.' : '재료 선택과 서빙은 화면의 버튼으로도 할 수 있어요.'}</p>
    {notice ? <p className="sk-inline-notice" role="status">{notice}</p> : null}
    <footer><span>3 · 2 · 1 카운트다운 후 시작해요</span><button type="button" className="sk-prep-exit" onClick={exit} disabled={pending} aria-keyshortcuts="Escape"><kbd>ESC</kbd> 나가기</button></footer>
  </section>
}
