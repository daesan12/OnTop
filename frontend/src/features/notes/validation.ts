import { NOTES_BOX, parseAnonymousNote, type AnonymousNote } from '../../config/notes'
import type { Pose } from '../../network/worldClient'

export const NOTES_TIMEOUT_MS = 10_000
export const parseNoteText = (text: string) => parseAnonymousNote({ text })
export function canReachNotes(position: Pose | null | undefined): boolean {
  return !!position && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - NOTES_BOX.x, position.z - NOTES_BOX.z) <= NOTES_BOX.interactionRadius
    && Math.abs(position.y - NOTES_BOX.y - 0.8) < 0.7
}
/** Only anonymous display fields enter the store; never spread a service response. */
export function parseNotes(value: unknown): AnonymousNote[] {
  if (!Array.isArray(value)) throw new Error('메모 목록을 확인하지 못했습니다.')
  const ids = new Set<string>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('메모 목록을 확인하지 못했습니다.')
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || !row.id || typeof row.text !== 'string'
      || !parseNoteText(row.text) || typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)
      || row.createdAt < 0 || ids.has(row.id)) throw new Error('메모 목록을 확인하지 못했습니다.')
    ids.add(row.id)
    return { id: row.id, text: parseNoteText(row.text)!, createdAt: row.createdAt }
  }).sort((a, b) => b.createdAt - a.createdAt).slice(0, NOTES_BOX.capacity)
}
