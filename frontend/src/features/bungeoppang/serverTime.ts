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
  paused?: boolean;
  pauseRevision?: number;
}
/** Only a server pause transition may move the otherwise immutable time window. */
export function validTimingUpdate(before:RoundTiming,after:RoundTiming) {
  if(JSON.stringify(before)===JSON.stringify(after))return true;
  if(before.pauseRevision===undefined||after.pauseRevision===undefined||after.pauseRevision<before.pauseRevision)return false;
  if(after.pauseRevision===before.pauseRevision&&(after.paused!==before.paused||!before.paused))return false;
  const fields=['countdownStartsAt','playStartsAt','playEndsAt','submitDeadline','expiresAt'] as const;
  const shift=Date.parse(after.playStartsAt)-Date.parse(before.playStartsAt);
  return shift>=0&&fields.every(field=>Date.parse(after[field])-Date.parse(before[field])===shift);
}
export function roundClockAnchor(timing: RoundTiming, sample: ServerTimeSample) {
  const serverAtReceipt = sample.serverNowMs + sample.rttMs / 2;
  const toMonotonic = (iso: string) => sample.receivedAt + Date.parse(iso) - serverAtReceipt;
  return { playAt: toMonotonic(timing.playStartsAt), countdownAt: toMonotonic(timing.countdownStartsAt) };
}
