import { describe, expect, it, vi } from 'vitest'
import { createNotesService } from '../../src/features/notes/service'
import { NotesServiceError } from '../../src/features/notes/contracts'
import { RestError } from '../../src/network/restError'

const context = { userId: 'private', channelId: 'channel &1', position: { x: 54.5, y: 18.92, z: 48.5, yaw: 0 } }
const submission = { operationId: '1761436800000_0123456789abcdef', text: '  오늘도\u200b\n좋은 하루  ' }
const row = { id: '9007199254740993', text: '오늘도\n좋은 하루', createdAt: '2026-10-25T00:00:00Z' }
const receipt = { note: row, nextAllowedAt: '2026-10-25T00:00:15Z' }
const signal = () => new AbortController().signal

describe('M08 authenticated anonymous notes REST adapter', () => {
  it('uses the escaped channel query and only anonymous display fields, with stable numeric ID ordering', async () => {
    const request = vi.fn().mockResolvedValue({ notes: [
      { ...row, nickname: 'secret', userId: 'author' }, { ...row, id: '9007199254740994' }, row,
      { ...row, id: '9', createdAt: '2026-10-24T00:00:00Z' },
    ] })
    const service = createNotesService(request), abort = signal()
    const notes = await service.read(context, abort)
    expect(service.mode).toBe('server')
    expect(request).toHaveBeenCalledWith('/api/v1/notes?channelId=channel%20%261', { method: 'GET', signal: abort })
    expect(notes.map(n => n.id)).toEqual(['9007199254740994', row.id, '9'])
    expect(Object.keys(notes[1]!).sort()).toEqual(['createdAt', 'id', 'text'])
    expect(JSON.stringify(notes)).not.toMatch(/secret|author|nickname|userId/)
    expect(notes[0]!.createdAt).toBe(Date.parse(row.createdAt))
  })
  it('submits only the three contract fields and maps the server receipt', async () => {
    const request = vi.fn().mockResolvedValue(receipt), service = createNotesService(request), abort = signal()
    expect(await service.submit(context, submission, abort)).toEqual({ note: { ...row, createdAt: Date.parse(row.createdAt) }, nextAllowedAt: Date.parse(receipt.nextAllowedAt) })
    expect(request).toHaveBeenCalledWith('/api/v1/notes', expect.objectContaining({ method: 'POST', signal: abort }))
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({ operationId: submission.operationId, channelId: context.channelId, text: row.text })
  })
  it('retains exactly the same operation and body on uncertain retry without automatically posting again', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(receipt)
    const service = createNotesService(request)
    await expect(service.submit(context, submission, signal())).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(request).toHaveBeenCalledOnce()
    await expect(service.submit(context, submission, signal())).resolves.toMatchObject({ note: { id: row.id } })
    expect(request.mock.calls[0]![1].body).toBe(request.mock.calls[1]![1].body)
  })
  it.each([[403, 'NOTES_OUT_OF_RANGE'], [409, 'NOT_IN_CHANNEL'], [409, 'NOTES_ACTIVITY_CONFLICT'],
    [409, 'IDEMPOTENCY_CONFLICT'], [410, 'NOTE_REMOVED'], [410, 'NOTES_REQUEST_EXPIRED'],
    [503, 'NOTES_NOT_CONFIGURED'], [503, 'NOTES_UNAVAILABLE'], [404, 'HTTP_ERROR']])('keeps failure %s/%s distinct from an empty board or successful post', async (status, code) => {
    const request = vi.fn().mockRejectedValue(new RestError(Number(status), String(code), '오류')), service = createNotesService(request)
    await expect(service.read(context, signal())).rejects.toMatchObject({ code })
    await expect(service.submit(context, submission, signal())).rejects.toMatchObject({ code })
  })
  it.each(['NOTES_READ_COOLDOWN', 'NOTES_WRITE_COOLDOWN'])('validates %s server deadlines', async code => {
    const request = vi.fn().mockRejectedValueOnce(new RestError(429, code, '간격', receipt.nextAllowedAt))
      .mockRejectedValueOnce(new RestError(429, code, '간격', 'invalid'))
    const service = createNotesService(request)
    await expect(service.read(context, signal())).rejects.toMatchObject({ nextAllowedAt: Date.parse(receipt.nextAllowedAt) })
    await expect(service.read(context, signal())).rejects.toMatchObject({ nextAllowedAt: undefined })
  })
  it('accepts a genuine empty board, caps 120 and rejects malformed responses', async () => {
    const request = vi.fn().mockResolvedValueOnce({ notes: [] }), service = createNotesService(request)
    await expect(service.read(context, signal())).resolves.toEqual([])
    request.mockResolvedValueOnce({ notes: Array.from({ length: 125 }, (_, i) => ({ ...row, id: String(i + 1) })) })
    expect(await service.read(context, signal())).toHaveLength(120)
    for (const value of [{}, { notes: null }, { notes: [{ ...row, createdAt: 'bad' }] }, { notes: [{ ...row, id: 1 }] },
      { notes: [row, { ...row, text: '다른 내용' }] }]) {
      request.mockResolvedValueOnce(value)
      await expect(service.read(context, signal())).rejects.toBeInstanceOf(NotesServiceError)
    }
    for (const value of [{}, { ...receipt, nextAllowedAt: 'bad' }, { ...receipt, note: { ...row, text: '다른 내용' } },
      { ...receipt, nextAllowedAt: '2026-10-24T00:00:00Z' }]) {
      request.mockResolvedValueOnce(value)
      await expect(service.submit(context, submission, signal())).rejects.toBeInstanceOf(NotesServiceError)
    }
  })
  it('rejects invalid operation IDs and already aborted requests, and ignores a late ACK', async () => {
    const request = vi.fn(), service = createNotesService(request), abort = new AbortController()
    for (const operationId of ['random-uuid-only', '1761436800000_short', '1761436800000_' + 'x'.repeat(65)])
      await expect(service.submit(context, { ...submission, operationId }, signal())).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(request).not.toHaveBeenCalled()
    request.mockImplementation(async () => { abort.abort(); return receipt })
    await expect(service.submit(context, submission, abort.signal)).rejects.toThrow('취소')
    request.mockClear()
    await expect(service.read(context, abort.signal)).rejects.toThrow('취소')
    await expect(service.submit(context, submission, abort.signal)).rejects.toThrow('취소')
    expect(request).not.toHaveBeenCalled()
  })
})
