import { expect, type Page, type Route } from '@playwright/test'
type Mode = 'normal' | 'unavailable' | 'outOfRange' | 'cooldown' | 'unauthorizedOnce' | 'hold' | 'acceptThenLose'
interface Submission { operationId: string; channelId: string; text: string }
interface Receipt { receiptId: string; acceptedAt: string; nextAllowedAt: string }
/** REST contract fixture; receipt assertions do not prove real DB persistence. */
export async function feedbackFixture(page: Page) {
  let mode: Mode = 'normal', deadline = ''
  const requests: Submission[] = [], accepted = new Map<string, { submission: Submission; receipt: Receipt }>()
  const held: { route: Route; receipt: Receipt }[] = []
  await page.route('**/api/v1/feedback', async route => {
    const request = route.request(), submission = request.postDataJSON() as Submission
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    expect(request.headers()['content-type']).toContain('application/json')
    expect(Object.keys(submission).sort()).toEqual(['channelId', 'operationId', 'text'])
    requests.push(submission)
    const error = (status: number, code: string) => route.fulfill({ status, json: { code, message: code, nextAllowedAt: code === 'FEEDBACK_COOLDOWN' ? deadline : null } })
    if (mode === 'unauthorizedOnce') { mode = 'normal'; return error(401, 'UNAUTHENTICATED') }
    const existing = accepted.get(submission.operationId)
    if (existing) {
      if (JSON.stringify(existing.submission) !== JSON.stringify(submission)) return error(409, 'IDEMPOTENCY_CONFLICT')
      return route.fulfill({ status: 201, json: existing.receipt })
    }
    if (mode === 'unavailable') return error(503, 'FEEDBACK_NOT_CONFIGURED')
    if (mode === 'outOfRange') return error(403, 'FEEDBACK_OUT_OF_RANGE')
    if (mode === 'cooldown') { deadline = new Date(Date.now() + 15_000).toISOString(); return error(429, 'FEEDBACK_COOLDOWN') }
    const now = Date.now(), receipt = { receiptId: String(accepted.size + 1), acceptedAt: new Date(now).toISOString(), nextAllowedAt: new Date(now + 15_000).toISOString() }
    accepted.set(submission.operationId, { submission, receipt })
    if (mode === 'hold') { held.push({ route, receipt }); return }
    if (mode === 'acceptThenLose') return route.abort('failed')
    return route.fulfill({ status: 201, json: receipt })
  })
  return { requests, mode: (value: Mode) => { mode = value },
    get acceptedCount() { return accepted.size }, get deadline() { return deadline },
    async release() { for (const item of held.splice(0)) await item.route.fulfill({ status: 201, json: item.receipt }).catch(() => {}) },
  }
}
