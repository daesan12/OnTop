/** Observe raw recovery before held seat/game messages are applied after channel entry. */
export class RecoveryAdmission {
  private status = 'UNKNOWN'
  private listeners = new Set<() => void>()

  accept(status: unknown) {
    if (typeof status !== 'string') return
    this.status = status
    for (const listener of this.listeners) listener()
  }

  reset() {
    this.status = 'UNKNOWN'
    for (const listener of this.listeners) listener()
    this.listeners.clear()
  }

  wait(timeout = 8000) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        this.listeners.delete(check)
        if (error) reject(error)
        else resolve()
      }
      const check = () => {
        if (['LOBBY', 'RESTORED', 'FINISHED', 'ELIMINATED'].includes(this.status)) finish()
        else if (['UNAVAILABLE', 'UNKNOWN'].includes(this.status))
          finish(new Error('경기 복구 상태를 확인한 뒤 다시 입장해주세요.'))
      }
      const timer = setTimeout(() => finish(new Error('경기 복구 확인이 지연되고 있어요. 다시 입장해주세요.')), timeout)
      this.listeners.add(check)
      if (this.status !== 'UNKNOWN') check()
    })
  }
}
