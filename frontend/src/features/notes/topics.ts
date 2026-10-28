export const NOTE_TOPICS = [
  { id: 'daily', label: '일상', icon: '❀', color: '#f9d4cb' },
  { id: 'cheer', label: '응원', icon: '♧', color: '#dfebba' },
  { id: 'worry', label: '고민', icon: '♡', color: '#d9e8ed' },
  { id: 'recommend', label: '추천', icon: '✧', color: '#ffecaf' },
  { id: 'free', label: '자유', icon: '❁', color: '#e6dced' },
] as const
export type NoteTopic = typeof NOTE_TOPICS[number]['id']
export const isNoteTopic = (value: unknown): value is NoteTopic => NOTE_TOPICS.some(topic => topic.id === value)
export const noteTopic = (value: unknown) => NOTE_TOPICS.find(topic => topic.id === value) ?? NOTE_TOPICS[4]
