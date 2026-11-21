import { createRoot } from 'react-dom/client'
import { Board } from '../../src/game/yutnori/Board'
import { defaultRules, type YutSnapshot } from '../../src/game/yutnori/contracts'
import '../../src/game/yutnori/yutnori.css'

/** 서버 판정을 모방하지 않고 말 버튼이 목적지 클릭을 가로채지 않는지만 확인한다. */
const sample: YutSnapshot['publicState'] = {
  gameCode: 'YUTNORI', phase: 'PLAYING', channelId: 'channel-1', roomName: '클릭 검수', host: '101', turnUser: '101',
  team: 0, teamCount: 2, pieceCount: 1, credits: 0, deadline: 0, winner: -1, reason: '', message: '', entryFee: 0,
  rules: defaultRules, players: [], rolls: [], pieces: [[1], [3]], moves: [], opening: [], log: [], chat: [], eliminatedTeams: [],
}
const root = document.getElementById('yut-board-test')
if (root && import.meta.env.DEV) {
  createRoot(root).render(<div className="yut-shell" style={{ width: 600, background: '#193b2d' }}>
    <Board state={sample} selected={0} destinations={[{ piece: 0, rollId: 1, shortcut: false, to: 3 }]}
      onPiece={() => { root.dataset.action = 'SELECT' }} onMove={move => { root.dataset.action = 'MOVE'; root.dataset.destination = String(move.to) }} onPing={() => {}} />
  </div>)
}
