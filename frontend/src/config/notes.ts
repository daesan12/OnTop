import { OBSERVATION_TOWER } from './parkLayout'
import type { NoteTopic } from '../features/notes/topics'

export const NOTES_BOX = {
  x: OBSERVATION_TOWER.x - 1.5,
  y: OBSERVATION_TOWER.height + 0.12,
  z: OBSERVATION_TOWER.z - 1.5,
  interactionRadius: 2.6,
  maxLength: 300,
  capacity: 120,
  cooldownMs: 15000,
} as const

/** Applied only to the current generated park; preserve the legacy map contract. */
export const GENERATED_NOTES_BOARD_SETBACK = .45
/** Visible model envelope in metres, without avatar clearance or physics margin. */
export const NOTES_BOARD_SCALE = 2
export const NOTES_BOARD_BODY = {
  halfWidth: .651 * NOTES_BOARD_SCALE,
  halfDepth: .481 * NOTES_BOARD_SCALE,
  height: 1.721 * NOTES_BOARD_SCALE,
} as const
export interface AnonymousNote {
  id: string
  text: string
  createdAt: number
  category?: NoteTopic
}
export function parseAnonymousNote(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (
    Object.keys(data).length !== 1 ||
    typeof data.text !== 'string' ||
    data.text.length > NOTES_BOX.maxLength
  )
    return null
  const text = data.text
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}]/gu, '')
    .trim()
  return text.length > 0 && text.length <= NOTES_BOX.maxLength ? text : null
}
