import { createRoot } from 'react-dom/client'
import { Board3D } from '../../src/game/yutnori/Board3D'
import { defaultRules, type YutSnapshot } from '../../src/game/yutnori/contracts'
import '../../src/game/yutnori/yutnori.css'
import '../../src/game/yutnori/yutFocus.css'

const sample: YutSnapshot['publicState'] = {
  gameCode: 'YUTNORI', phase: 'PLAYING', channelId: 'channel-1', roomName: '입체 클릭 검수', host: '101', turnUser: '101',
  team: 0, teamCount: 4, pieceCount: 4, credits: 0, deadline: 0, winner: -1, reason: '', message: '', entryFee: 0,
  rules: defaultRules, players: [], rolls: [], pieces: [[1, 1, 0, 0], [3, 0, 0, 0], [23, 0, 0, 0], [20, 0, 0, 0]],
  moves: [], opening: [], log: [], chat: [], eliminatedTeams: [],
}
const root = document.getElementById('yut-board-3d-test')
if (root && import.meta.env.DEV) {
  createRoot(root).render(<div className="yut-shell yut-shell--match" style={{ width: 'min(900px, 100vw)', height: 'min(900px, 100dvh)', padding: 0 }}>
    <div className="yut-board-stage" style={{ width: '100%', height: '100%' }}><Board3D state={sample} selected={0}
      destinations={[{ piece: 0, rollId: 1, shortcut: false, to: 3 }]}
      onPiece={() => { root.dataset.action = 'SELECT' }} onMove={move => { root.dataset.action = 'MOVE'; root.dataset.destination = String(move.to) }}
      onPing={node => { root.dataset.action = 'PING'; root.dataset.destination = String(node) }} /></div>
  </div>)
}
