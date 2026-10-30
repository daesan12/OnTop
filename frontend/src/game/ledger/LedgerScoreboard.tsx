import { CATEGORY_HINT, CATEGORY_LABEL, LOWER_CATEGORIES, UPPER_CATEGORIES, type DiceLedger, type LedgerCategory } from './protocol'
import type { LedgerPing } from './pings'
import { bonusRemaining, categoryScore } from './scoring'

interface Props {
  ledger: DiceLedger
  names: Record<string, string>
  ownId: string
  /** Player on turn: records the cell. Approved spectator: sends a hint. Otherwise read-only. */
  mode: 'score' | 'ping' | 'view'
  pings: LedgerPing[]
  onPick(category: LedgerCategory): void
}

/** Shared 2D ledger for players and spectators; preview numbers are local and never authoritative. */
export function LedgerScoreboard({ ledger, names, ownId, mode, pings, onPick }: Props) {
  const faces = ledger.dice.map(d => d.value)
  const turn = ledger.players.find(p => p.userId === ledger.turnUserId)
  const recent = ledger.lastScored
  const row = (category: LedgerCategory) => {
    const hinted = pings.filter(p => p.category === category)
    const open = !!turn && turn.scores[category] === null && faces.length === 5
    const clickable = open && mode !== 'view'
    return <tr key={category} data-hinted={hinted.length > 0 || undefined}>
      <th scope="row" title={CATEGORY_HINT[category]}>{CATEGORY_LABEL[category]}
        {hinted.length > 0 && <span className="ledger-hint" aria-label={`훈수 ${hinted.length}건`}>훈수</span>}</th>
      {ledger.players.map(card => {
        const value = card.scores[category], current = card.userId === ledger.turnUserId
        const preview = current && open ? categoryScore(category, faces) : null
        const fresh = recent?.userId === card.userId && recent.category === category
        if (current && clickable) return <td key={card.userId} data-current="true">
          <button className="ledger-cell" data-preview={preview} data-zero={preview === 0 || undefined}
            aria-label={`${CATEGORY_LABEL[category]} ${mode === 'score' ? '기록' : '훈수'} · 예상 ${preview}점`}
            onClick={() => onPick(category)}>{preview}</button></td>
        return <td key={card.userId} data-current={current || undefined} data-fresh={fresh || undefined}
          data-auto={fresh && recent?.auto || undefined}>
          {value ?? (preview !== null ? <span className="ledger-preview">{preview}</span> : '')}
        </td>
      })}
    </tr>
  }
  return <table className="ledger-board" aria-label="주사위 장부 점수판">
    <thead><tr><th scope="col">칸</th>{ledger.players.map(card => <th scope="col" key={card.userId}
      data-turn={card.userId === ledger.turnUserId || undefined} data-own={card.userId === ownId || undefined}
      data-out={card.forfeited || undefined}>
      <span>{names[card.userId]}</span>{card.forfeited && <small>기권</small>}
      {ledger.winnerUserIds.includes(card.userId) && <small>{ledger.winnerUserIds.length > 1 ? '공동 승리' : '승리'}</small>}
    </th>)}</tr></thead>
    <tbody>
      {UPPER_CATEGORIES.map(row)}
      <tr className="ledger-subtotal"><th scope="row">소계 <small>{ledger.upperBonusThreshold}점 이상 +{ledger.upperBonus}</small></th>
        {ledger.players.map(card => <td key={card.userId}>{card.upperSubtotal}
          <small>{card.upperBonus ? `+${card.upperBonus}` : `-${bonusRemaining(card, ledger.upperBonusThreshold)}`}</small></td>)}</tr>
      {LOWER_CATEGORIES.map(row)}
      <tr className="ledger-total"><th scope="row">총점</th>
        {ledger.players.map(card => <td key={card.userId}>{card.total}</td>)}</tr>
    </tbody>
  </table>
}
