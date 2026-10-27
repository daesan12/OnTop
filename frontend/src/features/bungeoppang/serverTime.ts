/** A fresh GET observation anchored to the monotonic browser clock, never Date.now(). */
export interface ServerTimeSample {
  serverNowMs: number;
  receivedAt: number;
  rttMs: number;
}
export interface RoundTiming {
  countdownStartsAt: string;
  playStartsAt: string;
  playEndsAt: string;
  submitDeadline: string;
  expiresAt: string;
}
export function roundClockAnchor(timing: RoundTiming, sample: ServerTimeSample) {
  const serverAtReceipt = sample.serverNowMs + sample.rttMs / 2;
  const toMonotonic = (iso: string) => sample.receivedAt + Date.parse(iso) - serverAtReceipt;
  return { playAt: toMonotonic(timing.playStartsAt), countdownAt: toMonotonic(timing.countdownStartsAt) };
}
