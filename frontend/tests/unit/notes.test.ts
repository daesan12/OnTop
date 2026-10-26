import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTES_BOX } from '../../src/config/notes'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { closeNotes, openNotes, refreshNotes, submitNote, watchNotes } from '../../src/features/notes/controller'
import { MockNotesService } from '../../src/features/notes/mock/MockNotesService'
import { notesService } from '../../src/features/notes/service'
import { editNoteDraft, useNotesState } from '../../src/features/notes/state'
import { canReachNotes, NOTES_TIMEOUT_MS, parseNotes, parseNoteText } from '../../src/features/notes/validation'
import { clearChannel, receive, resetWorld, useSession, type Pose } from '../../src/network/worldClient'
import { inputState, roamingInput } from '../../src/world/inputOwnership'
import { interactionAim } from '../../src/features/interactions/interactionAim'
import { getParkInteraction } from '../../src/features/interactions/parkInteraction'
import { useTelescopeState } from '../../src/features/telescopes/state'
import { NotesServiceError, type NoteReceipt } from '../../src/features/notes/contracts'

vi.mock('../../src/features/notes/service', async () => {
  const { MockNotesService } = await import('../../src/features/notes/mock/MockNotesService')
  return { notesService: new MockNotesService() }
})
const near: Pose = { x: NOTES_BOX.x, y: NOTES_BOX.y + 0.8, z: NOTES_BOX.z + 1.5, yaw: 0 }
const body = '오늘도 잘하고 있어요!'
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
function world(version = 1, position = near, mapVersion = EXPECTED_MAP_VERSION) {
  emit('WORLD_STATE', { channelId: 'a', version, mapVersion, avatars: ['101', '102'].map(userId => ({ userId,
    position: { ...position, lastInputSeq: 0, moving: false, running: false, swimming: false } })) })
}
const scope = (userId = '101', position = near) => ({ userId, channelId: 'a', position })
const signal = () => new AbortController().signal
const finish = async <T>(pending: Promise<T>) => { await vi.advanceTimersByTimeAsync(300); return pending }
const compose = async () => { expect(openNotes()).toBe(true); await vi.advanceTimersByTimeAsync(300); editNoteDraft(body) }
const receipt = (text = body): NoteReceipt => ({ note: { id: crypto.randomUUID(), text, createdAt: Date.now() }, nextAllowedAt: Date.now() + NOTES_BOX.cooldownMs })
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 60_000)
  resetWorld(); interactionAim.ready = false; roamingInput.ready = true
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  world()
})
afterEach(() => { vi.restoreAllMocks(); resetWorld(); Object.assign(notesService, { mode: 'mock' }); roamingInput.ready = false; vi.useRealTimers() })

describe('M08 anonymous notes, permissions and request lifetime', () => {
  it('validates 1~300 raw/normalized characters with NFC, controls and newlines', () => {
    expect(parseNoteText(' 가\n나\t\u200b\u0000 ')).toBe('가\n나')
    expect(parseNoteText('가'.normalize('NFD'))).toBe('가')
    expect(parseNoteText('가'.repeat(300))).toHaveLength(300)
    for (const text of ['', '  ', '\u200b', '가'.repeat(301)]) expect(parseNoteText(text)).toBeNull()
  })
  it('reuses the summit anchor, rejects ground/remote/nonfinite positions and selects the same E target', () => {
    expect(canReachNotes(near)).toBe(true)
    for (const pose of [{ ...near, y: .8 }, { ...near, x: near.x + 10 }, { ...near, z: NaN }]) expect(canReachNotes(pose)).toBe(false)
    expect(getParkInteraction()).toMatchObject({ id: 'tower-notes', kind: 'notes', available: true })
    useTelescopeState.setState({ pending: true }); expect(openNotes()).toBe(false)
  })
  it('allowlists anonymous fields, orders recent notes and limits the list to 120', () => {
    const rows = Array.from({ length: 125 }, (_, i) => ({ id: String(i), text: '글' + i, createdAt: i, userId: 'secret', nickname: 'private' }))
    const notes = parseNotes(rows)
    expect(notes).toHaveLength(120); expect(notes[0]!.id).toBe('124')
    expect(Object.keys(notes[0]!).sort()).toEqual(['createdAt', 'id', 'text'])
    expect(JSON.stringify(notes)).not.toMatch(/secret|private|nickname|userId/)
    for (const rows of [[{ id: 'bad', text: '', createdAt: 1 }], [{ id: 'bad', text: '글', createdAt: NaN }], [notes[0], notes[0]]]) expect(() => parseNotes(rows)).toThrow()
  })
  it('rejects direct ground reads/writes and aborted requests without creating notes', async () => {
    const service = new MockNotesService()
    const read = expect(service.read(scope('101', { ...near, y: .8 }), signal())).rejects.toThrow('정상')
    await vi.advanceTimersByTimeAsync(300); await read
    const write = expect(service.submit(scope('101', { ...near, y: .8 }), { operationId: 'a', text: body }, signal())).rejects.toThrow('정상')
    await vi.advanceTimersByTimeAsync(300); await write
    const abort = new AbortController()
    const cancelled = expect(service.submit(scope(), { operationId: 'a', text: body }, abort.signal)).rejects.toThrow('취소')
    abort.abort(); await cancelled
    expect(await finish(service.read(scope(), signal()))).toEqual([])
  })
  it('updates another nearby reader on one mock service without returning author fields', async () => {
    const service = new MockNotesService(), changed = vi.fn(), stop = service.subscribe(changed)
    const first = await finish(service.submit(scope('writer'), { operationId: 'intent', text: body }, signal()))
    expect(changed).toHaveBeenCalledOnce()
    const b = await finish(service.read(scope('reader'), signal()))
    expect(b).toEqual([first.note]); expect(Object.keys(b[0]!).sort()).toEqual(['createdAt', 'id', 'text'])
    b[0]!.text = 'changed'
    expect((await finish(service.read(scope(), signal())))[0]!.text).toBe(body)
    stop()
    await finish(service.submit(scope('another'), { operationId: 'next', text: '두 번째' }, signal()))
    expect(changed).toHaveBeenCalledOnce()
  })
  it('keeps only the latest 120 public notes after concurrent writers', async () => {
    const service = new MockNotesService()
    const writes = Array.from({ length: 121 }, (_, i) => service.submit(scope('user-' + i), { operationId: 'key-' + i, text: '메모 ' + i }, signal()))
    await vi.advanceTimersByTimeAsync(300); await Promise.all(writes)
    const notes = await finish(service.read(scope(), signal()))
    expect(notes).toHaveLength(120); expect(new Set(notes.map(n => n.id)).size).toBe(120)
    expect(notes.some(n => n.text === '메모 0')).toBe(false)
    expect(notes[0]!.text).toBe('메모 120')
  })
  it('reuses an acknowledged retry before cooldown and rejects a changed intent or new rapid post', async () => {
    const service = new MockNotesService(), submission = { operationId: 'key', text: body }
    const first = await finish(service.submit(scope(), submission, signal()))
    expect(await finish(service.submit(scope(), submission, signal()))).toEqual(first)
    const changed = expect(service.submit(scope(), { ...submission, text: '다른 글' }, signal())).rejects.toThrow('다른 메모')
    await vi.advanceTimersByTimeAsync(300); await changed
    const rapid = expect(service.submit(scope(), { operationId: 'new', text: body }, signal())).rejects.toThrow('15초')
    await vi.advanceTimersByTimeAsync(300); await rapid
    await vi.advanceTimersByTimeAsync(15000)
    await finish(service.submit(scope(), { operationId: 'new', text: body }, signal()))
    expect(await finish(service.read(scope(), signal()))).toHaveLength(2)
  })
  it('keeps a read failure separate from an empty list and supports a fresh read', async () => {
    const row = receipt().note
    vi.spyOn(notesService, 'read').mockRejectedValueOnce(new Error('조회 실패')).mockResolvedValueOnce([row])
    expect(openNotes()).toBe(true); await vi.advanceTimersByTimeAsync(1000)
    expect(useNotesState.getState()).toMatchObject({ loaded: false, loading: false, readError: '조회 실패' })
    expect(await refreshNotes()).toBe(true)
    expect(useNotesState.getState()).toMatchObject({ loaded: true, notes: [row], readError: '' })
  })
  it('retains text while pending, blocks double submit and adds one anonymous note only after acknowledgement', async () => {
    await compose()
    const pending = submitNote()
    expect(useNotesState.getState()).toMatchObject({ pending: true, draft: body })
    expect(await submitNote()).toBe(false)
    expect(await finish(pending)).toBe(true)
    expect(useNotesState.getState()).toMatchObject({ pending: false, draft: '', operationId: '' })
    expect(useNotesState.getState().notes.filter(n => n.text === body)).toHaveLength(1)
    expect(useNotesState.getState().notice).toContain('실제 서버')
  })
  it('preserves the exact failed draft and retry key; intentional text edits use a new intent', async () => {
    await compose(); editNoteDraft('  ' + body + '\n')
    const send = vi.spyOn(notesService, 'submit').mockRejectedValueOnce(new Error('저장 실패')).mockResolvedValueOnce(receipt())
    expect(await submitNote()).toBe(false)
    expect(useNotesState.getState().draft).toBe('  ' + body + '\n')
    const key = useNotesState.getState().operationId
    expect(await submitNote()).toBe(true); expect(send.mock.calls.map(c => c[1].operationId)).toEqual([key, key])
    closeNotes(); await compose(); useNotesState.setState({ nextAllowedAt: 0 })
    send.mockRejectedValue(new Error('저장 실패')); await submitNote()
    editNoteDraft('바꾼 내용'); expect(useNotesState.getState().operationId).toBe('')
    await submitNote(); expect(send.mock.calls.at(-1)![1].operationId).not.toBe(key)
  })
  it('times out a non-cooperating submission, ignores its late acknowledgement and retries the same key', async () => {
    await compose()
    let complete!: (value: NoteReceipt) => void
    const send = vi.spyOn(notesService, 'submit').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = submitNote(); await vi.advanceTimersByTimeAsync(NOTES_TIMEOUT_MS + 1)
    expect(await pending).toBe(false)
    const key = useNotesState.getState().operationId
    expect(useNotesState.getState()).toMatchObject({ pending: false, draft: body })
    expect(useNotesState.getState().error).toContain('초과')
    expect(send.mock.calls[0]![2].aborted).toBe(true)
    complete(receipt()); await Promise.resolve(); expect(useNotesState.getState().draft).toBe(body)
    send.mockResolvedValueOnce(receipt()); expect(await submitNote()).toBe(true)
    expect(send.mock.calls[1]![1].operationId).toBe(key)
  })
  it('cancels a closed visit and never lets an old response erase a new draft', async () => {
    await compose()
    let complete!: (value: NoteReceipt) => void
    vi.spyOn(notesService, 'submit').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = submitNote(); await vi.advanceTimersByTimeAsync(1); closeNotes()
    expect(await pending).toBe(false); expect(inputState.notesOpen).toBe(false)
    await compose(); editNoteDraft('새로 쓰는 글')
    complete(receipt()); await Promise.resolve(); expect(useNotesState.getState().draft).toBe('새로 쓰는 글')
  })
  it('closes on forced ground/remote movement and cancels an in-flight submit without losing text', async () => {
    await compose(); const pending = submitNote()
    world(2, { ...near, y: .8 })
    expect(await finish(pending)).toBe(false)
    expect(useNotesState.getState()).toMatchObject({ open: false, pending: false, draft: body, notes: [] })
    expect(openNotes()).toBe(false)
  })
  it('preserves only same-user reconnect drafts and clears on logout, channel change or another identity', async () => {
    await compose(); resetWorld('reconnecting')
    expect(useNotesState.getState()).toMatchObject({ open: false, draft: body, notes: [] })
    emit('CONNECTED', { userId: '101' }); clearChannel(false, true)
    expect(useNotesState.getState().draft).toBe(body)
    emit('CONNECTED', { userId: 'other' }); expect(useNotesState.getState().draft).toBe('')
    useSession.setState({ sessionId: '101', roomId: 'a', status: 'connected', mapCompatible: true }); world(); await compose()
    clearChannel(); expect(useNotesState.getState().draft).toBe('')
    useSession.setState({ roomId: 'a', mapCompatible: true }); world(); await compose(); resetWorld()
    expect(useNotesState.getState()).toMatchObject({ draft: '', ownerId: '', notes: [] })
  })
  it('invalidates the open list on map mismatch', async () => {
    await compose(); world(2, near, 'different')
    expect(useNotesState.getState()).toMatchObject({ open: false, draft: body, notes: [] })
    expect(openNotes()).toBe(false)
  })
  it('retains the draft after a malformed receipt and strips extra response fields from accepted notes', async () => {
    await compose()
    const send = vi.spyOn(notesService, 'submit').mockResolvedValueOnce({ ...receipt(), nextAllowedAt: NaN })
    expect(await submitNote()).toBe(false); expect(useNotesState.getState().draft).toBe(body)
    send.mockResolvedValueOnce({ ...receipt(), note: { ...receipt().note, nickname: 'secret' } } as NoteReceipt)
    expect(await submitNote()).toBe(true)
    expect(JSON.stringify(useNotesState.getState().notes)).not.toContain('secret')
  })
  it('cancels throttled subscription work on close and does not refetch a hidden visit', async () => {
    await compose()
    let changed = () => {}
    vi.spyOn(notesService, 'subscribe').mockImplementation(callback => { changed = callback; return vi.fn() })
    const reads = vi.spyOn(notesService, 'read')
    const stop = watchNotes(); changed(); closeNotes()
    await vi.advanceTimersByTimeAsync(2000); expect(reads).not.toHaveBeenCalled(); stop()
  })
  it('does not apply a previous visit read result after close and reopen', async () => {
    let complete!: (value: ReturnType<typeof parseNotes>) => void
    vi.spyOn(notesService, 'read').mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValue([])
    expect(openNotes()).toBe(true); await vi.advanceTimersByTimeAsync(1); closeNotes()
    expect(openNotes()).toBe(true); await vi.advanceTimersByTimeAsync(1)
    complete([receipt().note]); await vi.advanceTimersByTimeAsync(1)
    expect(useNotesState.getState()).toMatchObject({ loaded: true, notes: [], loading: false })
  })
  it('settles a non-cooperating read timeout and keeps the draft available for retry', async () => {
    const read = vi.spyOn(notesService, 'read').mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue([])
    expect(openNotes()).toBe(true); editNoteDraft(body)
    await vi.advanceTimersByTimeAsync(NOTES_TIMEOUT_MS + 1)
    expect(useNotesState.getState()).toMatchObject({ loading: false, loaded: false, draft: body })
    expect(useNotesState.getState().readError).toContain('초과')
    expect(read.mock.calls[0]![1].aborted).toBe(true)
    expect(await refreshNotes()).toBe(true)
    expect(useNotesState.getState()).toMatchObject({ loaded: true, notes: [], draft: body })
  })
  it('generates a timestamped operation only for a new intent, respecting write cooldown and terminal retry errors', async () => {
    await compose()
    const deadline = Date.now() + 15000
    const send = vi.spyOn(notesService, 'submit').mockRejectedValueOnce(new NotesServiceError('NOTES_WRITE_COOLDOWN', '잠시 후', deadline))
      .mockRejectedValueOnce(new NotesServiceError('NOTE_REMOVED', '삭제되었습니다'))
    expect(await submitNote()).toBe(false)
    const key = useNotesState.getState().operationId
    expect(key).toMatch(/^\d{13}_[A-Za-z0-9_-]{16,64}$/)
    expect(useNotesState.getState().nextAllowedAt).toBe(deadline)
    expect(await submitNote()).toBe(false); expect(send).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15000)
    expect(await submitNote()).toBe(false)
    expect(useNotesState.getState()).toMatchObject({ retryBlocked: true, operationId: key, draft: body })
    expect(await submitNote()).toBe(false); expect(send).toHaveBeenCalledTimes(2)
    closeNotes(); await compose()
    expect(useNotesState.getState().retryBlocked).toBe(true)
    editNoteDraft('새로운 마음 한 장'); expect(useNotesState.getState()).toMatchObject({ retryBlocked: false, operationId: '' })
  })
  it('polls every two seconds without overlapping requests and cancels all work on close', async () => {
    Object.assign(notesService, { mode: 'server' })
    let complete!: (rows: ReturnType<typeof parseNotes>) => void
    const read = vi.spyOn(notesService, 'read').mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValue([])
    expect(openNotes()).toBe(true); const stop = watchNotes()
    await vi.advanceTimersByTimeAsync(1999); expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6000); expect(read).toHaveBeenCalledTimes(2)
    complete([receipt().note]); await vi.advanceTimersByTimeAsync(1)
    expect(useNotesState.getState().notes).toHaveLength(1)
    closeNotes(); await vi.advanceTimersByTimeAsync(8000); expect(read).toHaveBeenCalledTimes(2); stop()
  })
  it('honors read cooldown without erasing old notes and replaces duplicate watchers', async () => {
    Object.assign(notesService, { mode: 'server' })
    const row = receipt().note, deadline = Date.now() + 7000
    const read = vi.spyOn(notesService, 'read').mockResolvedValueOnce([row])
      .mockRejectedValueOnce(new NotesServiceError('NOTES_READ_COOLDOWN', '조회 간격', deadline)).mockResolvedValue([row])
    expect(openNotes()).toBe(true); const oldStop = watchNotes(); const stop = watchNotes(); oldStop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(read).toHaveBeenCalledTimes(2)
    expect(useNotesState.getState()).toMatchObject({ notes: [row], nextReadAt: deadline, readError: '조회 간격' })
    await vi.advanceTimersByTimeAsync(4999); expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(3)
    resetWorld('reconnecting'); await vi.advanceTimersByTimeAsync(8000); expect(read).toHaveBeenCalledTimes(3); stop()
  })
})
