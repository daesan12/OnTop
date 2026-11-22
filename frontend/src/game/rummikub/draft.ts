import { create } from 'zustand'
import { COLORS, type Color, type Placed, type Rummikub, type Tile } from './protocol'
import { canRecallTiles, editTiles } from './edit'

type DraftStep = { source: Rummikub; draft: Placed[][]; selected: string[]; jokerColor: Color; jokerNumber: number }
const copyMelds = (melds: Placed[][]) => melds.map(m=>m.map(t=>({...t})))
export const useRummikubDraft = create<{
  source: Rummikub | null; draft: Placed[][] | null; selected: string[]; sort: 'color' | 'number'; jokerColor: Color; jokerNumber: number; hint: string; history: DraftStep[]
}>(() => ({ source:null, draft: null, selected: [], sort: 'color', jokerColor: 'RED', jokerNumber: 1, hint: '', history:[] }))

/** A server snapshot starts a new editing scope; confirmed turns cannot be undone. */
export function syncRummikubDraft(state: Rummikub) {
  if (useRummikubDraft.getState().source === state) return
  useRummikubDraft.setState({source:state,draft:copyMelds(state.melds),selected:[],hint:'',history:[]})
}

/** All board edits share one history. Selection, hints, and sorting are not moves. */
export function changeRummikubDraft(state: Rummikub, draft: Placed[][], hint: string) {
  const ui = useRummikubDraft.getState()
  if (ui.source !== state) return false
  const before = ui.draft ?? state.melds
  if (JSON.stringify(before) === JSON.stringify(draft)) {
    useRummikubDraft.setState({hint})
    return false
  }
  const step: DraftStep = {source:state,draft:copyMelds(before),selected:[...ui.selected],jokerColor:ui.jokerColor,jokerNumber:ui.jokerNumber}
  useRummikubDraft.setState({draft:copyMelds(draft),selected:[],hint,history:[...ui.history.slice(-99),step]})
  return true
}

export function undoRummikubDraft(state: Rummikub) {
  const ui = useRummikubDraft.getState(), step = ui.history.at(-1)
  if (ui.source !== state || step?.source !== state) return false
  useRummikubDraft.setState({draft:copyMelds(step.draft),selected:[...step.selected],jokerColor:step.jokerColor,jokerNumber:step.jokerNumber,
    history:ui.history.slice(0,-1),hint:'방금 한 동작을 한 단계 되돌렸습니다. 제한 시간은 계속 흐릅니다.'})
  return true
}
export const toggleRummikubTile = (id: string) => useRummikubDraft.setState(s => {
  const placed = !s.selected.includes(id) && id.startsWith('JOKER') ? s.draft?.flat().find(t => t.id === id) : null
  return { selected: s.selected.includes(id) ? s.selected.filter(v => v !== id) : [...s.selected, id],
    ...(placed ? {jokerColor:placed.color,jokerNumber:placed.number} : {}) }
})
export const sortRummikubTiles = (tiles: Tile[], sort: 'color' | 'number') => [...tiles].sort((a,b) => sort==='color'
  ? COLORS.indexOf(a.color!) - COLORS.indexOf(b.color!) || a.number-b.number
  : a.number-b.number || COLORS.indexOf(a.color!) - COLORS.indexOf(b.color!))

export function recallRummikubTiles(state: Rummikub, hand: Tile[], own: string) {
  const ui = useRummikubDraft.getState()
  if (ui.source !== state) return false
  const draft = ui.draft ?? state.melds
  if (!canRecallTiles(state, draft, hand, ui.selected)) {
    useRummikubDraft.setState({hint:'이번 턴에 내려놓은 내 패만 선택해 회수할 수 있습니다. 기존 공개 패와 공개 조커는 회수할 수 없습니다.'})
    return false
  }
  const result = editTiles(state, draft, hand, own, ui.selected, {kind:'rack'}, {color:ui.jokerColor,number:ui.jokerNumber})
  if (result.melds === draft) return false
  return changeRummikubDraft(state,result.melds,`${ui.selected.length}개 패의 배치를 취소하고 받침대로 회수했습니다. 제한 시간은 계속 흐릅니다.`)
}

export function cancelRummikubDraft(state: Rummikub) {
  const ui = useRummikubDraft.getState()
  if (ui.source !== state || JSON.stringify(ui.draft ?? state.melds) === JSON.stringify(state.melds)) return false
  return changeRummikubDraft(state,state.melds,'이번 턴의 배치를 모두 취소했습니다. 제한 시간은 계속 흐릅니다.')
}
