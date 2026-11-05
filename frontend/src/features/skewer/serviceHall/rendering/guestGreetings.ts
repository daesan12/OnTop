export type GuestGreeting = 'arrival' | 'departure'
// Same order as the six shared bungeoppang appearances: boy, student, worker, older man, girl, woman.
export const GUEST_GREETING_PROFILES = [
  { arrival: ['안녕하세요!', '배고파요!', '꼬치 주세요!'], departure: ['잘 먹었어요!', '또 올게요!', '진짜 맛있어요!'] },
  { arrival: ['수업 끝났어요!', '오늘도 왔어요!', '냄새 좋네요!'], departure: ['잘 먹었습니다!', '든든하네요!', '또 들를게요!'] },
  { arrival: ['퇴근했어요!', '반갑습니다!', '꼬치 생각나요!'], departure: ['기운이 나네요!', '피로가 풀려요!', '내일 또 올게요!'] },
  { arrival: ['반갑구먼!', '오늘도 왔소!', '꼬치가 좋지!'], departure: ['참 잘 먹었소!', '솜씨 좋구먼!', '다음에 또 봐요!'] },
  { arrival: ['안녕!', '맛있겠다!', '꼬치 먹을래요!'], departure: ['정말 맛있어!', '배불러요!', '다음에 또 와요!'] },
  { arrival: ['안녕하세요.', '향이 좋네요.', '반가워요!'], departure: ['잘 먹었어요.', '참 맛있네요.', '또 들를게요.'] },
] as const

export function pickGuestGreeting(variant: number, kind: GuestGreeting, previous?: string, random = Math.random) {
  const profile = GUEST_GREETING_PROFILES[((variant % GUEST_GREETING_PROFILES.length) + GUEST_GREETING_PROFILES.length) % GUEST_GREETING_PROFILES.length]
  const choices = profile[kind].filter(text => text !== previous)
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]
}
