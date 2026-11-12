import { EnvironmentClock } from '../config/environment'

export const serverEventClock = new EnvironmentClock()
export const estimatedServerTime = () => serverEventClock.ready ? serverEventClock.now(performance.now()) : Date.now()
