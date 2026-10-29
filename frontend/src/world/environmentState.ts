import {
  ENVIRONMENT,
  EnvironmentClock,
  sampleDay,
  type WorldEnvironmentConfig,
} from '../config'

export const environmentClock = new EnvironmentClock()
export const environmentConfig: WorldEnvironmentConfig = { ...ENVIRONMENT }
export function resetEnvironmentTime() {
  environmentClock.reset()
  Object.assign(environmentConfig, ENVIRONMENT)
}
// A shared Korean midnight epoch keeps late joins/reloads in the same day phase. Anchor to
// the monotonic clock so changing the device clock during play cannot jump time.
// Device clock skew still needs an authoritative server clock contract.
// Unix milliseconds identify an instant in every time zone; never add 9h here.
const visualStart = performance.now(), visualEpoch = Date.now()
// Mutable rendering state is sampled once each frame, never stored in React state.
export const environmentFrame = {
  ...sampleDay(visualEpoch),
  serverTime: visualEpoch,
  seconds: 0,
}
export function updateEnvironmentFrame(now: number) {
  const serverTime = environmentClock.ready
    ? environmentClock.now(now)
    : visualEpoch + now - visualStart
  Object.assign(environmentFrame, sampleDay(serverTime, environmentConfig), {
    serverTime,
    seconds: (serverTime - environmentConfig.epochMs) / 1000,
  })
}
