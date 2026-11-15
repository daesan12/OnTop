const key = 'ontop:park-welcome-pending'
const waitMs = 90_000

export function readWelcomeStoryRequest(): number | null {
  try {
    const deadline = Number(sessionStorage.getItem(key))
    if (deadline > Date.now() && deadline <= Date.now() + waitMs) return deadline
  } catch { /* 앱에 저장된 대화 상태는 계속 사용할 수 있다. */ }
  return null
}

export function requestWelcomeStory(): number {
  const deadline = Date.now() + waitMs
  try { sessionStorage.setItem(key, String(deadline)) } catch { /* 이번 입장에서는 메모리에서 대화를 예약한다. */ }
  return deadline
}

export function clearWelcomeStoryRequest() {
  try { sessionStorage.removeItem(key) } catch { /* 저장소 없이도 대화를 닫을 수 있다. */ }
}
