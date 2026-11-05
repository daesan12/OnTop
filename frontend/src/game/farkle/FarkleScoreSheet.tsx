import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { selectedDice, toggleScoreSheet, useDiceUI } from './controls'
import { DiceFaces } from './DiceFace'
import { SCORE_GROUPS, selectedScoreRows } from './scorebook'
import { selectionScore } from './scoring'
import './scorebook.css'

export function FarkleScoreSheet() {
  const open = useDiceUI(s => s.scoreOpen), game = useGame(s => s.game)
  const own = useSession(s => s.sessionId), profiles = useSession(s => s.profiles)
  const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null), previousTurn = useRef('')
  const [now, setNow] = useState(Date.now), [turnNotice, setTurnNotice] = useState('')
  const d = game?.dice, ids = selectedDice()
  const owner = d?.turnUserId === own ? '내' : profiles[d?.turnUserId ?? '']?.nickname ?? '상대'
  const remaining = d?.turnDeadline ? Math.max(0, Math.ceil((Date.parse(d.turnDeadline) - now) / 1000)) : null
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [open])
  useEffect(() => {
    if (!open) { previousTurn.current = ''; setTurnNotice(''); return }
    const key = `${game?.gameId}/${d?.round}/${d?.turnUserId}/${d?.status}`
    if (previousTurn.current && previousTurn.current !== key) setTurnNotice(d?.status === 'FINISHED'
      ? '경기가 끝났습니다. 점수표를 닫고 결과를 확인하세요.' : `차례가 바뀌었습니다. ${owner} 차례입니다.`)
    previousTurn.current = key
  }, [open, game?.gameId, d?.round, d?.turnUserId, d?.status, owner])
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { element.showModal(); close.current?.focus() }
    if (!open && element.open) element.close()
    return () => { if (element.open) element.close() }
  }, [open])
  const faces = d?.dice.filter(die => !die.held && ids.includes(die.id)).map(die => die.value) ?? []
  const points = d ? selectionScore(d.dice, ids) : null, highlighted = selectedScoreRows(faces)
  return <dialog ref={dialog} className="farkle-scorebook" aria-label="주사위 점수표" aria-modal="true"
    onCancel={e => { e.preventDefault(); if (open) toggleScoreSheet() }}
    onKeyDown={e => {
      if (e.code === 'Tab') {
        // This reference has one control; keep focus inside it while the game is inert.
        e.preventDefault(); close.current?.focus()
      }
      const pane = content.current
      if (pane && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.code)) {
        e.preventDefault()
        if (e.code === 'Home' || e.code === 'End') pane.scrollTop = e.code === 'Home' ? 0 : pane.scrollHeight
        else pane.scrollBy({ top: (e.code.includes('Up') ? -1 : 1) * (e.code.startsWith('Page') ? pane.clientHeight * .8 : 48) })
      }
    }}>
    <div className="scorebook-page">
      <header><h2>주사위 점수표</h2>
        <button ref={close} onClick={toggleScoreSheet} aria-label="점수표 닫기"><span>T / Esc 닫기</span><b aria-hidden="true">×</b></button></header>
      <div className="scorebook-turn" data-urgent={remaining !== null && remaining <= 5}>
        <strong>{d?.status === 'FINISHED' ? '경기 종료' : `${owner} 차례`}</strong>
        {remaining !== null && <span role="timer" aria-label={`남은 시간 ${remaining}초`}>{remaining}<small>초 남음</small></span>}
        <p role="status" aria-live="polite">{turnNotice || (remaining === 0 ? '시간 종료 · 서버의 다음 차례를 기다립니다.' : '점수표를 보는 동안에도 시간이 흐릅니다.')}</p>
      </div>
      <div ref={content} className="scorebook-content" role="region" aria-label="점수표 족보">
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
    </div>
  </dialog>
}
