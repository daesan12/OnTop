// 온보딩을 마친 탭에서만 세운다. 저장하지 않으므로 새로고침·이탈은 건너뛴 것으로 본다.
// 온보딩 화면이 공원 모듈을 끌어오지 않도록 의존성 없이 둔다.
let welcomePending = false
export function hasPendingWelcomeTour() { return welcomePending }
export function requestWelcomeTour() { welcomePending = true }
/** 첫 입장 연출은 계정당 한 번이다. 꺼내면 비운다. */
export function takeWelcomeTour() {
  const pending = welcomePending
  welcomePending = false
  return pending
}
