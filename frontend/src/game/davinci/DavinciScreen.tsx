import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DavinciBoard } from './DavinciBoard'
import { CODE_VALUES, tileText, type CodeTile, type DavinciHand, type DavinciInput, type DavinciState } from './protocol'
import { estimatedServerTime } from '../../network/serverEventClock'
import './davinci.css'
import { openingActive, useSecretTileUI } from './presentation'

export interface DavinciScreenProps {
  tabletop?: boolean; gameId?: string
  state: DavinciState; hand: DavinciHand | null; viewerId: string; names: Record<string, string>
  enabled: boolean; busy: boolean; error: string; act(input: DavinciInput): void
  topActions: ReactNode; resultActions?: ReactNode; rewardStatus?: string; recover(): void
  chat?: { messages: { id: string; userId: string; text: string }[]; canSend: boolean; send(text: string): Promise<boolean> }
  ping?: { tileId: string | null; canSend: boolean; send(userId: string, tileId: string): Promise<boolean> }
}

const descriptions = {
  SETUP: '숫자는 오름차순, 같은 숫자는 검정부터 놓아요.', DRAW: '중앙에서 가져올 타일을 골라주세요.',
  PLACE_TILE: '뽑은 타일을 놓을 위치를 골라주세요.', GUESS: '상대의 비공개 타일을 선택하고 숫자를 추리해요.',
  CONTINUE: '정답이에요! 더 추리하거나 안전하게 차례를 마쳐요.', REVEAL: '추리에 실패했어요. 공개할 내 타일을 하나 골라주세요.',
  FINISHED: '마지막까지 자신의 비밀을 지켰어요.',
}

function TileButton({ tile, selected, disabled, onClick, label }: { tile: CodeTile; selected?: boolean; disabled?: boolean; onClick(): void; label: string }) {
  return <button type="button" className="davinci-tile-button" data-color={tile.color} data-revealed={tile.revealed || undefined}
    aria-label={label} aria-pressed={selected} disabled={disabled} onClick={onClick}>
    {tile.value === null ? <span aria-hidden="true">◇</span> : tile.value === -1 ? '−' : tile.value}
    {tile.revealed && <small>공개</small>}
  </button>
}

function RulesDialog({ close }: { close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const prior = document.activeElement, element = dialog.current!
    element.showModal()
    return () => { element.close(); if (prior instanceof HTMLElement && prior.isConnected) prior.focus() }
  }, [])
  return <dialog ref={dialog} className="davinci-rules" onCancel={event => { event.preventDefault(); close() }} aria-labelledby="davinci-rules-title">
    <header><h2 id="davinci-rules-title">흑백수사 · 게임 방법</h2><button onClick={close} autoFocus aria-label="게임 방법 닫기">닫기</button></header>
    <div><p>2~4명이 검정·흰색 타일 26개로 즐기는 숫자 추리 게임이에요. 상대의 타일을 모두 공개하고 마지막까지 살아남으세요.</p>
      <h3>준비와 정렬</h3><p>2~3인은 4개, 4인은 3개를 받아요. 숫자는 왼쪽에서 오른쪽으로 커지고, 같은 숫자는 검정이 먼저예요. 조커(−)의 위치는 직접 고르며, 한 번 놓인 타일들의 순서는 바꿀 수 없어요.</p>
      <h3>내 차례</h3><ol><li>중앙에서 타일을 하나 뽑고, 표시된 합법 위치에 놓아요. 중앙에 타일이 없으면 바로 추리해요.</li><li>상대의 비공개 타일을 선택하고 0~11 또는 조커를 말해요.</li><li>맞히면 상대 타일이 눕혀 공개돼요. 계속 추리하거나 차례를 마칠 수 있어요.</li></ol>
      <h3>추리에 실패하면</h3><p>첫 추리에 실패하면 이번 턴에 뽑은 타일을 공개해요. 추가 추리에 실패하거나 뽑을 타일이 없었다면, 내 비공개 타일 하나를 골라 공개하고 차례가 끝나요.</p>
      <h3>탈락과 온라인 진행</h3><p>내 타일이 전부 공개되면 탈락해요. 비공개 타일이 남은 마지막 한 명이 이겨요. 준비·차례 제한은 각각 120초예요. 준비 시간이 끝나면 현재 배치가 확정되고, 차례 시간이 끝나면 서버가 타일 하나를 공개한 뒤 차례를 넘겨요.</p>
      <p>관전자는 공개된 정보만 볼 수 있으며, 경기 채팅과 타일 추천 핑을 보낼 수 있어요.</p></div>
    <button className="davinci-primary" onClick={close}>알겠어요</button>
  </dialog>
}

export function DavinciScreen({ state, hand, viewerId, names, enabled, busy, error, act, topActions, resultActions, rewardStatus, recover, chat, ping, tabletop = false, gameId = 'preview' }: DavinciScreenProps) {
  const selection = useSecretTileUI(s => s.selection)
  const [guess, setGuess] = useState<number | null>(null), [rules, setRules] = useState(false)
  const [draft, setDraft] = useState(''), [chatBusy, setChatBusy] = useState(false), [chatError, setChatError] = useState('')
  const [now, setNow] = useState(estimatedServerTime)
  const me = state.players.find(p => p.userId === viewerId), ownTurn = state.turnUserId === viewerId
  const shuffling = tabletop && openingActive(state, now)
  const mayAct = enabled && !busy && !!me?.active && state.status === 'PLAYING' && !rules && !shuffling
  const selected = selection?.gameId === gameId && selection.version === state.version ? selection : null
  const name = (id: string) => names[id] ?? (id === viewerId ? '나' : '참가자')
  const target = selected && state.players.find(p => p.userId === selected.userId)
  const chosen = selected && (selected.userId === viewerId ? hand?.tiles : target?.tiles)?.find(t => t.id === selected.tileId)
  useEffect(() => { const timer = setInterval(() => setNow(estimatedServerTime()), 250); return () => clearInterval(timer) }, [])
  const seconds = state.turnDeadline ? Math.max(0, Math.ceil((Date.parse(state.turnDeadline) - now) / 1000)) : null
  const pick = (userId: string, tileId: string) => { useSecretTileUI.getState().pick(gameId, state.version, userId, tileId); setGuess(null) }
  useEffect(() => setGuess(null), [selected?.tileId, selected?.version])
  const jokerId = hand?.unplacedJokerIds[0]
  const positionOptions = state.stage === 'SETUP' && jokerId ? Array.from({ length: hand?.tiles.length ?? 0 }, (_, i) => i) : hand?.validPositions ?? []
  const event = state.lastEvent
  const eventText = event?.kind === 'GUESS' ? `${name(event.actorUserId)} → ${name(event.targetUserId ?? '')} · ${tileText(event.value)} 추리 ${event.correct ? '성공' : '실패'}`
    : event?.kind === 'DRAW' ? `${name(event.actorUserId)}님이 타일을 뽑았어요.`
      : event?.kind === 'TIMEOUT' ? `${name(event.actorUserId)}님의 시간이 끝나 타일이 공개됐어요.`
        : event?.kind === 'FORFEIT' ? `${name(event.actorUserId)}님이 기권했어요.` : '비밀을 지키고, 숫자의 실마리를 찾아보세요.'
  return <section className="davinci-screen" data-tabletop={tabletop || undefined} data-opening={shuffling || undefined} aria-label="흑백수사 경기">
    <header className="davinci-header"><div><h1>흑백수사</h1><p>숨겨진 숫자를 추리하세요</p></div>
      <nav aria-label="경기 메뉴"><button onClick={() => setRules(true)}>게임 방법</button>{topActions}</nav></header>
    <div className="davinci-layout">
      <aside className="davinci-players" aria-label="참가자 현황">{state.players.map(p => <div key={p.userId} data-turn={p.userId === state.turnUserId} data-out={!p.active}>
        <strong>{name(p.userId)}{p.userId === viewerId && <small> 나</small>}</strong>
        <span>{!p.active ? p.forfeited ? '기권' : '탈락' : state.stage === 'SETUP' ? p.ready ? '준비 완료' : '배치 중' : `비공개 ${p.tiles.filter(t => !t.revealed).length}개`}</span>
      </div>)}<p>{state.supply.length ? `중앙 타일 ${state.supply.length}개` : '중앙 타일 소진'}{seconds !== null && <span> · {seconds}초</span>}</p></aside>
      {!tabletop && <div className="davinci-board"><DavinciBoard state={state} hand={hand} viewerId={viewerId} selected={selected}
        enabled={mayAct && ownTurn} canPing={ping?.canSend} pingTileId={ping?.tileId}
        select={(userId, tileId) => { if (ping?.canSend) void ping.send(userId, tileId); else pick(userId, tileId) }}
        draw={tileId => act({ kind: 'draw', tileId })} reveal={tileId => pick(viewerId, tileId)} /></div>}
      <div className="davinci-log" role="status"><strong>게임 기록</strong><p>{eventText}</p></div>
      <section className="davinci-actions" aria-label="게임 조작">
        <div className="davinci-turn"><strong>{state.status === 'FINISHED' ? '경기 종료' : state.stage === 'SETUP' ? '타일 준비' : !me ? '관전 중' : !me.active ? '탈락 · 관전 중' : ownTurn ? '내 차례' : `${name(state.turnUserId ?? '')}님의 차례`}</strong></div>
        <p className="davinci-instruction">{shuffling ? '패를 섞고 있어요. 섞인 패가 각 자리로 나뉘면 숫자를 확인하세요.' : state.status === 'FINISHED' ? `${state.winnerUserIds.map(name).join(' · ')} 승리!` : descriptions[state.stage]}</p>
        {state.status === 'FINISHED' ? <><p>{rewardStatus ?? '공개 경기 결과예요.'}</p>{resultActions}</>
          : shuffling ? <p role="status">패 섞는 중 · 잠시만 기다려주세요</p> : state.stage === 'SETUP' && hand && !me?.ready ? <>
            <p>{jokerId ? '조커를 놓을 위치를 선택하세요.' : '내 타일을 확인하고 준비를 마쳐주세요.'}</p>
            {jokerId && <div className="davinci-positions">{positionOptions.map(position => <button key={position} disabled={!mayAct} onClick={() => act({ kind: 'place_joker', tileId: jokerId, position })}>{position === 0 ? '맨 왼쪽' : `${position + 1}번째`}</button>)}</div>}
            <button className="davinci-primary" disabled={!mayAct || !!jokerId} onClick={() => act({ kind: 'ready' })}>준비 완료</button></>
            : ownTurn && mayAct ? <>
              {state.stage === 'DRAW' && <div className="davinci-draw-options">{(['BLACK', 'WHITE'] as const).map(color => {
                const tile = state.supply.find(t => t.color === color), count = state.supply.filter(t => t.color === color).length
                return <button key={color} disabled={!tile} onClick={() => tile && act({ kind: 'draw', tileId: tile.id })}>{color === 'BLACK' ? '검정' : '흰색'} 뽑기 · {count}</button>
              })}</div>}
              {state.stage === 'PLACE_TILE' && <><p>뽑은 타일 · <b>{hand?.pendingTile?.color === 'BLACK' ? '검정' : '흰색'} {tileText(hand?.pendingTile?.value ?? null)}</b></p>
                <div className="davinci-positions">{positionOptions.map(position => <button key={position} onClick={() => act({ kind: 'place', position })}>{position === 0 ? '맨 왼쪽' : position === hand?.tiles.length ? '맨 오른쪽' : `${position + 1}번째`}</button>)}</div></>}
              {['GUESS', 'CONTINUE'].includes(state.stage) && <>
                <p>{target && target.userId !== viewerId ? `${name(target.userId)} · ${target.tiles.findIndex(t => t.id === selected?.tileId) + 1}번째 ${chosen?.color === 'BLACK' ? '검정' : '흰색'} 타일` : '상대 타일을 먼저 선택하세요.'}</p>
                <div className="davinci-numbers" aria-label="추리할 숫자">{CODE_VALUES.map(value => <button key={value} aria-pressed={guess === value}
                  disabled={!selected || selected.userId === viewerId || chosen?.revealed} onClick={() => setGuess(value)}>{value === -1 ? '조커' : value}</button>)}</div>
                <button className="davinci-primary" disabled={guess === null || !selected || selected.userId === viewerId || chosen?.revealed}
                  onClick={() => selected && guess !== null && act({ kind: 'guess', tileId: selected.tileId, targetUserId: selected.userId, value: guess })}>추리하기</button>
                {state.stage === 'CONTINUE' && <button onClick={() => act({ kind: 'stop' })}>여기서 멈추기</button>}</>}
              {state.stage === 'REVEAL' && <button className="davinci-primary" disabled={!chosen || selected?.userId !== viewerId || chosen.revealed}
                onClick={() => selected && act({ kind: 'reveal', tileId: selected.tileId })}>선택한 내 타일 공개</button>}
            </> : state.stage === 'SETUP' ? <p>다른 참가자가 타일을 준비하고 있어요.</p> : <p>{busy ? '행동을 확인하고 있어요.' : !enabled && me?.active ? '연결과 경기 상태를 확인해주세요.' : '공개된 숫자와 타일의 순서를 살펴보세요.'}</p>}
        {error && <div className="davinci-error" role="alert"><p>{error}</p><button onClick={recover}>경기 상태 다시 확인</button></div>}
      </section>
      <section className="davinci-accessible-tiles" aria-label="타일 선택">
        {state.players.map(p => <div key={p.userId}><strong>{name(p.userId)}</strong><div>{(p.userId === viewerId && hand ? hand.tiles : p.tiles).map((tile, index) => {
          const own = p.userId === viewerId
          const selectable = mayAct && ownTurn && (own ? state.stage === 'REVEAL' && !tile.revealed : ['GUESS', 'CONTINUE'].includes(state.stage) && !tile.revealed)
          return <TileButton key={tile.id} tile={shuffling ? { ...tile, value: null } : tile} selected={selected?.tileId === tile.id} disabled={!selectable && !ping?.canSend}
            label={`${name(p.userId)} ${index + 1}번째 ${tile.color === 'BLACK' ? '검정' : '흰색'} ${tileText(shuffling ? null : tile.value)}${tile.revealed ? ' 공개됨' : ''}`}
            onClick={() => { if (ping?.canSend && !selectable) void ping.send(p.userId, tile.id); else pick(p.userId, tile.id) }} />
        })}</div></div>)}
      </section>
      {chat && <details className="davinci-chat" aria-label="경기 채팅" open={tabletop ? undefined : true}><summary>경기 채팅{!me && ' · 타일을 눌러 추천 핑'}</summary>
        <div className="davinci-chat-log" role="log">{chat.messages.slice(-20).map(m => <p key={m.id}><b>{name(m.userId)}</b> {m.text}</p>)}</div>
        <form onSubmit={async event => { event.preventDefault(); if (!draft.trim() || chatBusy) return; setChatBusy(true); setChatError(''); try { if (await chat.send(draft.trim())) setDraft(''); else setChatError('채팅을 보내지 못했어요.') } finally { setChatBusy(false) } }}>
          <label><span className="davinci-sr-only">채팅 메시지</span><input value={draft} maxLength={200} disabled={!chat.canSend || chatBusy} onChange={e => setDraft(e.target.value)} placeholder="한마디 남겨보세요" /></label>
          <button disabled={!chat.canSend || chatBusy || !draft.trim()}>전송</button></form>{chatError && <p role="alert">{chatError}</p>}</details>}
    </div>
    {rules && <RulesDialog close={() => setRules(false)} />}
  </section>
}
