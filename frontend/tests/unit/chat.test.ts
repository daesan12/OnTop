import { describe, it, expect } from 'vitest'
import { validateChat } from '../../src/park/runtime/runtime'
describe('chat uses the server codepoint contract', () => {
  it.each(['', '   ', 'a\nb', 'a\tb', 'a\u2028b', '\uD800', '\uDC00'])(
    'rejects invalid text %j',
    (value) => expect(() => validateChat(value)).toThrow(),
  )
  it('accepts 200 emoji codepoints and text-renders HTML strings', () => {
    expect(validateChat(' 👋 '.trim().repeat(200))).toHaveLength(400)
    expect(validateChat('<img src=x onerror=alert(1)>')).toContain('<img')
  })
  it('rejects the 201st codepoint', () =>
    expect(() => validateChat('가'.repeat(201))).toThrow())
})
