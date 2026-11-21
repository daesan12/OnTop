import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { YutMatchHeader, YutMatchView } from '../../src/game/yutnori/YutMatchView'
import { defaultRules, type YutSnapshot } from '../../src/game/yutnori/contracts'
import type { YutClient } from '../../src/game/yutnori/client'
import '../../src/styles.css'
import '../../src/game/yutnori/yutnori.css'
import '../../src/game/yutnori/yutFocus.css'

// 개발 전용 화면 검수. 로그인·서버 게임 판정은 parkPreview에서 별도로 검증한다.
function Fixture() {
  const [selected, setSelected] = useState(-1), [chatFocus, focusChat] = useState(0)
  const [version, update] = useState(1)
  const backdo = new URLSearchParams(location.search).has('backdo')
  const roll = { id: 1, name: backdo ? '빽도' : '개', steps: backdo ? -1 : 2, mask: backdo ? 1 : 3, bonus: false }
  const snapshot: YutSnapshot = { gameId: 'yut-hud-fixture', version, role: 'PLAYER', registered: true,
    privateState: { teamChat: [] }, publicState: {
      gameCode: 'YUTNORI', phase: 'PLAYING', channelId: 'channel-1', roomName: '친구들과 함께하는 윷판', host: '101', turnUser: '101',
      team: 0, teamCount: 4, pieceCount: 4, credits: 1, deadline: Date.now() + 72000, winner: -1, reason: '', message: '', entryFee: 0,
      rules: defaultRules, players: ['온탑이', '나무늘보', '초록별', '달빛'].map((nickname, team) => ({ userId: String(101 + team), nickname, team, ready: true, connected: true })),
      rolls: [roll], pieces: [[1, 1, 0, 0], [7, 0, 0, 30], [23, 0, 0, 0], [20, 0, 0, 30]],
      moves: [{ piece: 0, rollId: 1, shortcut: false, to: 3 }], opening: [], openingTeams: [], log: ['청팀: 개 · 2칸 이동권', '홍팀 말 하나가 완주했어요.'],
      chat: [{ id: 1, scope: 'ALL', team: -1, userId: '102', nickname: '나무늘보', text: '다 같이 즐겁게 해요!', sentAt: Date.now() }], eliminatedTeams: [],
      lastThrow: { ...roll, id: version, userId: '101', team: 0, out: false, at: Date.now() },
    } }
  const client = { act: async (input: { type: string }) => { if (input.type === 'THROW') update(value => value + 1); return true }, feedback: async () => true, chat: async () => true } as unknown as YutClient
  return <div className="yut-shell yut-shell--match" data-team-count="4">
    <YutMatchHeader state={snapshot.publicState} status="내 차례예요" seconds={72} manual={false} pending={false} activeExit blocked={false} myTurn onManual={() => {}} onClose={() => {}} onChat={() => focusChat(value => value + 1)} />
    <YutMatchView client={client} snapshot={snapshot} user="101" busy={false} pending={false} myTurn selected={selected} activeRoll={roll}
      destinations={selected >= 0 ? snapshot.publicState.moves : []} onPiece={setSelected} onRoll={() => {}} onLeave={() => {}} chatFocusRequest={chatFocus}
      rules={<details className="yut-rules"><summary>우리 방 규칙</summary><p>빽도 무효 · 추가 기회 1회 · 실제 경로로 후퇴</p></details>} />
  </div>
}
const root = document.getElementById('yut-hud-test')
if (root && import.meta.env.DEV) createRoot(root).render(<Fixture />)
