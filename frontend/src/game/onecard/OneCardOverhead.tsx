import { useShallow } from 'zustand/react/shallow'
import { useGame } from '../store'

/** Public fields only; reuses the existing animated-head projection. */
export function OneCardOverhead({ userId }: { userId: string }) {
  const info = useGame(useShallow(s => {
    const o = s.game?.onecard, p = o?.players.find(p => p.userId === userId)
    return { visible: o?.status === 'PLAYING' && !!p, count: p?.cardCount, active: p?.active,
      turn: o?.turnUserId === userId, status: p?.oneCardStatus }
  }))
  if (!info.visible) return null
  return <div className={`onecard-overhead${info.turn ? ' is-current' : ''}`}>
    <b>{info.count}장</b><span>{!info.active ? '기권' : info.turn ? '현재 차례' : '남은 손패'}</span>
    {info.status === 'declared' && <strong>원카드!</strong>}
  </div>
}
