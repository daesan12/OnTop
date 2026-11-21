import { create } from 'zustand'
import type { Color, Placed, Rummikub } from './protocol'

export const useRummikubDraft = create<{
  source: Rummikub | null; draft: Placed[][] | null; selected: string[]; sort: 'color' | 'number'; jokerColor: Color; jokerNumber: number
}>(() => ({ source:null, draft: null, selected: [], sort: 'color', jokerColor: 'RED', jokerNumber: 1 }))
export const toggleRummikubTile = (id: string) => useRummikubDraft.setState(s => ({
  selected: s.selected.includes(id) ? s.selected.filter(v => v !== id) : [...s.selected, id],
}))
