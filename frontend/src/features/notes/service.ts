import { NotesServiceError, type NotesService } from './contracts'
import { MockNotesService } from './mock/MockNotesService'
import { parkRuntime } from '../../park/runtime/runtime'
import { RestError } from '../../network/restError'
import { record } from '../../network/protocol'
import { parseNotes, parseNoteText } from './validation'
import { isNoteTopic } from './topics'

const messages: Record<string, string> = {
  INVALID_REQUEST: '메모 내용과 기기 시각을 확인해주세요. 같은 문제가 계속되면 새로고침해주세요.',
  NOTES_TEXT_INVALID: '메모를 1~300자로 적어주세요.',
  NOTES_OUT_OF_RANGE: '전망대 정상 메모함 가까이에서 다시 시도해주세요.',
  NOT_IN_CHANNEL: '공원 연결을 확인한 뒤 다시 시도해주세요.',
  NOTES_ACTIVITY_CONFLICT: '시설·수영·게임 이용을 마친 뒤 다시 시도해주세요.',
  IDEMPOTENCY_CONFLICT: '같은 요청으로 다른 메모를 게시할 수 없습니다. 원문을 확인해주세요.',
  NOTE_REMOVED: '이 요청의 메모는 목록에서 삭제되었습니다. 자동으로 다시 게시하지 않습니다. 새 글은 내용을 수정해 작성해주세요.',
  NOTES_REQUEST_EXPIRED: '이 메모 요청의 재확인 기간이 만료되었습니다. 자동으로 다시 게시하지 않습니다. 새 글은 내용을 수정해 작성해주세요.',
  NOTES_READ_COOLDOWN: '목록 조회 간격을 기다리고 있어요.',
  NOTES_WRITE_COOLDOWN: '잠시 후 새 메모를 붙여주세요.',
  NOTES_NOT_CONFIGURED: '익명 메모 서버 설정이 아직 준비되지 않았습니다. 작성 내용은 보관됩니다.',
  NOTES_UNAVAILABLE: '익명 메모 서버가 요청을 처리하지 못했습니다. 작성 내용은 보관됩니다.',
}
const instant = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN
function note(value: unknown) {
  if (!record(value) || typeof value.id !== 'string' || !/^[1-9]\d*$/.test(value.id)
    || typeof value.text !== 'string' || parseNoteText(value.text) !== value.text || !Number.isFinite(instant(value.createdAt)))
    throw new NotesServiceError('INVALID_RESPONSE', '메모 응답을 확인하지 못했습니다. 원문은 보관됩니다.')
  return { id: value.id, text: value.text, createdAt: instant(value.createdAt),
    ...(isNoteTopic(value.category) ? { category: value.category } : {}) }
}
/** Reads occur on open, explicit refresh, or a creation notification; no periodic polling. */
export function createNotesService(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>, supportsTopics = false): NotesService {
  async function call<T>(path: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
    if (init.signal?.aborted) throw new Error('메모 요청이 취소되었습니다.')
    try {
      const value = await requestJSON(path, init)
      if (init.signal?.aborted) throw new Error('메모 요청이 취소되었습니다.')
      return parse(value)
    } catch (error) {
      if (error instanceof NotesServiceError || init.signal?.aborted) throw error
      if (error instanceof RestError) {
        const nextAllowedAt = instant(error.nextAllowedAt)
        throw new NotesServiceError(error.code, messages[error.code]
          ?? (error.status === 404 ? messages.NOTES_NOT_CONFIGURED! : error.message),
          (error.code === 'NOTES_READ_COOLDOWN' || error.code === 'NOTES_WRITE_COOLDOWN') && Number.isFinite(nextAllowedAt)
            ? nextAllowedAt : undefined)
      }
      throw new NotesServiceError('NETWORK_ERROR', '메모 요청 결과를 확인하지 못했습니다. 원문은 보관되며 같은 요청으로 다시 시도할 수 있어요.')
    }
  }
  return {
    mode: 'server',
    supportsTopics,
    async read(context, signal) {
      if (!context.channelId) throw new NotesServiceError('INVALID_REQUEST', messages.INVALID_REQUEST!)
      return await call('/api/v1/notes?channelId=' + encodeURIComponent(context.channelId), { method: 'GET', signal }, value => {
        if (!record(value) || !Array.isArray(value.notes)) throw new NotesServiceError('INVALID_RESPONSE', '메모 목록을 확인하지 못했습니다.')
        // Duplicate IDs cannot render twice; conflicting duplicates are a malformed response.
        const rows = new Map<string, ReturnType<typeof note>>()
        for (const item of value.notes) {
          const row = note(item), previous = rows.get(row.id)
          if (previous && (previous.text !== row.text || previous.createdAt !== row.createdAt || previous.category !== row.category))
            throw new NotesServiceError('INVALID_RESPONSE', '메모 목록을 확인하지 못했습니다.')
          rows.set(row.id, row)
        }
        return parseNotes([...rows.values()])
      })
    },
    async submit(context, submission, signal) {
      const text = parseNoteText(submission.text)
      if (!text || !context.channelId || !/^\d{13}_[A-Za-z0-9_-]{16,64}$/.test(submission.operationId))
        throw new NotesServiceError('INVALID_REQUEST', messages.INVALID_REQUEST!)
      return await call('/api/v1/notes', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: submission.operationId, channelId: context.channelId, text,
          ...(supportsTopics && isNoteTopic(submission.category) ? { category: submission.category } : {}) }) }, value => {
        if (!record(value)) throw new NotesServiceError('INVALID_RESPONSE', '게시 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해주세요.')
        const row = note(value.note), nextAllowedAt = instant(value.nextAllowedAt)
        if (row.text !== text || (supportsTopics && row.category !== submission.category) || !Number.isFinite(nextAllowedAt) || nextAllowedAt < row.createdAt)
          throw new NotesServiceError('INVALID_RESPONSE', '게시 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해주세요.')
        return { note: row, nextAllowedAt }
      })
    },
    subscribe: () => () => {},
  }
}
export const notesService: NotesService = import.meta.env.DEV && ['facility-preview', 'notes-preview'].includes(import.meta.env.MODE)
  ? new MockNotesService()
  : createNotesService((path, init) => parkRuntime.requestJSON(path, init), import.meta.env.VITE_NOTES_CATEGORIES === 'true')
