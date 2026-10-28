export const FEEDBACK_TOPICS = [
  { id: 'game', label: '게임 개선', detail: '콘텐츠 · 편의성' },
  { id: 'bug', label: '오류/버그', detail: '불편한 점을 알려주세요' },
  { id: 'map', label: '맵 및 시설', detail: '더 좋은 공원으로' },
  { id: 'other', label: '기타 의견', detail: '어떤 이야기든 좋아요' },
] as const
export type FeedbackTopic = typeof FEEDBACK_TOPICS[number]['id']
const prefix = /^\[(게임 개선|오류\/버그|맵 및 시설|기타 의견)\] ?/
export function selectedFeedbackTopic(draft: string): FeedbackTopic | undefined {
  return FEEDBACK_TOPICS.find(topic => draft.startsWith(`[${topic.label}]`))?.id
}
/** Topics use the existing private text contract and count toward 600. */
export function withFeedbackTopic(draft: string, topic: FeedbackTopic): string | null {
  const content = draft.replace(prefix, '')
  const next = selectedFeedbackTopic(draft) === topic ? content : `[${FEEDBACK_TOPICS.find(item => item.id === topic)!.label}] ${content}`
  return next.length <= 600 ? next : null
}
