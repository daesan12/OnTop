import { create } from 'zustand'
import type { ParkSpeaker } from './parkDialogue'

export const useParkDialogue = create<{ speaker: ParkSpeaker | null; scope: string }>(() => ({ speaker: null, scope: '' }))
export function openParkDialogue(speaker: ParkSpeaker, scope: string) { useParkDialogue.setState({ speaker, scope }) }
export function closeParkDialogue() { useParkDialogue.setState({ speaker: null, scope: '' }) }
