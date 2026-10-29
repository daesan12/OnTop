import { describe, expect, it, vi } from 'vitest'
import { NotesChangeEvents } from '../../src/features/notes/changeEvents'
import type { Envelope } from '../../src/network/protocol'

const event = (revision: unknown): Envelope => ({ type: 'NOTES_CHANGED', requestId: null, payload: { revision } })

describe('anonymous memo revision notifications', () => {
  it('deduplicates and orders decimal BIGINT revisions without number rounding', () => {
    const events = new NotesChangeEvents(), changed = vi.fn()
    events.subscribe(changed)
    for (const revision of ['9007199254740992', '9007199254740993', '9007199254740993', '2', '9223372036854775807'])
      events.accept(event(revision))
    expect(changed).toHaveBeenCalledTimes(3)
  })
  it('ignores malformed, request-scoped and content-bearing notifications', () => {
    const events = new NotesChangeEvents(), changed = vi.fn()
    events.subscribe(changed)
    for (const revision of [0, 1, null, '0', '-1', '01', '1.5', '1e3', '9223372036854775808', '1'.repeat(200)])
      events.accept(event(revision))
    events.accept({ ...event('2'), requestId: 'request' })
    events.accept({ ...event('2'), type: 'WORLD_STATE' })
    events.accept({ ...event('2'), payload: { revision: '2', text: '본문' } })
    expect(changed).not.toHaveBeenCalled()
    events.accept(event('1'))
    expect(changed).toHaveBeenCalledOnce()
  })
  it('starts a fresh revision stream on reconnect and detaches closed visits', () => {
    const events = new NotesChangeEvents(), closed = vi.fn(), active = vi.fn()
    const stop = events.subscribe(closed)
    events.accept(event('100'))
    stop(); stop()
    events.subscribe(active)
    events.reset()
    events.accept(event('1'))
    expect(closed).toHaveBeenCalledOnce()
    expect(active).toHaveBeenCalledOnce()
  })
})
