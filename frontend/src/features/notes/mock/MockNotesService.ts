import { NOTES_BOX, type AnonymousNote } from '../../../config/notes'
import type { NoteReceipt, NotesContext, NotesService, NoteSubmission } from '../contracts'
import { canReachNotes, parseNoteText } from '../validation'

/** M08_NOTES_MOCK_ONLY: one page, shared anonymous board; no persistence or cross-tab transport. */
export class MockNotesService implements NotesService {
  readonly mode = 'mock' as const
  #notes: AnonymousNote[] = []
  #receipts = new Map<string, NoteReceipt>()
  #nextAllowed = new Map<string, number>()
  #listeners = new Set<() => void>()
  constructor(private readonly delayMs = 240) {}
  private async ready(context: NotesContext, signal: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('익명 메모 목업 요청이 취소되었습니다.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, this.delayMs)
      if (signal.aborted) { abort(); return }
      signal.addEventListener('abort', abort, { once: true })
    })
    if (signal.aborted) throw new Error('익명 메모 목업 요청이 취소되었습니다.')
    if (!context.userId || !context.channelId || !canReachNotes(context.position))
      throw new Error('전망대 정상 메모함 가까이에서 이용해주세요.')
  }
  async read(context: NotesContext, signal: AbortSignal): Promise<AnonymousNote[]> {
    await this.ready(context, signal)
    return this.#notes.map(note => ({ ...note }))
  }
  async submit(context: NotesContext, submission: NoteSubmission, signal: AbortSignal): Promise<NoteReceipt> {
    await this.ready(context, signal)
    const text = parseNoteText(submission.text)
    if (!text || !submission.operationId) throw new Error('메모를 1~300자로 적어주세요.')
    // A random intent ID supports retries within this page, without storing an author on a note.
    const previous = this.#receipts.get(submission.operationId)
    if (previous) {
      if (previous.note.text !== text) throw new Error('같은 요청으로 다른 메모를 보낼 수 없습니다.')
      return { note: { ...previous.note }, nextAllowedAt: previous.nextAllowedAt }
    }
    const now = Date.now()
    if (now < (this.#nextAllowed.get(context.userId) ?? 0)) throw new Error('15초 후 새 메모를 붙여주세요.')
    const note = { id: crypto.randomUUID(), text, createdAt: now }
    const receipt = { note, nextAllowedAt: now + NOTES_BOX.cooldownMs }
    this.#notes = [note, ...this.#notes].slice(0, NOTES_BOX.capacity)
    this.#receipts.set(submission.operationId, receipt)
    this.#nextAllowed.set(context.userId, receipt.nextAllowedAt)
    for (const listener of this.#listeners) listener()
    return { note: { ...note }, nextAllowedAt: receipt.nextAllowedAt }
  }
  subscribe(changed: () => void) {
    this.#listeners.add(changed)
    return () => { this.#listeners.delete(changed) }
  }
}
