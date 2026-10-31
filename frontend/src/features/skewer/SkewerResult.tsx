import { useState } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import skewerImage from '../vrZone/art/skewer-cover-lowpoly.png'
import type { GameState } from './game'
import { gameSummary } from './presentation'
import './result.css'

function ResultActionIcon({ kind }: { kind: 'retry' | 'games' | 'help' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'retry' ? <><path d="M20 8a8 8 0 1 0 .2 7" /><path d="M20 3.5V8h-4.5" /></>
      : kind === 'games' ? <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 9h3m-1.5-1.5v3M16 9h.01M18 12h.01M7 16h10" /></>
        : <><path d="M12 6.5C9.6 4.7 6.3 4.5 3 5.5v14c3.3-1 6.6-.8 9 1 2.4-1.8 5.7-2 9-1v-14c-3.3-1-6.6-.8-9 1Z" /><path d="M12 6.5v14M6 10h3m6 0h3M6 13h3m6 0h3" /></>}
  </svg>
}

export function SkewerResult({ state, restart, exit, entryFee, pending, notice, playMode }: {
  state: GameState; restart: () => void; exit: () => void; entryFee?: number; pending: boolean; notice: string; playMode: 'vr' | 'pc'
}) {
  const summary = gameSummary(state)
  const [helpOpen, setHelpOpen] = useState(false)
  return <PaperPopup title="온탑 꼬치왕 도전 결과" label="온탑 꼬치왕 결과" onClose={exit} closeLabel="결과 닫고 게임 목록으로" className="sk-result-popup">
    <section aria-labelledby="sk-final-title" aria-busy={pending}>
      <h2 id="sk-final-title">온탑 꼬치왕 도전 결과</h2>
      <p className="paper-subtitle">{summary.completed ? '따끈따끈, 오늘의 꼬치 장사를 마쳤어요' : '오늘의 도전, 수고했어요. 다시 도전해볼까요?'}</p>
      <div className="sk-result-ornament" aria-hidden="true">❖</div>
      <div className="sk-result-hero"><img src={skewerImage} alt="토마토와 새우, 고기, 피망을 꽂아 완성한 꼬치" width="1672" height="941" /></div>
      <dl className="sk-result-stats">
        <div><dt>완성한 주문</dt><dd data-testid="completed-orders">{summary.completed}<small>개</small></dd></div>
        <div><dt>놓친 주문</dt><dd className="sk-result-missed">{summary.missed}<small>개</small></dd></div>
      </dl>
      <div className="sk-result-score"><span>최종 점수</span><strong data-testid="final-score">{state.score.toLocaleString()}<small>점</small></strong>
        <p>주문 성공률 <b>{summary.accuracy}%</b><span aria-hidden="true"> · </span>인사 보너스 <b>+{summary.bonus}점</b></p>
      </div>
      {notice ? <p className="sk-result-notice" role="status">{notice}</p> : null}
      <div className="sk-result-actions">
        <button className="sk-result-retry" onClick={restart} disabled={pending}><ResultActionIcon kind="retry" />{pending ? '확인 중…' : '다시 도전'}</button>
        <button className="sk-result-games" onClick={exit} disabled={pending}><ResultActionIcon kind="games" />게임 목록</button>
        <button onClick={() => setHelpOpen(open => !open)} aria-expanded={helpOpen} aria-controls="sk-result-help"><ResultActionIcon kind="help" />설명서</button>
      </div>
      <p className="sk-result-fee">{entryFee ? `다시 도전하면 새 판 이용료 ${entryFee}냥 · 목록으로 돌아가기는 무료` : '무료 연습 · 다시 도전해도 이용료가 없어요'}</p>
      {helpOpen ? <div className="sk-result-help" id="sk-result-help" role="region" aria-label={playMode === 'vr' ? 'VR 조작 설명서' : '키보드·마우스 조작 설명서'}>
        <h3>{playMode === 'vr' ? 'VR로 꼬치 만들기' : '키보드·마우스로 꼬치 만들기'}</h3>
        <p>{playMode === 'vr' ? '트리거로 음식 집기 → 꼬치 끝에 맞춘 뒤 트리거 놓기 → 그립으로 꼬치를 잡아 뒤쪽 접시에 수평으로 놓고 그립 해제' : '숫자 1–6으로 재료 선택 → Space로 꽂기 → Enter로 서빙하기. 끝 재료는 Backspace로 뺄 수 있어요.'}</p>
        <p>주문의 재료 순서와 감싼 위치를 맞춰요. 치즈·베이컨은 앞끝 → 감쌀 음식 → 뒤끝 순서예요. 꼬치 전체를 반대로 만들어도 정답이에요.</p>
        <p>주문당 35초 · 손님에게 3초 안에 인사하면 +1점. 점수는 엽전으로 환산되지 않아요.</p>
      </div> : null}
      <details className="sk-result-history"><summary>주문 기록 자세히</summary>{state.rounds.length ? <ol>{state.rounds.map((round, index) => <li key={round.cardId}><span>{index + 1}. {round.name}</span><b>{round.success ? `+${round.points}점` : round.reason === 'timeout' ? '시간 종료' : '순서 확인'}</b></li>)}</ol> : <p>아직 완료한 주문이 없어요.</p>}</details>
    </section>
  </PaperPopup>
}
