import { StrictMode, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { adminState, command, type State } from './api'
import { SceneLoadBoundary } from './SceneLoadBoundary'
import './style.css'

const initialParams = new URLSearchParams(location.search)
const short = (id: string) => id.slice(0, 8)
const time = (epoch: number) => new Date(epoch).toLocaleTimeString('ko-KR', { hour12: false })
const actionName: Record<string, string> = { PATROL: '공원 순찰', TALK: '대화 중', WATCH_OMOK: '오목 구경', RESPOND_TO_VIOLATION: '현장 방문' }
const ParkScene = lazy(() => import('./ParkScene').then(module => ({ default: module.ParkScene })))

function ModerationDetail({ assessment }: { assessment?: NonNullable<State['moderationAssessments']>[string] }) {
  if (!assessment) return null
  const verdict = assessment.verdict === 'VIOLATION' ? '모델 위반 판정' : assessment.verdict === 'UNCERTAIN' ? '모델 불확실 판정' : '모델 정상 판정'
  const gates = assessment.utteranceThreshold != null && assessment.utteranceProbability != null && assessment.contributionProbability != null
    ? `발화 ${assessment.utteranceProbability.toFixed(3)} / 기준 ${assessment.utteranceThreshold.toFixed(2)} · 구성 ${assessment.contributionProbability.toFixed(3)} / 기준 ${assessment.hideThreshold.toFixed(2)}`
    : `판단값 ${assessment.probability.toFixed(3)} / 가림 기준 ${assessment.hideThreshold.toFixed(2)}`
  const additional=assessment.profanityProbability!=null && assessment.mentionProbability!=null
    ? ` · 단순 욕설 ${assessment.profanityProbability.toFixed(3)} / 기준 ${assessment.profanityThreshold?.toFixed(2)} · 인용·신고 ${assessment.mentionProbability.toFixed(3)} / 보호 기준 ${assessment.mentionThreshold?.toFixed(2)}` : ''
  const reasons:Record<string,string>={HIDE_PROFANITY:'단순 욕설 가림',HIDE_PERSONAL_INSULT:'대인 모욕 가림',HIDE_INSULT_AND_PROFANITY:'욕설·모욕 가림',KEEP_CONTEXTUAL_MENTION:'인용·신고 문맥 유지',BELOW_HIDE_THRESHOLDS:'가림 기준 미충족',NO_VIOLATION_SIGNAL:'위반 신호 없음'}
  return <small className="moderation-detail">{assessment.provider} · 대인 모욕 {gates}{additional} · {verdict}{assessment.reason && ` · ${reasons[assessment.reason] ?? assessment.reason}`}{assessment.conversationIds && ` · 대화 ${assessment.conversationIds.length}개 함께 검사`}{assessment.spellingCandidateCount != null && ` · 표기 후보 ${assessment.spellingCandidateCount}개`}</small>
}

function App() {
  const [scope, setScope] = useState(initialParams.get('scope') || 'world:one')
  const [author, setAuthor] = useState(initialParams.get('role') === 'B' ? '산책자 B' : '산책자 A')
  const [state, setState] = useState<State | null>(null), [admin, setAdmin] = useState<State | null>(null)
  const [connected, setConnected] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [chat, setChat] = useState(''), [feedback, setFeedback] = useState(''), [question, setQuestion] = useState('')
  const [npcId, setNpcId] = useState('guide'), [tab, setTab] = useState('feedback'), [hint, setHint] = useState(false)
  const [sceneMode, setSceneMode] = useState<'3d' | '2d'>('3d')
  const feedbackKey = useRef({ text: '', author: '', key: '' })
  const operation = useRef(false)
  useEffect(() => {
    setState(null); setAdmin(null); setConnected(false)
    let active = true, socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (!active) return
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/dev/ai/ws?scope=${encodeURIComponent(scope)}&author=${encodeURIComponent(author)}`)
      socket.onopen = () => { if (active) setConnected(true) }
      socket.onmessage = event => { if (active) { try { setState(JSON.parse(String(event.data)) as State) } catch { setError('서버 상태를 읽지 못했습니다.') } } }
      socket.onclose = () => { if (active) { setConnected(false); retry = setTimeout(connect, 1500) } }
      socket.onerror = () => socket?.close()
    }
    connect()
    const abort = new AbortController()
    const refresh = async () => { try { const next = await adminState(scope, abort.signal, author); if (active) setAdmin(next) } catch { /* Connection status is shown independently. */ } }
    void refresh(); const timer = setInterval(() => void refresh(), 1500)
    return () => { active = false; clearTimeout(retry); clearInterval(timer); abort.abort(); socket?.close() }
  }, [scope, author])
  const run = useCallback(async (action: string, fields: Record<string, unknown> = {}) => {
    if (operation.current) return false
    operation.current = true; setBusy(true); setError('')
    try { await command(action, fields); return true }
    catch (cause) { setError(cause instanceof Error ? cause.message : '연결을 확인해주세요.'); return false }
    finally { operation.current = false; setBusy(false) }
  }, [])
  const sendChat = async () => { if (await run('chat', { author, scope, text: chat })) setChat('') }
  const sendFeedback = async () => {
    if (feedbackKey.current.text !== feedback || feedbackKey.current.author !== author) feedbackKey.current = { text: feedback, author, key: crypto.randomUUID() }
    if (await run('feedback', { author, text: feedback, operationId: feedbackKey.current.key })) { setFeedback(''); feedbackKey.current.text = '' }
  }
  const game = state?.game, npcs = state?.npcs ?? [], selected = npcs.find(n => n.id === npcId)
  const countdown = state ? Math.max(0, Math.ceil((state.operations.nextBatchAt - state.now) / 1000)) : 10
  const reports = admin?.reports ?? [], notices = admin?.notices ?? [], incidents = admin?.incidents ?? []
  const pending = reports.filter(r => !r.triage).length
  const visitor = state?.visitors?.find(v => v.author === author)
  return <main className="ai-lab">
    <header className="lab-heading"><div><p className="eyebrow">ONTOP · LOCAL PLAYGROUND</p><h1>살아 있는 공원, 함께 테스트해요.</h1><p className="subheading">여러 페르소나 NPC · 채팅 후처리 · 소리함 · 오목 판세 반응</p></div>
      <div className="connection"><i className={connected ? 'online' : ''}/><span>{connected ? '로컬 서버 연결됨' : '로컬 서버 연결 대기'}</span><small>개인 검수 · 실제 계정·재화·공용 DB 사용 없음</small></div></header>
    <div className="lab-banner"><span>{state?.mode ?? '서버를 먼저 실행해주세요'}</span><span>알림: {state?.notifier ?? 'LOCAL_CAPTURE'} · 정상 채팅도 AI 검사 대상입니다.</span></div>
    {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="오류 닫기">×</button></div>}
    <section className="lab-controls"><label>검수 사용자<select aria-label="검수 사용자" disabled={busy} value={author} onChange={e => setAuthor(e.target.value)}><option>산책자 A</option><option>산책자 B</option></select></label>
      <label>채팅 공간<select aria-label="채팅 공간" disabled={busy} value={scope} onChange={e => setScope(e.target.value)}><option value="world:one">공원 1</option><option value="world:two">공원 2</option><option value="game:omok">오목 경기</option></select></label>
      <a href={`/ai-lab.html?role=B&scope=${encodeURIComponent(scope)}`} target="_blank" rel="noreferrer">두 번째 사용자 창 ↗</a><span className="muted">이 화면의 사용자 선택은 로컬 테스트 대역입니다.</span></section>
    <div className="top-grid"><section className="card park-card"><div className="section-title"><h2>공원 산책</h2><div className="scene-mode-buttons"><button className={sceneMode === '3d' ? 'active' : ''} onClick={() => setSceneMode('3d')}>3D 공원</button><button className={sceneMode === '2d' ? 'active' : ''} onClick={() => setSceneMode('2d')}>2D 지도</button></div></div>
      {sceneMode === '3d' ? state ? <SceneLoadBoundary><Suspense fallback={<p className="scene-fallback">3D 공원 준비 중…</p>}><ParkScene state={state} selected={npcId} onSelect={setNpcId} author={author}
        onWalk={(x, z) => { if (connected && !busy) void run('walk', { author, scope, x, z }) }}
        onBoard={() => document.querySelector('.omok-board')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        onFeedback={() => { setTab('feedback'); requestAnimationFrame(() => { const field = document.getElementById('feedback-text'); field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); field?.focus({ preventScroll: true }) }) }}/></Suspense></SceneLoadBoundary> : <p className="empty">로컬 서버 연결을 기다리고 있습니다.</p> : <svg className="park-map" viewBox="0 0 32 22" aria-label="NPC 경유지 이동 검수 지도">
        <rect width="32" height="22" rx="1" fill="#e6eedc"/>
        <path d="M4 4H28V18H4Z" fill="none" stroke="#f6efdf" strokeWidth="2.4"/>
        <rect x="8" y="8" width="16" height="6" rx="1" fill="#b8ccac"/><text x="16" y="11" className="map-label">잔디 · 이동 제외 영역</text>
        <g transform="translate(16 2)"><rect x="-1.3" y="-.7" width="2.6" height="1.4" rx=".2" fill="#b58b61"/><text y="-1" className="map-label">오목판</text></g>
        <text x="4" y="2" className="map-label">소리함 / 채팅 발생 위치</text>
        {state?.route.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r=".16" fill="#7a9570"/>)}
        {state?.visitors?.map(v => <g key={v.author} transform={`translate(${v.x} ${v.z})`}><circle r=".5" fill={v.author === author ? '#be784b' : '#76699a'}/><text y=".2" className="npc-emoji">{v.author.endsWith('A') ? 'A' : 'B'}</text></g>)}
        {npcs.map(npc => <g key={npc.id} transform={`translate(${npc.x} ${npc.z})`} className="npc-marker" role="button" tabIndex={0}
          aria-label={`${npc.name} 선택`} onClick={() => setNpcId(npc.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNpcId(npc.id) } }}>
          <circle r={npc.id === npcId ? 1 : .8} fill={npc.id === 'police' ? '#335f7e' : '#756049'} stroke="#fff" strokeWidth=".15"/>
          <text y=".26" className="npc-emoji">{npc.id === 'police' ? '警' : '翁'}</text><text y="1.7" className="map-label npc-name">{npc.name}</text>
        </g>)}
      </svg>}<div className="npc-strip">{npcs.map(npc => <button key={npc.id} className={npcId === npc.id ? 'npc-chip selected' : 'npc-chip'} onClick={() => setNpcId(npc.id)}><strong>{npc.name}</strong><span>{actionName[npc.action] ?? npc.action}</span></button>)}</div>
      <div className="walk-controls"><p className="visitor-coordinate" data-testid="visitor-position" data-x={visitor?.x} data-z={visitor?.z}>{author} · {visitor ? `X ${visitor.x.toFixed(1)} / Z ${visitor.z.toFixed(1)} · ${visitor.moving ? '걷는 중' : '도착'}` : '서버 위치 대기'}</p>
        <div className="button-row">{[['소리함으로',4,4],['오목판 앞으로',16,4],['동쪽 산책',28,11],['남쪽 산책',16,18]].map(([label,x,z]) => <button key={label} disabled={!connected || busy} onClick={() => void run('walk', { author, scope, x, z })}>{label}</button>)}<button disabled={!connected || busy} onClick={() => void run('stopWalk', { author, scope })}>이동 중지</button></div></div>
    </section>
    <section className="card dialogue"><div className="section-title"><h2>{selected?.name ?? 'NPC 대화'}</h2><span>{selected?.speechSource || 'FIXED'}</span></div><p className="muted">{selected?.persona ?? '서버 연결을 기다리고 있습니다.'}</p>
      <div className="speech" aria-live="polite">{selected && selected.speechUntil > (state?.now ?? 0) ? selected.speech : '말을 걸거나, 공원에서 생기는 일에 어떻게 반응하는지 살펴보세요.'}</div>
      <form onSubmit={e => { e.preventDefault(); void run('talk', { npcId, text: question }) }}><label htmlFor="npc-question">NPC에게 물어보기</label><textarea id="npc-question" value={question} maxLength={400} rows={2} onChange={e => setQuestion(e.target.value)} placeholder="여기서 뭐 해요? 오목은 어떻게 해요?"/><div className="button-row"><button className="primary" disabled={busy || !connected || !question.trim()}>대화하기</button><button type="button" disabled={busy || !connected} onClick={() => void run('cancelTalk', { npcId })}>대화 취소</button></div></form>
      <p className="hint">도형 모델의 3D 검수 공원입니다. 제품 공원 물리·인증 연결은 팀 협의 후 적용합니다.</p>
    </section></div>
    <div className="middle-grid"><section className="card"><div className="section-title"><h2>오목 구경</h2><span>{game?.board.outcome === 'PLAYING' ? `${game.turn === 'BLACK' ? '흑' : '백'} 차례 · ${game.board.moveCount}수` : game?.board.outcome}</span></div>
      <div className="button-row"><button disabled={busy || !connected} onClick={() => void run('omokStart')}>새 경기</button><button disabled={busy || !connected} onClick={() => void run('omokSample')}>흑 우세 예제</button><button disabled={busy || !connected || !game || game.board.moveCount < 2 || game.board.outcome !== 'PLAYING'} onClick={() => void run('omokUndo')}>두 수 무르기</button></div>
      <div className="omok-board" role="group" aria-label="15 곱하기 15 렌주 오목판">{Array.from({ length: 225 }, (_, i) => { const x = i % 15, y = Math.floor(i / 15), stone = game?.board.board[y]?.[x] ?? 0
        const forbidden = game?.turn === 'BLACK' && game.board.forbiddenMoves.some(p => p.x === x && p.y === y)
        return <button key={i} className={`${stone === 1 ? 'stone-black' : stone === 2 ? 'stone-white' : ''} ${game?.board.lastMove?.x === x && game.board.lastMove.y === y ? 'last-move' : ''}`} aria-label={`좌표 ${x},${y}${stone ? ' 착수됨' : ''}${forbidden ? ' 흑 금수' : ''}`} disabled={busy || !connected || !game?.active || stone !== 0 || forbidden || game.board.outcome !== 'PLAYING'} onClick={() => void run('omokMove', { x, y })}>{stone ? <i/> : forbidden ? '×' : ''}</button>
      })}</div>
      <div className="analysis" aria-live="polite"><strong>{game?.analyzing ? '판세 분석 중…' : game?.analysis.comment ?? '새 경기를 시작해주세요.'}</strong><p>{game?.analysis.source ?? 'UNAVAILABLE'} · 깊이 {game?.analysis.depth ?? 0} · {game?.analysis.elapsedMs ?? 0}ms</p>
        {game?.analysis.blackEstimate != null && <><div className="evaluation-bar"><i style={{ width: `${game.analysis.blackEstimate * 100}%` }}/></div><small>흑 관점 엔진 추정 지표 {(game.analysis.blackEstimate * 100).toFixed(1)}% · 사람의 실제 승률이 아닙니다.</small></>}
        <label className="check"><input type="checkbox" checked={hint} onChange={e => setHint(e.target.checked)}/>로컬 연습용 추천 수 보기</label>{hint && game?.analysis.bestMove && <p>추천 좌표: {game.analysis.bestMove} (0부터 시작)</p>}
      </div></section>
    <section className="card chat-card"><div className="section-title"><h2>함께 나누는 대화</h2><span>{countdown}초 후 다음 검사</span></div><p className="hint">채팅은 자동으로 가리지 않습니다. 명백한 욕설은 규칙으로 경찰 안내·MM 알림을 요청하고, 최근 대화의 싸움 의심은 Jev로 점검합니다. 판단은 중재 요청이며 가해자 확정이나 자동 제재가 아닙니다.</p>
      <div className="chat-feed" role="log" aria-label="검수 채팅" aria-live="polite">{!state?.messages.length && <p className="empty">다른 창을 열어 대화를 나눠보세요.</p>}{state?.messages.map(message => <article key={message.id} className={message.hidden ? 'chat-message hidden' : 'chat-message'} data-message-id={message.id}><header><strong>{message.author}</strong><time>{time(message.sentAt)}</time></header><p>{message.text}</p><small>{message.hidden ? '가림 처리' : message.processed ? '검사 완료' : '검사 대기'} · v{message.version}</small><ModerationDetail assessment={admin?.moderationAssessments?.[message.id]}/></article>)}</div>
      <form onSubmit={e => { e.preventDefault(); void sendChat() }}><label htmlFor="chat-message">채팅 입력</label><div className="input-row"><input id="chat-message" value={chat} readOnly={busy} maxLength={400} onChange={e => setChat(e.target.value)} placeholder="메시지를 입력하세요"/><button className="primary" disabled={busy || !connected || !chat.trim()}>보내기</button></div></form>
      <div className="samples"><span>검수 문구</span>{['안녕하세요!', '씨발', '너 나가', '왜 시비 걸어'].map(text => <button key={text} disabled={busy} onClick={() => setChat(text)}>{text}</button>)}</div><button className="secondary" disabled={busy || !connected} onClick={() => void run('flush')}>기다리지 않고 지금 검사</button>
    </section></div>
    <section className="card operations"><div className="section-title"><h2>운영자의 작업대</h2><span>로컬 관리자 검수 · 운영 권한과 분리</span></div><nav className="tabs" aria-label="운영 검수 목록">{[['feedback', `소리함 ${reports.length}`], ['moderation', `채팅 검토 ${incidents.length}`], ['outbox', `알림함 ${notices.length}`]].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
      {tab === 'feedback' && <div className="operations-grid"><form onSubmit={e => { e.preventDefault(); void sendFeedback() }}><h3>소리함에 의견 남기기</h3><label htmlFor="feedback-text">의견 내용</label><textarea id="feedback-text" readOnly={busy} rows={4} value={feedback} minLength={5} maxLength={600} onChange={e => setFeedback(e.target.value)} placeholder="전체 접속 불가입니다 / 의상을 추가해주세요"/><button className="primary" disabled={busy || !connected || feedback.trim().length < 5}>의견 접수</button><p className="hint">일반 요약 09·12·15·18시 KST · 긴급은 분류 후 즉시 알림</p><button type="button" disabled={busy || !connected} onClick={() => void run('digest')}>정기 요약 지금 실행</button></form><div className="review-list"><p className="muted">{pending}건 분류 대기</p>{[...reports].reverse().map(report => <article key={report.id}><header><strong>#{short(report.id)}</strong><span>{report.triage ? `P${report.triage.severity} · ${report.triage.area}` : '접수 완료 · 분류 대기'}</span></header><p>{report.text}</p><small>{report.triage?.provider}{report.digestId ? ` · ${notices.find(n => n.key === report.digestId)?.status === 'SENT' ? '보고 완료' : '보고 전송 대기'}` : ''}</small></article>)}</div></div>}
      {tab === 'moderation' && <div className="review-list">{incidents.length === 0 && <p className="empty">검토할 사건이 없습니다.</p>}{[...incidents].reverse().map(incident => <article key={incident.id}><header><strong>{incident.kind === 'CONFLICT' ? '갈등 감지 · 갈등만으로 가리지 않음' : incident.kind === 'ABUSE_AND_CONFLICT' ? '모욕·갈등 동시 감지' : '모욕 감지'}</strong><span>{incident.scope} · {incident.messageIds.length}건</span></header><small>{incident.provider} · {time(incident.createdAt)} · 경찰 요청: {incident.policeStatus ?? 'LEGACY'} (도착 상태와 별개)</small>{admin?.reviewMessages?.filter(m => incident.messageIds.includes(m.chat.id)).map(m => <div key={m.chat.id} className="review-original"><p><strong>{m.chat.author}</strong>: {m.chat.text}</p>{m.hidden && <button disabled={busy} onClick={() => void run('restore', { messageId: m.chat.id })}>오탐 복원</button>}</div>)}</article>)}</div>}
      {tab === 'outbox' && <div className="review-list">{notices.length === 0 && <p className="empty">아직 알림이 없습니다. LOCAL_CAPTURE에서는 실제 MM 전송 없이 같은 대기열을 검수합니다.</p>}{[...notices].reverse().map(notice => <article key={notice.id}><header><strong>{notice.kind}</strong><span className={`notice-${notice.status}`}>{notice.status} · {notice.attempts}회</span></header><p>{notice.text}</p><small>#{short(notice.id)}{notice.sentAt ? ` · ${time(notice.sentAt)}` : ''}</small></article>)}<button disabled={busy || !connected} onClick={() => void run('retry')}>실패 알림·경찰 요청 다시 시도</button></div>}
      <footer className="failure-controls"><label className="check"><input type="checkbox" checked={state?.operations.decisionFailure ?? false} disabled={busy || !connected} onChange={e => void run('failures', { decisions: e.target.checked, notifier: state?.operations.notifierFailure ?? false })}/>분류 실패 재현</label><label className="check"><input type="checkbox" checked={state?.operations.notifierFailure ?? false} disabled={busy || !connected} onChange={e => void run('failures', { decisions: state?.operations.decisionFailure ?? false, notifier: e.target.checked })}/>알림 실패 재현</label><span role="status">{state?.operations.lastError || '미처리 작업은 로컬 파일에 보존됩니다.'}</span></footer>
    </section><footer className="lab-footer">OnTop AI 개인 로컬 검수 · API 키 없이 시작 가능 · 팀 협의 전 푸시·배포·공용 DB 적용 없음</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
