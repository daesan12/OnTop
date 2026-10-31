import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { clearRoamingInput } from '../../world/inputOwnership'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import './jumpmapCompletion.css'

/** 마지막 연잎에서만 여는 종이 완료 화면. 이동을 정리하고, 닫은 뒤 직접 호수로 진행한다. */
export function JumpmapCompletion({ runCoins, todayEarned, settled, onClose }: {
  runCoins: number; todayEarned: number | null; settled: boolean; onClose(): void
}) {
  useEffect(() => { clearRoamingInput(); return clearRoamingInput }, [])
  return createPortal(<div className="jumpmap jm-completion-root">
    <PaperPopup title="돌탑 도전 완료" label="점프맵 완료" className="jm-completion-paper" onClose={onClose} closeLabel="완료 화면 닫기">
      <h2>돌탑 도전 완료</h2>
      <p className="paper-subtitle">{settled ? '호수까지 멋지게 완주했어요!' : '마지막 연잎에 도착했어요!'}</p>
      <div className="jm-paper-ornament" aria-hidden="true">❖</div>
      <div className="jm-paper-hero"><img src="/art/jumpmap/guide-3.webp" alt="마지막 연잎에서 호수로 뛰어드는 캐릭터" width="400" height="240" /></div>
      <div className="paper-stats"><div><span>도착 구간</span><b>7 / 7</b></div><div><span>이번 도전 받은 엽전</span><b>{runCoins}<small>냥</small></b></div></div>
      <div className="paper-settlement" role="status"><strong><img src={coinImage} alt="" width="28" height="28" />오늘 받은 엽전 {todayEarned ?? '—'} / 100냥</strong>
        <small>{settled ? '완주 보상이 반영됐어요.' : '표시된 금액은 지금까지 받은 엽전이에요.'}</small></div>
      {!settled && <p className="jm-completion-note">창을 닫고 호수로 뛰어들면 완주 보상이 확정돼요.</p>}
      <div className="paper-actions"><button className="paper-primary" onClick={onClose}>계속하기</button></div>
      <p className="jm-completion-shortcut">Esc로 닫기</p>
    </PaperPopup>
  </div>, document.body)
}
