import {EnvironmentClock} from '../config/environment'

/** Shared UTC phase for server-authoritative animations, without importing the network client. */
export const serverEventClock = new EnvironmentClock()
export const estimatedServerTime = () => serverEventClock.ready ? serverEventClock.now(performance.now()) : Date.now()
