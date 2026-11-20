import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HORROR_CLIPS, loadHorrorClips } from '../../park-renewal-preview/horrorAudio'

const dir = fileURLToPath(new URL('../../park-renewal-preview/sounds/', import.meta.url))

describe('underground recorded clips (S15P31B105-450)', () => {
  it('ships every clip as small mono Ogg Opus, and nothing unused', () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.ogg')).sort()
    expect(files).toEqual(HORROR_CLIPS.map(n => `${n}.ogg`).sort())
    let total = 0
    for (const f of files) {
      const data = readFileSync(dir + f), size = statSync(dir + f).size
      expect(data.subarray(0, 4).toString('latin1')).toBe('OggS')
      const head = data.indexOf('OpusHead')
      expect(head).toBeGreaterThan(0)
      expect(data[head + 9]).toBe(1) // one channel
      expect(size).toBeLessThan(60_000)
      total += size
    }
    expect(total).toBeLessThan(250_000)
  })

  it('names its CC0 sources', () => {
    const readme = readFileSync(dir + 'README.md', 'utf8')
    for (const name of HORROR_CLIPS) expect(readme).toContain(`${name}.ogg`)
    expect(readme).toContain('CC0')
  })

  it('loads once per context and survives clips that fail', async () => {
    let calls = 0
    const ctx = { decodeAudioData: async (data: ArrayBuffer) => ({ duration: data.byteLength }) } as unknown as BaseAudioContext
    const fetcher = async (url: string) => { calls++; if (url.includes('dread')) throw new Error('404'); return new ArrayBuffer(4) }
    await loadHorrorClips(ctx, fetcher)
    await loadHorrorClips(ctx, fetcher)
    expect(calls).toBe(HORROR_CLIPS.length)
  })
})
