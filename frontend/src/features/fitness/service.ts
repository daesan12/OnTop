import type { FitnessService } from './contracts'
import { MockFitnessService } from './mock/MockFitnessService'

const unavailable = async (): Promise<never> => { throw new Error('운동기구 서버 연결이 아직 준비되지 않았습니다.') }
export const fitnessService: FitnessService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? new MockFitnessService() : { mode: 'unavailable', enter: unavailable, leave: unavailable }
