import { teamName, type YutMove, type YutSnapshot } from './contracts'

export const boardNodes = Array.from({ length: 29 }, (_, i) => i + 1)
export const boardJunctions = [5, 10, 15, 20, 23]
export const boardLabels = { home: '출발·도착', first: '첫 칸 (도)', center: '중앙' }

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
export interface BoardProps {
  state: YutSnapshot['publicState']; selected: number; destinations: YutMove[]
  focus?: boolean
  onPiece(team: number, piece: number): void; onMove(move: YutMove): void; onPing(node: number): void
}
export function Board({ state, selected, destinations, onPiece, onMove, onPing }: BoardProps) {
  return <div className="yut-board" aria-label="29칸 윷판">
    <svg viewBox="0 0 520 520" role="img" aria-label="오른쪽 아래에서 위로 출발하는 바깥길과 중앙 지름길">
      <path d="M60 60H460V460H60ZM60 60L460 460M460 60L60 460" fill="none" stroke="currentColor" strokeWidth="3" />
      {boardNodes.map(node => {
        const [x, y] = boardPoint(node)
        return <g key={node}><circle data-node={node} cx={x} cy={y} r={boardJunctions.includes(node) ? 18 : 13} />
          {node === 20 && <text x={440} y={491} textAnchor="end">{boardLabels.home}</text>}
          {node === 1 && <text x={426} y={351} textAnchor="end">{boardLabels.first}</text>}
          {node === 23 && <text x={x} y={y + 37} textAnchor="middle">{boardLabels.center}</text>}</g>
      })}
      <path d="M460 481V491H447M441 380H434V346H430M460 435V413M453 422L460 413L467 422" fill="none" stroke="#8b6a32" strokeWidth="2" />
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
      const destination = destinations.find(move => move.to === node)
      return <button key={`${team}:${piece}`} className={`yut-token yut-team-${team}${destination ? ' yut-destination' : ''}`}
        style={{ left: `${x / 5.2}%`, top: `${y / 5.2}%` }}
        aria-label={`${teamName(team)} ${piece + 1}번 말${count > 1 ? ` ${count}개 업힘` : ''}`}
        aria-pressed={team === state.team && state.pieces[team][selected] === node} onClick={() => destination ? onMove(destination) : onPiece(team, piece)}>{count > 1 ? count : piece + 1}</button>
    }))}
  </div>
}
