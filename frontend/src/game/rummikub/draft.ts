import { create } from 'zustand'
import { COLORS, type Color, type Placed, type Rummikub, type Tile } from './protocol'

export const useRummikubDraft = create<{
  source: Rummikub | null; draft: Placed[][] | null; selected: string[]; sort: 'color' | 'number'; jokerColor: Color; jokerNumber: number; hint: string
}>(() => ({ source:null, draft: null, selected: [], sort: 'color', jokerColor: 'RED', jokerNumber: 1, hint: '' }))
export const toggleRummikubTile = (id: string) => useRummikubDraft.setState(s => {
  const placed = !s.selected.includes(id) && id.startsWith('JOKER') ? s.draft?.flat().find(t => t.id === id) : null
  return { selected: s.selected.includes(id) ? s.selected.filter(v => v !== id) : [...s.selected, id],
    ...(placed ? {jokerColor:placed.color,jokerNumber:placed.number} : {}) }
})
export const sortRummikubTiles = (tiles: Tile[], sort: 'color' | 'number') => [...tiles].sort((a,b) => sort==='color'
  ? COLORS.indexOf(a.color!) - COLORS.indexOf(b.color!) || a.number-b.number
  : a.number-b.number || COLORS.indexOf(a.color!) - COLORS.indexOf(b.color!))
