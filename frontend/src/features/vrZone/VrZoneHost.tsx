import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { VR_CATALOG_SLOTS, VR_GAMES, VR_PLAY_FEE } from './catalog'
import type { VrZoneController } from './controller'
import skewerCover from './art/skewer-cover-lowpoly.png'
import skewerVR from './art/skewer-vr-lowpoly.png'
import skewerPC from './art/skewer-pc-lowpoly.png'
import './vrZone.css'
import './selection.css'

const SkewerPage = lazy(() => import('../skewer/SkewerPage'))

function HeadsetIcon() { return <svg viewBox="0 0 80 60" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M13 23c0-12 9-19 27-19s27 7 27 19M10 23h60v24c0 8-12 10-20 3l-10-8-10 8c-8 7-20 5-20-3V23Z" /><path d="M23 32v10m34-10v10M3 29v14m74-14v14" /></svg> }

export function VrZoneHost({ controller }: { controller: VrZoneController }) {
  const state = useStore(controller.store)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (state.phase === 'game') panel.current?.focus() }, [state.phase])
  if (state.phase === 'closed') return null
  const preview = controller.admission.mode === 'local-preview'
  const recovering = controller.recovering
  const cannotPrepare = state.loading || (!recovering && (state.balance === null || state.balance < VR_PLAY_FEE)) || controller.admission.mode === 'unavailable'
  const admissionNotice = <>
    {state.error ? <p className="vr-zone-error" role="alert">{state.error}</p> : null}
    {recovering ? <p className="vr-zone-error" role="status">이전 이용 요청이 남아 있어요. 게임을 선택하고 시작하면 같은 이용권을 다시 확인해요. 이미 차감됐다면 추가로 차감하지 않아요.</p> : controller.admission.mode === 'unavailable' ? <p className="vr-zone-error" role="status">VR 이용권 서버 연결을 준비하고 있어요. 지금은 엽전이 차감되지 않아요.</p> : state.balance !== null && state.balance < VR_PLAY_FEE ? <p className="vr-zone-error" role="status">엽전이 부족해요. 한 판에 10냥이 필요해요.</p> : null}
  </>
  const leave = () => {
    if (state.purchasing) return
    if (state.receipt) setConfirmLeave(true)
    else controller.back()
  }
  return <div className="vr-zone-ui">
    {state.phase === 'catalog' ? <PaperPopup key="catalog" title="VR 체험관" label="VR 게임 선택" closeLabel="VR 게임 선택 닫기" onClose={() => controller.close()} className="vr-zone-catalog">
      <div className="vr-zone-title"><HeadsetIcon /><div><h2>어떤 게임을 해볼까요?</h2><p>혼자 즐기는 VR 미니게임 · 한 판 {VR_PLAY_FEE}냥</p></div></div>
      <div className="vr-zone-balance"><span>{preview ? '로컬 테스트 잔액' : '사용 가능한 엽전'}</span><strong>{state.loading ? '확인 중…' : state.balance === null ? '확인 필요' : `${state.balance}냥`}</strong></div>
      {preview ? <p className="vr-zone-preview-note">실제 계정의 엽전은 사용하지 않는 로컬 테스트입니다.</p> : null}
      <div className="vr-zone-grid" aria-label="VR 게임 목록">
        {VR_GAMES.map(game => <button key={game.id} className="vr-zone-game" aria-label={`${game.name}${controller.underConstruction ? ' 공사 중' : ' 선택'}`} disabled={controller.underConstruction} onClick={() => controller.select(game.id)}>
          <img className="vr-zone-game-cover" src={skewerCover} alt="주문 그림을 보고 토마토·새우·고기·피망을 꼬치에 꽂는 게임" width="1664" height="941" />
          <span className="vr-zone-game-copy"><strong>{game.name}</strong><span>{game.players} · 한 판 {VR_PLAY_FEE}냥</span><small>{game.description}</small><span className="vr-zone-game-link">{controller.underConstruction ? '공사 중' : <>플레이 방식 선택 <span aria-hidden="true">→</span></>}</span></span>
        </button>)}
        {Array.from({ length: VR_CATALOG_SLOTS - VR_GAMES.length }, (_, index) => <div key={index} className="vr-zone-coming"><span aria-hidden="true">+</span><strong>새로운 VR 게임</strong><small>준비 중</small></div>)}
      </div>
      {controller.underConstruction ? <p className="vr-zone-start-note" role="status">온탑 꼬치왕은 현재 공사 중이에요. 준비가 끝나면 다시 만나요. 엽전은 차감되지 않아요.</p> : <>
        <div className="vr-zone-fee"><strong>판돈 없이, 이용료 10냥</strong><p>게임을 고르는 동안에는 차감하지 않아요. 실제 시작할 때 한 번 차감하며, 영업 종료까지가 한 판이에요. 점수는 엽전 보상으로 바뀌지 않아요.</p></div>
        {admissionNotice}
        <p className="vr-zone-start-note">게임을 선택하면 VR 사용 여부를 고를 수 있어요.</p>
      </>}
    </PaperPopup> : state.phase === 'mode' ? <PaperPopup key="mode" title="VR 체험관" label="온탑 꼬치왕 플레이 방식 선택" closeLabel="플레이 방식 선택 닫기" onClose={() => controller.back()} className="vr-zone-mode">
      <button className="vr-zone-mode-back" onClick={() => controller.back()}><span aria-hidden="true">‹</span> 게임 목록으로</button>
      <h2>{VR_GAMES.find(game => game.id === state.selected)?.name}</h2><p className="vr-zone-mode-subtitle">어떤 방식으로 플레이할까요?</p>
      <div className="vr-zone-mode-grid">
        <button className="vr-zone-mode-card" onClick={() => controller.prepare('vr')} disabled={cannotPrepare} aria-label="VR로 플레이">
          <img src={skewerVR} alt="VR 헤드셋과 양손 컨트롤러로 음식을 집어 꼬치에 꽂는 모습" width="1664" height="941" />
          <span className="vr-zone-mode-copy"><strong>VR로 플레이</strong><span>헤드셋과 컨트롤러로 직접 꽂아요</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17m-7-7 7 7-7 7" /></svg></span>
        </button>
        <button className="vr-zone-mode-card" onClick={() => controller.prepare('pc')} disabled={cannotPrepare} aria-label="VR 없이 플레이">
          <img src={skewerPC} alt="컴퓨터 화면에서 키보드와 마우스로 꼬치를 만드는 모습" width="1664" height="941" />
          <span className="vr-zone-mode-copy"><strong>VR 없이 플레이</strong><span>키보드·마우스로 꼬치를 만들어요</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17m-7-7 7 7-7 7" /></svg></span>
        </button>
      </div>
      <p className="vr-zone-mode-fee">두 방식 모두 한 판 10냥 · 시작할 때만 차감해요</p>
      <p className="vr-zone-mode-help">VR 플레이는 Quest 2와 VR 지원 브라우저가 필요해요</p>
      {admissionNotice}
    </PaperPopup> : <div className="vr-zone-game-shell" tabIndex={-1} ref={panel}>
      <div className="vr-zone-play-bar"><button onClick={leave} disabled={state.purchasing}>VR 게임 목록으로</button><span>{preview ? '테스트 잔액' : '사용 가능'} {state.balance ?? '—'}냥 · {state.purchasing ? '이용권 확인 중…' : recovering ? '시작하면 이전 이용권 재확인 · 중복 차감 없음' : state.receipt ? '이번 판 이용료 10냥 결제 완료' : '시작할 때 10냥'}</span></div>
      {state.error ? <div className="vr-zone-payment-error" role="alert">{state.error}</div> : null}
      <Suspense fallback={<div className="vr-zone-loading" role="status">조리대를 준비하고 있어요…</div>}><SkewerPage authorizeStart={controller.authorize} entryFee={VR_PLAY_FEE} onExit={leave} onResultExit={() => controller.back()} playMode={state.playMode} onChangeMode={() => controller.changeMode()} /></Suspense>
    </div>}
    {confirmLeave ? <PaperPopup title="VR 체험관" label="VR 게임 나가기" closeLabel="계속 플레이" onClose={() => setConfirmLeave(false)} className="vr-zone-leave">
      <h2>이번 판을 마칠까요?</h2><p>진행 중인 꼬치와 점수는 저장되지 않아요. 이용을 시작한 판의 10냥은 반환되지 않으며, 다음 판은 새 이용료가 필요해요.</p><div className="paper-actions"><button className="paper-primary" onClick={() => { controller.back(); setConfirmLeave(false) }}>이번 판 마치고 목록으로</button><button onClick={() => setConfirmLeave(false)}>계속 플레이</button></div>
    </PaperPopup> : null}
  </div>
}
