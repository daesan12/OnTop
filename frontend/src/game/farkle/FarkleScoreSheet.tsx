import { useLayoutEffect, useRef } from 'react'
import { useGame } from '../store'
import { selectedDice, toggleScoreSheet, useDiceUI } from './controls'
import { DiceFaces } from './DiceFace'
import { SCORE_GROUPS, selectedScoreRows } from './scorebook'
import { selectionScore } from './scoring'
import './scorebook.css'

export function FarkleScoreSheet() {
  const open = useDiceUI(s => s.scoreOpen), game = useGame(s => s.game)
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { element.showModal(); close.current?.focus() }
    if (!open && element.open) element.close()
    return () => { if (element.open) element.close() }
  }, [open])
  const d = game?.dice, ids = selectedDice()
  const faces = d?.dice.filter(die => !die.held && ids.includes(die.id)).map(die => die.value) ?? []
  const points = d ? selectionScore(d.dice, ids) : null, highlighted = selectedScoreRows(faces)
  return <dialog ref={dialog} className="farkle-scorebook" aria-label="주사위 점수표" aria-modal="true"
    onCancel={e => { e.preventDefault(); if (open) toggleScoreSheet() }}
    onKeyDown={e => {
      if (e.code === 'Tab') {
        // This reference has one control; keep focus inside it while the game is inert.
        e.preventDefault(); close.current?.focus()
      }
    }}>
    <div className="scorebook-page">
      <header><h2>주사위 점수표</h2>
        <button ref={close} onClick={toggleScoreSheet} aria-label="점수표 닫기"><span>T / Esc 닫기</span><b aria-hidden="true">×</b></button></header>
      <div className="scorebook-selection"><span>현재 선택</span><DiceFaces values={faces} /><strong>{points === null ? '—' : `+${points.toLocaleString()}점`}</strong></div>
      {SCORE_GROUPS.map(group => <section key={group.title} aria-label={group.title}>
        <h3>{group.title}</h3>
        {group.rows.map(row => <div key={row.id} className="scorebook-row" data-rule={row.id} data-selected={highlighted.includes(row.id)}>
          <DiceFaces values={row.faces} /><span>{row.label}</span><strong>{row.score}</strong>
        </div>)}
        {group.title === '같은 눈 3개' && <p className="scorebook-examples">2: 200 · 3: 300 · 4: 400 · 5: 500 · 6: 600점</p>}
      </section>)}
      <section className="scorebook-special"><div><strong>싹쓸이!</strong><span>6개 모두 득점 → 턴 점수 유지 · 6개로 한 번 더!</span></div>
        <div><strong>허탕!</strong><span>득점 조합 없음 → 이번 턴 점수만 소멸</span></div></section>
      <footer><p>점수표를 봐도 제한시간은 계속 흐릅니다.</p><small>이전 보관 주사위와 새 조합을 만들 수 없습니다.</small></footer>
    </div>
  </dialog>
}
