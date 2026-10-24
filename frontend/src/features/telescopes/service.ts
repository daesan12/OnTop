import type { TelescopeService } from './contracts'
import { MockTelescopeService } from './mock/MockTelescopeService'

const unavailable = async (): Promise<never> => { throw new Error('망원경 서버 연결이 아직 준비되지 않았습니다.') }
export const telescopeService: TelescopeService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? new MockTelescopeService() : { mode: 'unavailable', enter: unavailable, aim: unavailable, leave: unavailable }
