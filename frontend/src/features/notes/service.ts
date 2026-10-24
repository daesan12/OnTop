import type { NotesService } from './contracts'
import { MockNotesService } from './mock/MockNotesService'

const unavailable = async (): Promise<never> => { throw new Error('익명 메모 서버 연결이 아직 준비되지 않았습니다.') }
export const notesService: NotesService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? new MockNotesService()
  : { mode: 'unavailable', read: unavailable, submit: unavailable, subscribe: () => () => {} }
