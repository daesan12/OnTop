import { teamName, type YutMove, type YutSnapshot } from './contracts'

export const boardNodes = Array.from({ length: 29 }, (_, i) => i + 1)
export const boardJunctions = [5, 10, 15, 20, 23]

export function boardPoint(node: number): [number, number] {
  if (node <= 5) return [460, 460 - node * 80]
  if (node <= 10) return [460 - (node - 5) * 80, 60]
  if (node <= 15) return [60, 60 + (node - 10) * 80]
  if (node <= 20) return [60 + (node - 15) * 80, 460]
  const points: Record<number, [number, number]> = {
    21: [393, 127], 22: [327, 193], 23: [260, 260], 24: [193, 327], 25: [127, 393],
    26: [127, 127], 27: [193, 193], 28: [327, 327], 29: [393, 393],
  }
  return points[node] ?? [460, 460]
}
export function Board({ state, selected, destinations, onPiece, onMove, onPing }: {
  state: YutSnapshot['publicState']; selected: number; destinations: YutMove[]
  onPiece(team: number, piece: number): void; onMove(move: YutMove): void; onPing(node: number): void
}) {
  return <div className="yut-board" aria-label="29칸 윷판">
    <svg viewBox="0 0 520 520" role="img" aria-label="바깥길과 대각선 지름길">
      <path d="M60 60H460V460H60ZM60 60L460 460M460 60L60 460" fill="none" stroke="currentColor" strokeWidth="3" />
      {boardNodes.map(node => {
        const [x, y] = boardPoint(node)
        return <g key={node}><circle data-node={node} cx={x} cy={y} r={boardJunctions.includes(node) ? 18 : 13} />
          {node === 20 && <text x={x - 5} y={y + 36} textAnchor="end">출발·참먹이</text>}
          {node === 1 && <text x={x - 24} y={y - 20} textAnchor="end">첫 도 ↑</text>}
          {node === 23 && <text x={x} y={y + 37} textAnchor="middle">방</text>}</g>
      })}
    </svg>
    {boardNodes.map(node => {
      const [x, y] = boardPoint(node), destination = destinations.find(move => move.to === node)
      return <button key={node} className={`yut-board-node ${destination ? 'yut-destination' : ''}`}
        style={{ left: `${x / 5.2}%`, top: `${y / 5.2}%` }} aria-label={destination ? `${node}번 칸으로 ${destination.shortcut ? '지름길' : '기본 길'} 이동` : `${node}번 칸 핑 보내기`}
        onClick={() => destination ? onMove(destination) : onPing(node)} />
    })}
    {state.pieces.flatMap((tokens, team) => tokens.map((node, piece) => {
      if (node === 0 || node === 30 || tokens.indexOf(node) !== piece) return null
      const [x, y] = boardPoint(node), count = tokens.filter(at => at === node).length
      return <button key={`${team}:${piece}`} className={`yut-token yut-team-${team}`}
        style={{ left: `${x / 5.2}%`, top: `${y / 5.2}%` }}
        aria-label={`${teamName(team)} ${piece + 1}번 말${count > 1 ? ` ${count}개 업힘` : ''}`}
        aria-pressed={team === state.team && state.pieces[team][selected] === node} onClick={() => onPiece(team, piece)}>{count > 1 ? count : piece + 1}</button>
    }))}
  </div>
}
