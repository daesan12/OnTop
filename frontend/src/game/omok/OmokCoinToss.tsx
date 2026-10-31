import { useEffect, useState } from 'react'
import { useSession } from '../../network/worldClient'
import type { Omok } from '../protocol'
import './omokCoinToss.css'

/** 서버에서 한 번 정한 흑돌을 공개한다. 재접속은 동일 종료 시각을 사용하며 재추첨하지 않는다. */
export function OmokCoinToss({ game }: { game: Omok }) {
  const [now, setNow] = useState(Date.now())
  const winner = useSession(s => s.profiles[game.blackUserId]?.nickname ?? '흑돌 참가자')
  const until = game.coinTossEndsAt ? Date.parse(game.coinTossEndsAt) : 0
  useEffect(() => {
    if (!until || Date.now() >= until) return
    const timer = setInterval(() => setNow(Date.now()), 50)
    return () => clearInterval(timer)
  }, [until])
  if (!until || now >= until || game.moveCount > 0 || game.status !== 'PLAYING') return null
  const landed = until - now < 900
  return <div className="omok-coin-toss" role="status" aria-live="polite" data-landed={landed}>
    <div className="omok-coin-paper"><p>동전으로 선공을 정해요</p><div className="omok-toss-coin" aria-hidden="true">온탑</div>
      <strong>{landed ? `${winner} · 흑돌 선공` : '동전을 던지는 중…'}</strong><span>흑돌이 먼저, 백돌이 다음에 두어요</span></div>
  </div>
}
