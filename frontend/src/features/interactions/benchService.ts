import type { BenchService } from './benchContracts'
import { MockBenchService } from './mock/MockBenchService'

const unavailable = async (): Promise<never> => { throw new Error('벤치 서버 연결이 아직 준비되지 않았습니다.') }
// Only missing facility behavior is mocked. Authentication/world remain the real Spring runtime.
export const benchService: BenchService = import.meta.env.DEV
  ? new MockBenchService()
  : { mode: 'unavailable', sit: unavailable, stand: unavailable }
