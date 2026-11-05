/** 인접한 알림을 모으고, 진행 중 알림은 낡은 응답을 무효화한 뒤 한 번 더 조회한다. */
export function createWalletRefreshQueue(read: (current: () => boolean) => Promise<void>, cancelRead: () => void) {
  let revision = 0, running = false, cancelled = false, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (disposed || running || timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      running = true
      cancelled = false
      const started = revision
      const finished = () => {
        running = false
        if (started !== revision) schedule()
      }
      // read가 오류 상태를 처리한다. 실패하더라도 대기 중인 새 알림을 잃지 않는다.
      void read(() => !disposed && started === revision).then(finished, finished)
    }, 25)
  }
  return {
    request() {
      if (disposed) return
      revision++
      if (running && !cancelled) { cancelled = true; cancelRead() }
      schedule()
    },
    dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer) },
  }
}
