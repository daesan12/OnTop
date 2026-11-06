export const CARRY_ESCAPE_PRESSES = 6

// 자동 반복은 입력 경계에서 제외한다. 같은 키나 1초 이상 쉰 입력은 새 시도로 시작한다.
export function createCarryEscape() {
  let carryId = '', lastKey = '', lastAt = 0, presses = 0, completed = false
  const reset = () => { carryId = lastKey = ''; lastAt = presses = 0; completed = false }
  return {
    reset,
    press(id: string, key: 'KeyA' | 'KeyD', now: number) {
      if (carryId !== id) { reset(); carryId = id }
      if (completed) return false
      presses = key === lastKey || now - lastAt >= 1000 ? 1 : presses + 1
      lastKey = key; lastAt = now
      completed = presses >= CARRY_ESCAPE_PRESSES
      return completed
    },
  }
}
