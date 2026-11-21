import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DavinciBoard } from './DavinciBoard'
import { CODE_VALUES, tileText, type CodeTile, type DavinciHand, type DavinciInput, type DavinciState } from './protocol'
import { estimatedServerTime } from '../../network/serverEventClock'
import './davinci.css'
import { openingActive, useSecretTileUI } from './presentation'
import { installDrawShortcut } from './shortcuts'

export interface DavinciScreenProps {
  tabletop?: boolean; gameId?: string
  state: DavinciState; hand: DavinciHand | null; viewerId: string; names: Record<string, string>
  enabled: boolean; busy: boolean; error: string; act(input: DavinciInput): void
  topActions: ReactNode; resultActions?: ReactNode; rewardStatus?: string; recover(): void
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
      <h3>내 차례</h3><ol><li>중앙 패를 직접 클릭하거나 R 키·무작위 뽑기 버튼으로 하나를 뽑아요. 무작위 선택은 서버가 처리해요. 표시된 합법 위치에 놓고, 중앙이 비면 바로 추리해요.</li><li>상대의 비공개 타일을 선택하고 0~11 또는 조커를 말해요.</li><li>맞히면 상대 타일이 눕혀 공개돼요. 계속 추리하거나 차례를 마칠 수 있어요.</li></ol>
      <h3>추리에 실패하면</h3><p>첫 추리에 실패하면 이번 턴에 뽑은 타일을 공개해요. 추가 추리에 실패하거나 뽑을 타일이 없었다면, 내 비공개 타일 하나를 골라 공개하고 차례가 끝나요.</p>
      <h3>탈락과 온라인 진행</h3><p>내 타일이 전부 공개되면 탈락해요. 비공개 타일이 남은 마지막 한 명이 이겨요. 준비·차례 제한은 각각 120초예요. 준비 시간이 끝나면 현재 배치가 확정되고, 차례 시간이 끝나면 서버가 타일 하나를 공개한 뒤 차례를 넘겨요.</p>
      <p>관전자는 공개된 정보만 볼 수 있으며, 경기 채팅과 타일 추천 핑을 보낼 수 있어요.</p></div>
    <button className="davinci-primary" onClick={close}>알겠어요</button>
  </dialog>
}

export function DavinciScreen({ state, hand, viewerId, names, enabled, busy, error, act, topActions, resultActions, rewardStatus, recover, ping, tabletop = false, gameId = 'preview' }: DavinciScreenProps) {
  const selection = useSecretTileUI(s => s.selection)
  const [guess, setGuess] = useState<number | null>(null), [rules, setRules] = useState(false)
  const [now, setNow] = useState(estimatedServerTime)
  const me = state.players.find(p => p.userId === viewerId), ownTurn = state.turnUserId === viewerId
  const shuffling = tabletop && openingActive(state, now)
  const mayAct = enabled && !busy && !!me?.active && state.status === 'PLAYING' && !rules && !shuffling
  const dock = useRef<HTMLElement>(null)
  const [compact, setCompact] = useState(false)
  const drawState = useRef({ allowed: false, act })
  drawState.current = { allowed: mayAct && ownTurn && state.stage === 'DRAW' && state.supply.length > 0, act }
  useEffect(() => installDrawShortcut(() => drawState.current.allowed, () => drawState.current.act({ kind: 'draw_random' })), [])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      for (const details of dock.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? [])
        if (!details.contains(event.target)) details.open = false
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [])
  useLayoutEffect(() => {
    const node = dock.current, root = node?.closest<HTMLElement>('.park-page') ?? node?.closest<HTMLElement>('.davinci-screen')
    if (!node || !root) return
    const update = () => {
      root.style.setProperty('--secret-tiles-dock-height', `${Math.ceil(node.getBoundingClientRect().height)}px`)
      const chat = root.querySelector('.park-chat')?.getBoundingClientRect()
      root.style.setProperty('--secret-common-chat-gap', `${chat ? Math.max(0, window.innerHeight - chat.top) : 0}px`)
    }
    const observer = new ResizeObserver(update)
    const observeChat = () => { const chat = root.querySelector('.park-chat'); if (chat) observer.observe(chat); update() }
    observer.observe(node)
    const mutations = new MutationObserver(observeChat)
    const chatLayer = root.querySelector('.park-chat-layer')
    if (chatLayer) mutations.observe(chatLayer, { childList: true, subtree: true })
    window.addEventListener('resize', update); observeChat()
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', update); root.style.removeProperty('--secret-tiles-dock-height'); root.style.removeProperty('--secret-common-chat-gap') }
  }, [tabletop])
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
  return <section className="davinci-screen" data-stage={state.stage} data-tabletop={tabletop || undefined} data-opening={shuffling || undefined} aria-label="흑백수사 경기">
    {!tabletop && <header className="davinci-header"><div><h1>흑백수사</h1><p>숨겨진 숫자를 추리하세요</p></div>
      <nav aria-label="경기 메뉴"><button onClick={() => setRules(true)}>게임 방법</button>{topActions}</nav></header>}
    <div className="davinci-layout">
      {!tabletop && <div className="davinci-board"><DavinciBoard state={state} hand={hand} viewerId={viewerId} selected={selected}
        enabled={mayAct && ownTurn} canPing={ping?.canSend} pingTileId={ping?.tileId}
        select={(userId, tileId) => { if (ping?.canSend) void ping.send(userId, tileId); else pick(userId, tileId) }}
        draw={tileId => act({ kind: 'draw', tileId })} reveal={tileId => pick(viewerId, tileId)} /></div>}
      <aside className="davinci-players" aria-label="참가자 현황">{state.players.map(p => <div key={p.userId} data-turn={p.userId === state.turnUserId} data-out={!p.active}>
        <strong title={name(p.userId)}>{name(p.userId)}{p.userId === viewerId && <small> 나</small>}</strong>
        <span>{!p.active ? p.forfeited ? '기권' : '탈락' : state.stage === 'SETUP' ? p.ready ? '준비 완료' : '배치 중' : `비공개 ${p.tiles.filter(t => !t.revealed).length}개`}</span>
      </div>)}<p>{state.supply.length ? `중앙 패 ${state.supply.length}개` : '중앙 패 소진'}{!tabletop && seconds !== null && <span> · {seconds}초</span>}</p></aside>
      <footer ref={dock} className="davinci-dock" aria-label="흑백수사 조작 패널" data-compact={compact || undefined} data-my-turn={ownTurn} onKeyDown={event => {
        if (!(event.target instanceof HTMLElement)) return
        if (['Enter', ' '].includes(event.key) && event.target.closest('summary')) {
          const owner = event.target.closest('details')
          for (const other of dock.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? [])
            if (other !== owner && !other.contains(owner)) other.open = false
          event.stopPropagation()
        }
        const details = event.target.closest('details[open]') as HTMLDetailsElement | null
        if (event.key === 'Escape' && details && !document.querySelector('dialog[open],[role="dialog"]')) {
          event.preventDefault(); event.stopPropagation(); details.open = false; details.querySelector('summary')?.focus()
        }
      }}>
      <section className="davinci-actions" aria-label="게임 조작">
        <div className="davinci-brief">
        <div className="davinci-turn"><strong>{state.status === 'FINISHED' ? '경기 종료' : state.stage === 'SETUP' ? '타일 준비' : !me ? '관전 중' : !me.active ? '탈락 · 관전 중' : ownTurn ? '내 차례' : `${name(state.turnUserId ?? '')}님의 차례`}</strong></div>
        <button className="davinci-fold" type="button" aria-expanded={!compact} aria-controls="davinci-command-body" onClick={() => setCompact(value => !value)}>{compact ? '조작 펼치기' : '접기'}</button>
        <p className="davinci-instruction">{shuffling ? '패를 섞고 있어요.' : state.status === 'FINISHED' ? `${state.winnerUserIds.map(name).join(' · ')} 승리!` : descriptions[state.stage]}</p>
        </div><div id="davinci-command-body" hidden={compact} className="davinci-command-body"><div className="davinci-commands">
        {state.status === 'FINISHED' ? <><p>{rewardStatus ?? '공개 경기 결과예요.'}</p>{resultActions}</>
          : shuffling ? <p role="status">패 섞는 중 · 잠시만 기다려주세요</p> : state.stage === 'SETUP' && hand && !me?.ready ? <>
            <p>{jokerId ? '조커 위치' : '내 패 확인 후 준비'}</p>
            {jokerId && <select className="davinci-position-select" aria-label="조커를 놓을 위치" value="" disabled={!mayAct}
              onChange={event => { if (event.target.value !== '') act({ kind: 'place_joker', tileId: jokerId, position: Number(event.target.value) }) }}>
              <option value="" disabled>조커 위치</option>{positionOptions.map(position => <option key={position} value={position}>{position === 0 ? '맨 왼쪽' : `${position + 1}번째`}</option>)}</select>}
            {jokerId && <div className="davinci-positions">{positionOptions.map(position => <button key={position} disabled={!mayAct} onClick={() => act({ kind: 'place_joker', tileId: jokerId, position })}>{position === 0 ? '맨 왼쪽' : `${position + 1}번째`}</button>)}</div>}
            {!jokerId && <button className="davinci-primary" disabled={!mayAct} onClick={() => act({ kind: 'ready' })}>준비 완료</button>}</>
            : ownTurn && mayAct ? <>
              {state.stage === 'DRAW' && <div className="davinci-draw-options">
                <button className="davinci-primary" aria-label="무작위 패 뽑기" aria-keyshortcuts="R" onClick={() => act({ kind: 'draw_random' })}><span className="davinci-draw-label">무작위 뽑기</span><span className="davinci-draw-short" aria-hidden="true">뽑기</span> <kbd>R</kbd></button>
                <p>중앙 패를 눌러 직접 선택</p>
              </div>}
              {state.stage === 'PLACE_TILE' && <><p>뽑은 타일 · <b>{hand?.pendingTile?.color === 'BLACK' ? '검정' : '흰색'} {tileText(hand?.pendingTile?.value ?? null)}</b></p>
                <select className="davinci-position-select" aria-label={`뽑은 ${hand?.pendingTile?.color === 'BLACK' ? '검정' : '흰색'} ${tileText(hand?.pendingTile?.value ?? null)} 패를 놓을 위치`} value=""
                  onChange={event => { if (event.target.value !== '') act({ kind: 'place', position: Number(event.target.value) }) }}>
                  <option value="" disabled>{hand?.pendingTile?.color === 'BLACK' ? '검정' : '흰색'} {tileText(hand?.pendingTile?.value ?? null)} · 위치</option>
                  {positionOptions.map(position => <option key={position} value={position}>{position === 0 ? '맨 왼쪽' : position === hand?.tiles.length ? '맨 오른쪽' : `${position + 1}번째`}</option>)}</select>
                <div className="davinci-positions">{positionOptions.map(position => <button key={position} onClick={() => act({ kind: 'place', position })}>{position === 0 ? '맨 왼쪽' : position === hand?.tiles.length ? '맨 오른쪽' : `${position + 1}번째`}</button>)}</div></>}
              {['GUESS', 'CONTINUE'].includes(state.stage) && <div className="davinci-guess-controls" data-target-selected={!!chosen && !!target && target.userId !== viewerId && !chosen.revealed}>
                <p className="davinci-guess-target">{target && target.userId !== viewerId ? `${name(target.userId)} · ${target.tiles.findIndex(t => t.id === selected?.tileId) + 1}번째 ${chosen?.color === 'BLACK' ? '검정' : '흰색'} 패` : '상대 패를 선택하세요.'}</p>
                <select className="davinci-number-select" aria-label={`${target ? `${name(target.userId)} ${target.tiles.findIndex(t => t.id === selected?.tileId) + 1}번째 패 · ` : ''}추리할 숫자`} value={guess ?? ''}
                  disabled={!selected || selected.userId === viewerId || chosen?.revealed} onChange={event => setGuess(event.target.value === '' ? null : Number(event.target.value))}>
                  <option value="" disabled>숫자</option>{CODE_VALUES.map(value => <option key={value} value={value}>{value === -1 ? '조커' : value}</option>)}</select>
                <div className="davinci-numbers" aria-label="추리할 숫자">{CODE_VALUES.map(value => <button key={value} aria-pressed={guess === value}
                  disabled={!selected || selected.userId === viewerId || chosen?.revealed} onClick={() => setGuess(value)}>{value === -1 ? '조커' : value}</button>)}</div>
                <div className="davinci-confirm-actions"><button className="davinci-primary" disabled={guess === null || !selected || selected.userId === viewerId || chosen?.revealed}
                  onClick={() => selected && guess !== null && act({ kind: 'guess', tileId: selected.tileId, targetUserId: selected.userId, value: guess })}>추리하기</button>
                {state.stage === 'CONTINUE' && <button aria-label="여기서 멈추기" onClick={() => act({ kind: 'stop' })}>멈추기</button>}</div></div>}
              {state.stage === 'REVEAL' && <button className="davinci-primary" disabled={!chosen || selected?.userId !== viewerId || chosen.revealed}
                onClick={() => selected && act({ kind: 'reveal', tileId: selected.tileId })}>선택한 내 타일 공개</button>}
            </> : state.stage === 'SETUP' ? <p>다른 참가자 준비 중</p> : <p>{busy ? '처리 중…' : !enabled && me?.active ? '경기 상태를 확인해주세요.' : !me || !me.active ? '관전 중' : '상대 차례'}</p>}
        </div>{error && <div className="davinci-error" role="alert"><p>{error}</p><button onClick={recover}>경기 상태 다시 확인</button></div>}
      <div className="davinci-dock-options">
      <details className="davinci-accessible-tiles" aria-label="타일 선택"><summary aria-label="패 목록 · 내 패와 상대 패 선택">패 목록</summary>
        <div className="davinci-tile-sheet">{state.players.map(p => <div key={p.userId} className="davinci-player-tiles"><strong>{name(p.userId)}</strong><div>{(p.userId === viewerId && hand ? hand.tiles : p.tiles).map((tile, index) => {
          const own = p.userId === viewerId
          const selectable = mayAct && ownTurn && (own ? state.stage === 'REVEAL' && !tile.revealed : ['GUESS', 'CONTINUE'].includes(state.stage) && !tile.revealed)
          return <TileButton key={tile.id} tile={shuffling ? { ...tile, value: null } : tile} selected={selected?.tileId === tile.id} disabled={!selectable && !ping?.canSend}
            label={`${name(p.userId)} ${index + 1}번째 ${tile.color === 'BLACK' ? '검정' : '흰색'} ${tileText(shuffling ? null : tile.value)}${tile.revealed ? ' 공개됨' : ''}`}
            onClick={() => { if (ping?.canSend && !selectable) void ping.send(p.userId, tile.id); else pick(p.userId, tile.id); dock.current?.querySelector<HTMLDetailsElement>('.davinci-accessible-tiles')?.removeAttribute('open') }} />
        })}</div></div>)}</div>
      </details>
      {ownTurn && mayAct && state.stage === 'DRAW' && <details className="davinci-pool-picker"><summary aria-label={`중앙 패 직접 고르기 · ${state.supply.length}개`}>중앙 패 {state.supply.length}개</summary>
        <div>{state.supply.map((tile, i) => <button key={tile.id} data-color={tile.color}
          aria-label={`중앙 ${i + 1}번째 ${tile.color === 'BLACK' ? '검정' : '흰색'} 패 뽑기`}
          onClick={() => act({ kind: 'draw', tileId: tile.id })}><span aria-hidden="true">◇</span><small>{i + 1}</small></button>)}</div>
      </details>}
      <details className="davinci-record"><summary>수사 기록</summary><div className="davinci-log" role="status"><strong>최근 수사 기록</strong><p>{eventText}</p></div></details>
      </div></div></section></footer>
    </div>
    {rules && <RulesDialog close={() => setRules(false)} />}
  </section>
}
