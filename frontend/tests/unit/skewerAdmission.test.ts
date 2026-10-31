import { describe, expect, it, vi } from 'vitest'
import { ServerVrAdmission } from '../../src/features/vrZone/serverAdmission'
import { VrAdmissionError } from '../../src/features/vrZone/admission'
import { VrZoneController } from '../../src/features/vrZone/controller'

const receipt = { id: 'skewer-17', game: 'skewer', fee: 10, availableBalance: 90 }
function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  let owner = 'member-1'
  const paid = vi.fn()
  const request = vi.fn().mockResolvedValue(receipt)
  const context = { owner: () => owner, storage: () => storage, paid }
  return { values, request, paid, context, admission: new ServerVrAdmission(request, context),
    setOwner: (value: string) => { owner = value } }
}

describe('server skewer admission', () => {
  it('uses available coins, preserving the account reservation', async () => {
    const f = fixture()
    f.request.mockResolvedValue({ balance: 100, reservedBalance: 95, availableBalance: 5 })
    expect(await f.admission.balance()).toBe(5)
  })
  it('posts a fixed endpoint and idempotency key, then invalidates the authoritative wallet', async () => {
    const f = fixture()
    expect(await f.admission.start('skewer', 'request-1')).toEqual(receipt)
    expect(f.request).toHaveBeenCalledWith('/api/v1/minigames/skewer/admissions', {
      method: 'POST', headers: { 'Idempotency-Key': 'request-1' },
    })
    expect(f.values.size).toBe(0)
    expect(f.paid).toHaveBeenCalledWith('member-1', 'skewer-17')
  })
  it('reuses the uncertain request after a new page/controller rather than buying twice', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new TypeError('response lost'))
    await expect(f.admission.start('skewer', 'original')).rejects.toMatchObject({ uncertain: true })
    const restored = new ServerVrAdmission(f.request, f.context)
    await restored.start('skewer', 'new-page-key')
    expect(f.request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).toEqual(['original', 'original'])
  })
  it('does not share a pending request or a late receipt with another logged-in owner', async () => {
    const f = fixture()
    f.request.mockImplementationOnce(async () => { f.setOwner('member-2'); return receipt })
    await expect(f.admission.start('skewer', 'owner-1-key')).rejects.toMatchObject({ uncertain: true })
    expect(f.paid).not.toHaveBeenCalled()
    await f.admission.start('skewer', 'owner-2-key')
    expect(f.request.mock.calls[1][1].headers['Idempotency-Key']).toBe('owner-2-key')
    expect(f.values.get('ontop:skewer:pending-admission:member-1')).toBe('owner-1-key')
  })
  it('fails before POST when the pending request cannot be saved', async () => {
    const f = fixture()
    f.context.storage = () => { throw new Error('storage denied') }
    await expect(f.admission.start('skewer', 'key')).rejects.toMatchObject({ uncertain: false })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('keeps a malformed paid response recoverable and never falls back to local money', async () => {
    const f = fixture()
    f.request.mockResolvedValue({ ...receipt, fee: 1 })
    await expect(f.admission.start('skewer', 'key')).rejects.toMatchObject({ uncertain: true })
    expect(f.values.size).toBe(1)
    expect(f.paid).not.toHaveBeenCalled()
  })
  it('allows returning to the catalog after a definitive insufficient-balance rejection', async () => {
    const f = fixture()
    f.request.mockImplementation(async path => {
      if (path.endsWith('/me')) return { balance: 100, reservedBalance: 0, availableBalance: 100 }
      throw { status: 409, code: 'INSUFFICIENT_COINS' }
    })
    const zone = new VrZoneController(f.admission)
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    expect(await zone.authorize()).toBe(false)
    expect(zone.back()).toBe(true)
    expect(f.values.size).toBe(0)
  })
  it('ignores a previous visit purchase after disconnect/reconnect and retains its recovery key', async () => {
    const f = fixture()
    let finish!: (value: unknown) => void
    f.request.mockImplementation(async path => path.endsWith('/me')
      ? { balance: 100, reservedBalance: 0, availableBalance: 100 }
      : new Promise(resolve => { finish = resolve }))
    const zone = new VrZoneController(f.admission)
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    const pending = zone.authorize()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    zone.endVisit(); f.setOwner('member-2')
    finish(receipt)
    expect(await pending).toBe(false)
    expect(zone.store.getState()).toMatchObject({ phase: 'closed', receipt: null, purchasing: false })
    expect(f.values.size).toBe(1)
  })
  it('retains the same pending key when the server is temporarily unavailable', async () => {
    const f = fixture()
    f.request.mockRejectedValue({ status: 503, code: 'SKEWER_UNAVAILABLE' })
    await expect(f.admission.start('skewer', 'key')).rejects.toBeInstanceOf(VrAdmissionError)
    expect(f.values.size).toBe(1)
  })
  it('retains an uncertain receipt through an expired login instead of buying again after login', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new TypeError('lost paid response'))
      .mockRejectedValueOnce({ status: 401, code: 'AUTH_INVALID_ACCESS_TOKEN' })
    await expect(f.admission.start('skewer', 'original')).rejects.toMatchObject({ uncertain: true })
    await expect(f.admission.start('skewer', 'another')).rejects.toMatchObject({ uncertain: true })
    const restored = new ServerVrAdmission(f.request, f.context)
    await restored.start('skewer', 'after-login')
    expect(f.request.mock.calls.map(call => call[1].headers['Idempotency-Key']))
      .toEqual(['original', 'original', 'original'])
  })
})
