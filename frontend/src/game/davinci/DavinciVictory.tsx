import { useEffect, useState, type ReactNode } from 'react'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import logo from '../../assets/entry/ontop-logo.webp'
import { victoryStampUntil } from './effects'
import './davinci.css'

/** 서버 결과를 꾸미는 짧은 단계다. 정산·다음 판 권한은 공통 결과창이 계속 담당한다. */
export function DavinciVictory({ gameId, headline, invalid = false, children }: { gameId: string; headline: string; invalid?: boolean; children: ReactNode }) {
  const [until] = useState(() => invalid ? 0 : victoryStampUntil(gameId))
  const [show, setShow] = useState(() => until > Date.now())
  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), Math.max(0, until - Date.now()))
    return () => clearTimeout(timer)
  }, [show, until])
  if (!show || invalid) return children
  return <PaperPopup title="흑백수사" label="흑백수사 수사 완료" closeLabel="결과 바로 보기" onClose={() => setShow(false)} className="secret-victory-popup">
    <div className="secret-victory-seal"><img src={logo} alt="온탑" /><strong>수사 완료</strong><span>비밀의 숫자를 밝혀내다</span></div>
    <p className="secret-victory-winner">{headline}</p>
    <button className="paper-primary" onClick={() => setShow(false)}>결과 보기</button>
  </PaperPopup>
}
