import { expect, it } from 'vitest'
import { selectedFeedbackTopic, withFeedbackTopic } from '../../src/features/feedback/feedbackTopics'

it('changes and deselects a topic without losing a private draft or its newlines', () => {
  const text = '산책로 의견입니다.\n안내를 늘려주세요.'
  const first = withFeedbackTopic(text, 'map')!
  expect(first).toBe(`[맵 및 시설] ${text}`)
  expect(selectedFeedbackTopic(first)).toBe('map')
  const changed = withFeedbackTopic(first, 'bug')!
  expect(changed).toBe(`[오류/버그] ${text}`)
  expect(withFeedbackTopic(changed, 'bug')).toBe(text)
})
it('counts the topic in the 600-character contract without silently truncating text', () => {
  const full = '가'.repeat(600)
  expect(withFeedbackTopic(full, 'map')).toBeNull()
  const labelled = `[맵 및 시설] ${'가'.repeat(591)}`
  expect(withFeedbackTopic(labelled, 'map')).toBe('가'.repeat(591))
  expect(selectedFeedbackTopic('의견 중간의 [게임 개선] 내용')).toBeUndefined()
})
