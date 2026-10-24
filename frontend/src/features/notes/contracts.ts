import type { AnonymousNote } from '../../config/notes'
import type { Pose } from '../../network/worldClient'

/** FE-only port. These fields do not define an approved HTTP/WS contract. */
export interface NotesContext { userId: string; channelId: string; position: Pose }
export interface NoteSubmission { operationId: string; text: string }
export interface NoteReceipt { note: AnonymousNote; nextAllowedAt: number }
export interface NotesService {
  readonly mode: 'mock' | 'unavailable'
  read(context: NotesContext, signal: AbortSignal): Promise<AnonymousNote[]>
  submit(context: NotesContext, submission: NoteSubmission, signal: AbortSignal): Promise<NoteReceipt>
  subscribe(changed: () => void): () => void
}
