import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { COURSE, COURSE_COLLIDERS, COURSE_VERSION, MAP_VERSION, RULES_VERSION } from '../../src/features/jumpmap/course'
import { JUMP_GRACE } from '../../src/features/jumpmap/jumpGrace'

const file = new URL('../../docs/jumpmap/course.generated.json', import.meta.url)
const bytes = readFileSync(file)
const handoff = JSON.parse(bytes.toString('utf8'))
it('delivers the exact bytes covered by the checksum on Windows and Linux', () => {
  const checksum = readFileSync(new URL('../../docs/jumpmap/course.generated.sha256', import.meta.url), 'utf8').trim()
  expect(bytes.includes(13)).toBe(false)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(checksum)
})
it('keeps the exported collision contract and source fingerprints current with the accepted map', () => {
  expect(handoff).toMatchObject({ mapVersion: MAP_VERSION, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION,
    physics: { tickRate: JUMP_GRACE.tickRate, coyoteTicks: JUMP_GRACE.coyoteTicks, jumpBufferTicks: JUMP_GRACE.bufferTicks } })
  expect(handoff.pads).toEqual(JSON.parse(JSON.stringify(COURSE)))
  expect(handoff.colliders).toEqual(COURSE_COLLIDERS)
  for (const source of handoff.sources) {
    const text = readFileSync(new URL('../../' + source.path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n')
    expect(createHash('sha256').update(text).digest('hex'), source.path).toBe(source.sha256)
  }
})

it('keeps the packaged legacy BE course byte-identical to the FE handoff',()=>{expect(readFileSync(new URL('../../../backend/src/main/resources/world/jumpmap/course.generated.json',import.meta.url))).toEqual(bytes);expect(readFileSync(new URL('../../../backend/src/main/resources/world/jumpmap/course.generated.sha256',import.meta.url),'utf8').trim()).toBe(createHash('sha256').update(bytes).digest('hex'))})
