import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emotes, parseEmoteBindings } from '../../src/features/emotes/catalog'

const load = (path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

describe('deployed park bindings', () => {
  // A missing `emotes` field parses to {} and silently disables every emote in the wheel.
  it.each([
    'generated/park-renewal/park-bindings.json',
    'public/park-bindings.generated.dev.json',
    'public/park-bindings.generated.prod.json',
  ])('%s binds every authored emote', path => {
    expect(Object.keys(parseEmoteBindings(load(path).emotes)).sort())
      .toEqual(emotes.map(emote => emote.id).sort())
  })
})
