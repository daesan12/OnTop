import { expect, type Page, type Route } from '@playwright/test'
import { isNoteTopic, type NoteTopic } from '../../src/features/notes/topics'

type Mode = 'normal' | 'unavailable' | 'outOfRange' | 'readCooldown' | 'writeCooldown' | 'unauthorizedOnce' | 'holdRead' | 'hold' | 'acceptThenLose' | 'removed' | 'expired'
interface Submission { operationId: string; channelId: string; text: string; category?: NoteTopic }
interface Row { id: string; text: string; createdAt: string; category?: NoteTopic }
interface Receipt { note: Row; nextAllowedAt: string }
export const createNotesFixtureStore = () => ({ rows: [] as Row[], revision: 0,
  accepted: new Map<string, { submission: Submission; receipt: Receipt }>(),
  changed: undefined as ((revision: string) => void) | undefined })
/** HTTP contract fixture only; not evidence of real backend DB persistence. */
export async function notesFixture(page: Page, store = createNotesFixtureStore()) {
  let readMode: Mode = 'normal', writeMode: Mode = 'normal', deadline = '', reads = 0
  const readTimes: number[] = [], requests: Submission[] = [], accepted = store.accepted
  const held: { route: Route; receipt?: Receipt; rows?: Row[] }[] = []
  await page.route('**/api/v1/notes**', async route => {
    const request = route.request(), url = new URL(request.url()), isRead = request.method() === 'GET'
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    expect(request.headers()['cache-control'] ?? '').not.toContain('max-age=')
    const mode = isRead ? readMode : writeMode
    const error = (status: number, code: string) => route.fulfill({ status, headers: { 'Cache-Control': 'no-store' }, json: { code, message: code,
      nextAllowedAt: code.includes('COOLDOWN') ? deadline : null } })
    if (isRead) {
      reads++; readTimes.push(Date.now())
      expect([...url.searchParams.keys()]).toEqual(['channelId']); expect(url.searchParams.get('channelId')).toBe('fixture-channel')
    } else {
      expect(request.method()).toBe('POST'); expect(url.search).toBe('')
      expect(request.headers()['content-type']).toContain('application/json')
      const submission = request.postDataJSON() as Submission
      expect(Object.keys(submission).sort()).toEqual(submission.category === undefined
        ? ['channelId', 'operationId', 'text'] : ['category', 'channelId', 'operationId', 'text'])
      if (submission.category !== undefined) expect(isNoteTopic(submission.category)).toBe(true)
      expect(submission.operationId).toMatch(/^\d{13}_[A-Za-z0-9_-]{16,64}$/)
      requests.push(submission)
    }
    if (mode === 'unauthorizedOnce') {
      if (isRead) readMode = 'normal'; else writeMode = 'normal'
      return error(401, 'UNAUTHENTICATED')
    }
    if (mode === 'unavailable') return error(503, 'NOTES_NOT_CONFIGURED')
    if (mode === 'outOfRange') return error(403, 'NOTES_OUT_OF_RANGE')
    if (mode === 'readCooldown' || mode === 'writeCooldown') {
      if (!deadline) deadline = new Date(Date.now() + 6000).toISOString()
      return error(429, isRead ? 'NOTES_READ_COOLDOWN' : 'NOTES_WRITE_COOLDOWN')
    }
    if (isRead) {
      if (mode === 'holdRead') { held.push({ route, rows: [...store.rows] }); return }
      return route.fulfill({ json: { notes: store.rows }, headers: { 'Cache-Control': 'no-store' } })
    }
    if (mode === 'removed' || mode === 'expired') return error(410, mode === 'removed' ? 'NOTE_REMOVED' : 'NOTES_REQUEST_EXPIRED')
    const submission = requests.at(-1)!, existing = accepted.get(submission.operationId)
    if (existing) {
      if (JSON.stringify(existing.submission) !== JSON.stringify(submission)) return error(409, 'IDEMPOTENCY_CONFLICT')
      return route.fulfill({ status: 201, json: existing.receipt })
    }
    const now = Date.now(), note = { id: String(store.rows.length + 1), text: submission.text,
      createdAt: new Date(now).toISOString(), category: submission.category ?? 'free' as const }
    const receipt = { note, nextAllowedAt: new Date(now + 15000).toISOString() }
    store.rows = [note, ...store.rows].slice(0, 120); accepted.set(submission.operationId, { submission, receipt })
    store.changed?.(String(++store.revision))
    if (mode === 'hold') { held.push({ route, receipt }); return }
    if (mode === 'acceptThenLose') return route.abort('failed')
    return route.fulfill({ status: 201, json: receipt })
  })
  return { requests, readTimes, readMode: (mode: Mode) => { readMode = mode }, writeMode: (mode: Mode) => { writeMode = mode },
    get reads() { return reads }, get acceptedCount() { return accepted.size }, get deadline() { return deadline },
    add(text: string, category: NoteTopic = 'free') { store.rows = [{ id: String(store.rows.length + 1), text,
      createdAt: new Date().toISOString(), category }, ...store.rows] },
    async release() { for (const item of held.splice(0)) await item.route.fulfill({ status: item.receipt ? 201 : 200,
      json: item.receipt ?? { notes: item.rows } }).catch(() => {}) },
  }
}
