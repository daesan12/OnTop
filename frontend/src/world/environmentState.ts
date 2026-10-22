import {
  ENVIRONMENT,
  EnvironmentClock,
  sampleDay,
  type WorldEnvironmentConfig,
} from '../config'

export const environmentClock = new EnvironmentClock()
export const environmentConfig: WorldEnvironmentConfig = { ...ENVIRONMENT }
// Visual-only local timeline until the team supplies a world-clock contract.
const visualStart = performance.now()
// Mutable rendering state is sampled once each frame, never stored in React state.
export const environmentFrame = {
  ...sampleDay(ENVIRONMENT.epochMs + ENVIRONMENT.dayDurationMs * 0.6),
  serverTime: ENVIRONMENT.epochMs,
  seconds: 0,
}
export function updateEnvironmentFrame(now: number) {
  const serverTime = environmentClock.ready
    ? environmentClock.now(now)
    : ENVIRONMENT.epochMs + ENVIRONMENT.dayDurationMs * 0.6 + now - visualStart
  Object.assign(environmentFrame, sampleDay(serverTime, environmentConfig), {
    serverTime,
    seconds: (serverTime - ENVIRONMENT.epochMs) / 1000,
  })
}
