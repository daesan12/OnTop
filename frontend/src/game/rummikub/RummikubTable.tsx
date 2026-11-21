import { useEffect } from 'react'
import { useRummikubDraft, toggleRummikubTile, sortRummikubTiles } from './draft'
import { COLOR_LABEL, COLORS, physical, validMeld, type Color, type Placed, type Rummikub, type Tile } from './protocol'

function TileButton({ tile, selected, disabled, onClick }: {
  tile: Tile | Placed; selected: boolean; disabled: boolean; onClick(): void
}) {
  const joker = physical(tile.id)?.color === null
  return <button className="rummi-tile" data-tile-id={tile.id} data-color={tile.color ?? 'BLACK'} aria-pressed={selected}
    aria-label={joker ? `조커${tile.color ? ` · ${COLOR_LABEL[tile.color]} ${tile.number}` : ''}` : `${COLOR_LABEL[tile.color!]} ${tile.number}`}
    title={joker ? '조커 · 대체 색상과 숫자를 지정하세요' : `${COLOR_LABEL[tile.color!]} ${tile.number}`}
    disabled={disabled} onClick={onClick}>
    {joker ? <img src="/art/rummikub/joker-ontop.png" alt="" style={{width:'70%'}}/> : <span>{tile.number}</span>}{joker && tile.color && <small>{tile.number}</small>}
  </button>
}

export function RummikubTable({ state, tiles, own, editable, sending, error, notice, onPlay, onDraw, onPing, pingIndices = [], tabletop = false }: {
  state: Rummikub; tiles: Tile[]; own: string; editable: boolean; sending: boolean; error: string; notice?: string
  tabletop?: boolean; pingIndices?: number[]; onPlay(melds: Placed[][]): void; onDraw(): void; onPing?(meld: number): void
}) {
  const ui = useRummikubDraft(), draft = ui.source===state ? ui.draft ?? state.melds : state.melds, {selected, sort, jokerColor, jokerNumber} = ui
  useEffect(() => { useRummikubDraft.setState({source:state,draft:state.melds.map(m=>[...m]),selected:[]}) }, [state])
  const setDraft = (draft: Placed[][]) => useRummikubDraft.setState({draft})
  const setSelected = (selected: string[]) => useRummikubDraft.setState({selected})
  const setSort = (sort: 'color' | 'number') => useRummikubDraft.setState({sort})
  const setJokerColor = (jokerColor: Color) => useRummikubDraft.setState({jokerColor})
  const setJokerNumber = (jokerNumber: number) => useRummikubDraft.setState({jokerNumber})
  const registered = state.players.find(p => p.userId === own)?.registered ?? false
  const ownIds = new Set(tiles.map(t => t.id)), placedIds = new Set(draft.flat().map(t => t.id))
  const rack = sortRummikubTiles(tiles.filter(t => !placedIds.has(t.id)), sort)
  const added = draft.flat().filter(t => ownIds.has(t.id))
  const points = added.reduce((sum, t) => sum + t.number, 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.melds)
  const valid = added.length > 0 && draft.every(validMeld) && (registered || points >= 30)
  const selectedJoker = selected.some(id => physical(id)?.color === null)
  const toggle = toggleRummikubTile
  function move(target: number | null) {
    const picked: Placed[] = selected.map(id => {
      const tile = draft.flat().find(t => t.id === id) ?? tiles.find(t => t.id === id)!
      return physical(id)?.color === null ? { id, color: jokerColor, number: jokerNumber }
        : { id, color: tile.color!, number: tile.number }
    })
    const next = draft.map(m => m.filter(t => !selected.includes(t.id)))
    const ordered = [...(target === null ? [] : next[target]!), ...picked].sort((a, b) => a.number - b.number || COLORS.indexOf(a.color) - COLORS.indexOf(b.color))
    if (target === null) next.push(ordered)
    else next[target] = ordered
    setDraft(next.filter(m => m.length)); setSelected([])
  }
  return <>
    <div className={`rummi-board${tabletop ? ' rummi-board-index' : ''}`} aria-label="공개 타일 조합">
      {draft.length === 0 && <p className="rummi-empty">손패에서 타일을 고른 뒤<br/><strong>새 조합</strong>으로 첫 수를 놓아보세요.</p>}
      {draft.map((meld, index) => {
        const original = !registered && index < state.melds.length
        return <div className="rummi-meld" data-ping={pingIndices.includes(index) || undefined} data-invalid={!validMeld(meld) || undefined} key={index} aria-label={`${index + 1}번 조합`}>
          <div className="rummi-meld-tiles">{tabletop && <span>{index+1}번 · </span>}{meld.map(tile => <TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)}
            disabled={!editable || original} onClick={() => toggle(tile.id)}/>)}</div>
          {editable && !original && selected.length > 0 && <button className="rummi-attach" onClick={() => move(index)}>{index + 1}번에 붙이기</button>}
          {!validMeld(meld) && <small>3개 이상인 유효한 조합으로 완성하세요</small>}
          {onPing && <button className="rummi-attach" aria-label={`${index + 1}번 조합 핑`} onClick={() => onPing(index)}>이 조합 주목</button>}
        </div>
      })}
    </div>
    {editable && <div className="rummi-edit-tools">
      <button disabled={!selected.length} onClick={() => move(null)}>새 조합 +</button>
      <button disabled={!selected.length || selected.some(id => !ownIds.has(id))} onClick={() => {
        setDraft(draft.map(m => m.filter(t => !selected.includes(t.id))).filter(m => m.length)); setSelected([])
      }}>손패로 되돌리기</button>
      <span>{selected.length ? `${selected.length}개 선택` : '타일을 선택하세요'}</span>
      {selectedJoker && <div className="rummi-joker-tools"><label>조커 색상 <select value={jokerColor} onChange={e => setJokerColor(e.target.value as Color)}>
        {COLORS.map(color => <option key={color} value={color}>{COLOR_LABEL[color]}</option>)}</select></label>
        <label>조커 숫자 <select value={jokerNumber} onChange={e => setJokerNumber(Number(e.target.value))}>
          {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label></div>}
    </div>}
    <div className="rummi-announcement" aria-live="polite">
      {error ? <p role="alert">{error}</p> : sending ? <p>서버의 처리 확인을 기다리고 있습니다.</p>
        : notice ? <p>{notice}</p> : editable ? <p>{registered ? '새 조합을 만들거나 공개된 조합을 재구성하세요.' : `첫 등록 ${points} / 30점 · 내 손패로만 조합을 만드세요.`}</p> : null}
    </div>
    {tiles.length > 0 && <div className="rummi-rack-wrap" aria-label="내 타일 받침대">
      {Array.from({ length: Math.max(1, Math.ceil(rack.length / 14)) }, (_, row) => <div className="rummi-rack" key={row}>
        {rack.slice(row * 14, (row + 1) * 14).map(tile => <TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)} disabled={!editable} onClick={() => toggle(tile.id)}/>)}
        {rack.length === 0 && <p>손패를 모두 놓았습니다. 턴을 확정하세요.</p>}
      </div>)}
    </div>}
    <footer className="rummi-controls">
      {tiles.length > 0 && <><button aria-pressed={sort === 'color'} onClick={() => setSort('color')}>색상 정렬</button>
        <button aria-pressed={sort === 'number'} onClick={() => setSort('number')}>숫자 정렬</button></>}
      {editable && <><button disabled={!dirty} onClick={() => { setDraft(state.melds.map(m => [...m])); setSelected([]) }}>되돌리기</button>
        <button disabled={dirty || sending} onClick={onDraw}>{state.poolCount ? '타일 뽑기' : '패스'}</button>
        <button className="rummi-primary" disabled={!valid || sending} onClick={() => onPlay(draft)}>턴 확정</button></>}
    </footer>
  </>
}
