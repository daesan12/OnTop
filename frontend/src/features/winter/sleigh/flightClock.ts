/** Anchor once to server time, then advance at render cadence without packet-clock corrections. */
export function createSleighClock() {
  let key = '', start = 0, at = 0
  return (leaseId: string, startedAt: string, serverNow: number, monotonicNow: number) => {
    const next = leaseId + ':' + startedAt
    if (key !== next) {
      key = next; start = Math.max(0, serverNow - Date.parse(startedAt)); at = monotonicNow
    }
    return start + Math.max(0, monotonicNow - at)
  }
}
