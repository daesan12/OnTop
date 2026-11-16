import type { Page } from '@playwright/test'

/**
 * One AudioBufferSourceNode start or stop of a jump rope pack file (`sfx/broom_hit`, `bgm_comedy_loop`) or of a park
 * period track (`park/park-day`), which the jump rope dialog must silence while it is open.
 */
export type PlayedSound = { kind: 'start' | 'stop'; file: string; at: number; offset: number; loop: boolean }

/**
 * Records the page's real Web Audio calls for the jump rope pack and the park period music, without any hook in
 * product code: each response is followed to its decoded buffer, then every source start and stop on it is logged.
 * `at` is `window.testClock()` when a test clock provides it, so it shares the test's own time scale.
 */
export async function recordJumpRopeAudio(page: Page) {
  await page.addInitScript(() => {
    const fetched = new WeakMap<ArrayBuffer, string>()
    const decoded = new WeakMap<AudioBuffer, string>()
    const played: unknown[] = []
    const probe = window as unknown as { jumpRopePlayed: unknown[]; testClock?: () => number }
    probe.jumpRopePlayed = played
    const arrayBuffer = Response.prototype.arrayBuffer
    Response.prototype.arrayBuffer = async function (this: Response) {
      const data = await arrayBuffer.call(this)
      // Blob and model responses have an empty url; the probe must never throw into the page's loaders.
      const pack = /\/audio\/jump-rope\/(.+)\.ogg(?:\?|$)/.exec(this.url)
      const park = /\/audio\/bgm\/(park-(?:day|dusk|night))\.ogg(?:\?|$)/.exec(this.url)
      if (pack) fetched.set(data, pack[1]!)
      else if (park) fetched.set(data, `park/${park[1]}`)
      return data
    }
    const decode = BaseAudioContext.prototype.decodeAudioData
    BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ...rest: never[]) {
      const name = fetched.get(data)
      const result = decode.call(this, data, ...rest)
      if (name) void result.then(buffer => decoded.set(buffer, name), () => {})
      return result
    } as typeof decode
    const record = (kind: string, source: AudioBufferSourceNode, offset = 0) => {
      const file = source.buffer && decoded.get(source.buffer)
      if (file) played.push({ kind, file, at: probe.testClock?.() ?? performance.now(), offset, loop: source.loop })
    }
    // Pass the caller's arguments through untouched: an explicit undefined duration is a non-finite error in Chromium.
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
      record('start', this, args[1])
      return start.apply(this, args)
    }
    const stop = AudioBufferSourceNode.prototype.stop
    AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args: Parameters<typeof stop>) {
      record('stop', this)
      return stop.apply(this, args)
    }
  })
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as { jumpRopePlayed: PlayedSound[] }).jumpRopePlayed)

/** The jump rope pack's starts and stops, in order. */
export const playedSounds = async (page: Page) => (await recorded(page)).filter(item => !item.file.startsWith('park/'))

/** Park period tracks still sounding: each start counts until a stop (a fade-out) is scheduled for it. */
export async function parkMusic(page: Page) {
  const park = (await recorded(page)).filter(item => item.file.startsWith('park/'))
  const starts = park.filter(item => item.kind === 'start')
  return { starts, playing: starts.length - park.filter(item => item.kind === 'stop').length }
}

/** File names of the started sounds, in order, without the `sfx/` folder. */
export const startedSounds = async (page: Page) =>
  (await playedSounds(page)).filter(item => item.kind === 'start').map(item => item.file.replace(/^sfx\//, ''))
