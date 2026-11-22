import { useEffect, useRef } from 'react'
import { cancelRummikubDraft, recallRummikubTiles, useRummikubDraft, toggleRummikubTile, sortRummikubTiles } from './draft'
import { COLOR_LABEL, COLORS, physical, validMeld, type Color, type Placed, type Rummikub, type Tile } from './protocol'
import ontopLogo from '../../assets/entry/ontop-logo.webp'
import { canRecallTiles, editTiles, type TileDestination } from './edit'
import { arrangeRummikubRack } from './controls'

function TileButton({ tile, selected, disabled, onClick }: {
  tile: Tile | Placed; selected: boolean; disabled: boolean; onClick(): void
}) {
  const joker = physical(tile.id)?.color === null
  return <button className="rummi-tile" data-tile-id={tile.id} data-color={tile.color ?? 'BLACK'} aria-pressed={selected}
    aria-label={joker ? `조커${tile.color ? ` · ${COLOR_LABEL[tile.color]} ${tile.number}` : ''}` : `${COLOR_LABEL[tile.color!]} ${tile.number}`}
    title={joker ? '조커 · 대체 색상과 숫자를 지정하세요' : `${COLOR_LABEL[tile.color!]} ${tile.number}`}
    disabled={disabled} onClick={onClick}>
    {joker ? <img src={ontopLogo} alt="" style={{width:'86%'}}/> : <span>{tile.number}</span>}{joker && tile.color && <small>{tile.number}</small>}
  </button>
}

export function RummikubTable({ state, tiles, own, editable, sending, error, notice, onPlay, onDraw, onPing, pingIndices = [], tabletop = false }: {
  state: Rummikub; tiles: Tile[]; own: string; editable: boolean; sending: boolean; error: string; notice?: string
  tabletop?: boolean; pingIndices?: number[]; onPlay(melds: Placed[][]): void; onDraw(): void; onPing?(meld: number): void
}) {
  const ui = useRummikubDraft(), draft = ui.source===state ? ui.draft ?? state.melds : state.melds, {selected, sort, jokerColor, jokerNumber} = ui
  const options = useRef<HTMLDetailsElement>(null)
  const selectedJoker = selected.some(id => physical(id)?.color === null)
  useEffect(() => { useRummikubDraft.setState({source:state,draft:state.melds.map(m=>[...m]),selected:[],hint:''}) }, [state])
  const setSelected = (selected: string[]) => useRummikubDraft.setState({selected})
  const setSort = arrangeRummikubRack
  const setJokerColor = (jokerColor: Color) => useRummikubDraft.setState({jokerColor})
  const setJokerNumber = (jokerNumber: number) => useRummikubDraft.setState({jokerNumber})
  const registered = state.players.find(p => p.userId === own)?.registered ?? false
  const ownIds = new Set(tiles.map(t => t.id)), placedIds = new Set(draft.flat().map(t => t.id))
  const rack = sortRummikubTiles(tiles.filter(t => !placedIds.has(t.id)), sort)
  const added = draft.flat().filter(t => ownIds.has(t.id))
  const points = added.reduce((sum, t) => sum + t.number, 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.melds)
  const valid = added.length > 0 && draft.every(validMeld) && (registered || points >= 30)
  const recallable = canRecallTiles(state, draft, tiles, selected)
  const toggle = toggleRummikubTile
  function move(target: number | null | 'rack') {
    if (target === 'rack') { recallRummikubTiles(state, tiles, own); return }
    const destination: TileDestination = target === null ? {kind:'new'} : {kind:'meld',index:target}
    const result = editTiles(state, draft, tiles, own, selected, destination, {color:jokerColor,number:jokerNumber})
    useRummikubDraft.setState({draft:result.melds,selected:[],hint:result.message})
  }
  const editor = <>
    <div className={`rummi-board${tabletop ? ' rummi-board-index' : ''}`} aria-label="공개 타일 조합">
      {draft.length === 0 && <p className="rummi-empty">{tabletop ? '테이블 위 타일을 선택하세요.' : <>손패에서 타일을 고른 뒤<br/><strong>새 조합</strong>으로 첫 수를 놓아보세요.</>}</p>}
      {draft.map((meld, index) => {
        const original = !registered && index < state.melds.length
        return <div className="rummi-meld" data-ping={pingIndices.includes(index) || undefined} data-invalid={!validMeld(meld) || undefined} key={index} aria-label={`${index + 1}번 조합`}>
          {tabletop ? <button className="rummi-meld-summary" disabled={!editable || original} aria-label={`${index+1}번 조합 선택`} onClick={()=>setSelected(meld.map(t=>t.id))}>
            <b>{index+1}</b><span>{!validMeld(meld) ? '편집 중' : meld.every(t=>t.number===meld[0]!.number) ? `${meld[0]!.number} 그룹` : `${COLOR_LABEL[meld[0]!.color]} ${meld[0]!.number}–${meld.at(-1)!.number}`}</span><small>{meld.length}개</small>
          </button> : <div className="rummi-meld-tiles">{meld.map(tile => <TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)}
            disabled={!editable || original} onClick={() => toggle(tile.id)}/>)}</div>}
          {editable && !original && selected.length > 0 && <button className="rummi-attach" onClick={() => move(index)}>{index + 1}번에 붙이기</button>}
          {!validMeld(meld) && <small>3개 이상인 유효한 조합으로 완성하세요</small>}
          {onPing && <button className="rummi-attach" aria-label={`${index + 1}번 조합 핑`} onClick={() => onPing(index)}>이 조합 주목</button>}
        </div>
      })}
    </div>
    {editable && (!tabletop || selected.length>0) && <div className="rummi-edit-tools">
      <button disabled={!selected.length} onClick={() => move(null)}>새 조합 +</button>
      <button disabled={!recallable} aria-keyshortcuts={tabletop ? 'B' : undefined} onClick={() => move('rack')}>선택 패 회수{tabletop && <> <kbd>B</kbd></>}</button>
      <span>{selected.length ? `${selected.length}개 선택` : '타일을 선택하세요'}</span>
      {selected.length>0 && <button onClick={()=>setSelected([])}>선택 해제</button>}
      {selectedJoker && <div className="rummi-joker-tools"><label>조커 색상 <select value={jokerColor} onChange={e => setJokerColor(e.target.value as Color)}>
        {COLORS.map(color => <option key={color} value={color}>{COLOR_LABEL[color]}</option>)}</select></label>
        <label>조커 숫자 <select value={jokerNumber} onChange={e => setJokerNumber(Number(e.target.value))}>
          {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label></div>}
    </div>}
    {tabletop && selected.length>0 && <p className="rummi-selection" aria-live="polite">{selected.map(id=>{const t=draft.flat().find(t=>t.id===id)??tiles.find(t=>t.id===id);return t ? physical(id)?.color===null ? '온탑 조커' : `${COLOR_LABEL[t.color!]} ${t.number}` : ''}).join(' · ')}</p>}
    {tabletop && <details className="rummi-tile-picker"><summary>타일 목록으로 선택{tiles.length>0 ? ` · 내 타일 ${rack.length}개` : ''}</summary>
      {draft.map((meld,index)=><div className="rummi-picker-row" key={index}><span>{index+1}번</span>{meld.map(tile=><TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)} disabled={!editable||!registered&&index<state.melds.length} onClick={()=>toggle(tile.id)}/>)}</div>)}
      {tiles.length>0 && <div className="rummi-picker-row" aria-label="내 타일 목록"><span>내 타일</span>{rack.map(tile=><TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)} disabled={!editable} onClick={()=>toggle(tile.id)}/>)}</div>}
    </details>}
    {!tabletop && tiles.length > 0 && <div className="rummi-rack-wrap" aria-label="내 타일 받침대">
      {Array.from({ length: Math.max(1, Math.ceil(rack.length / 14)) }, (_, row) => <div className="rummi-rack" key={row}>
        {rack.slice(row * 14, (row + 1) * 14).map(tile => <TileButton key={tile.id} tile={tile} selected={selected.includes(tile.id)} disabled={!editable} onClick={() => toggle(tile.id)}/>)}
        {rack.length === 0 && <p>손패를 모두 놓았습니다. 턴을 확정하세요.</p>}
      </div>)}
    </div>}
  </>
  return <>
    {tabletop ? <details ref={options} name="supae-dock" className="rummi-options"><summary>{selectedJoker ? '조커 설정' : '조합·정밀 선택'}{selected.length>0 ? ` · ${selected.length}개 선택` : ''}</summary>
      <div className="rummi-drawer"><button className="rummi-drawer-close" onClick={()=>{if(options.current)options.current.open=false}}>조작창 닫기</button>{editor}</div></details> : editor}
    <div className="rummi-announcement" data-important={!!error || !!notice || sending} aria-live="polite">
      {error ? <p role="alert">{error}</p> : sending ? <p>서버의 처리 확인을 기다리고 있습니다.</p>
        : notice ? <p>{notice}</p> : editable ? <p>{!registered && `첫 등록 ${points} / 30점 · `}{tabletop
          ? ui.hint || '드래그 배치 · B 선택 패 회수 · R 이번 턴 취소 · Esc 드래그 취소'
          : registered ? '새 조합을 만들거나 공개된 조합을 재구성하세요.' : '내 손패로만 조합을 만드세요.'}</p> : <p>테이블 위 조합을 살펴보세요.</p>}
    </div>
    <footer className="rummi-controls">
      {tiles.length > 0 && (tabletop ? <details name="supae-dock" className="rummi-sort rummi-secondary"><summary title="C · 색상순 / N · 숫자순">패 정리 <small>{sort === 'color' ? '색상순' : '숫자순'}</small></summary>
        <div className="rummi-drawer"><button className="rummi-drawer-close" onClick={e=>{const d=e.currentTarget.closest('details');if(d)d.open=false}}>패 정리 닫기</button>
          <p>받침대의 내 타일만 정리합니다.</p>
          <button aria-pressed={sort === 'color'} aria-keyshortcuts="C" onClick={() => setSort('color')}>색상 정렬 <kbd>C</kbd></button>
          <button aria-pressed={sort === 'number'} aria-keyshortcuts="N" onClick={() => setSort('number')}>숫자 정렬 <kbd>N</kbd></button>
          <p>같은 색의 연번은 색상순으로, 같은 숫자의 그룹은 숫자순으로 확인하세요.</p>
          <p>B · 선택한 미확정 내 패 회수 / R · 이번 턴 초안 전체 취소. 확정된 패는 회수할 수 없습니다.</p>
        </div></details> : <><button aria-pressed={sort === 'color'} onClick={() => setSort('color')}>색상 정렬</button>
        <button aria-pressed={sort === 'number'} onClick={() => setSort('number')}>숫자 정렬</button></>)}
      {editable && <>{selected.length > 0 && <button className="rummi-recall" disabled={!recallable} title="이번 턴에 내려놓은 내 패만 회수" aria-keyshortcuts={tabletop ? 'B' : undefined} onClick={() => recallRummikubTiles(state,tiles,own)}>선택 패 회수{tabletop && <> <kbd>B</kbd></>}</button>}
        <button className="rummi-secondary" disabled={!dirty} aria-keyshortcuts={tabletop ? 'R' : undefined} title="확정 전 이번 턴 배치를 전부 취소합니다. 제한 시간은 유지됩니다." onClick={() => cancelRummikubDraft(state)}>이번 턴 취소{tabletop && <> <kbd>R</kbd></>}</button>
        <button disabled={dirty || sending} onClick={onDraw}>{state.poolCount ? '타일 뽑기' : '패스'}</button>
        <button className="rummi-primary" disabled={!valid || sending} onClick={() => onPlay(draft)}>턴 확정</button></>}
    </footer>
  </>
}
