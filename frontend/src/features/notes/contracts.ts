import type { AnonymousNote } from '../../config/notes'
import type { Pose } from '../../network/worldClient'
import type { NoteTopic } from './topics'

/** FE context only. REST sends channelId, never the local user or coordinates. */
export interface NotesContext { userId: string; channelId: string; position: Pose }
export interface NoteSubmission { operationId: string; text: string; category?: NoteTopic }
export interface NoteReceipt { note: AnonymousNote; nextAllowedAt: number }
export class NotesServiceError extends Error {
  constructor(readonly code: string, message: string, readonly nextAllowedAt?: number) { super(message) }
}
export interface NotesService {
  readonly mode: 'mock' | 'server' | 'unavailable'
  readonly supportsTopics?: boolean
  read(context: NotesContext, signal: AbortSignal): Promise<AnonymousNote[]>
  submit(context: NotesContext, submission: NoteSubmission, signal: AbortSignal): Promise<NoteReceipt>
  subscribe(changed: () => void): () => void
}
