import {afterEach,expect,it,vi} from 'vitest'
import {RecoveryAdmission} from '../../src/park/runtime/RecoveryAdmission'
afterEach(()=>vi.useRealTimers())
it('DB 복구 완료까지 기다리고 기존에 받은 완료 응답도 사용한다',async()=>{const g=new RecoveryAdmission();g.accept('PENDING');let ready=false;const waiting=g.wait().then(()=>ready=true);await Promise.resolve();expect(ready).toBe(false);g.accept('LOBBY');await waiting;expect(ready).toBe(true);await expect(g.wait()).resolves.toBeUndefined()})
it('재접속한 진행 경기와 종료 경기도 복구 완료 응답을 존중한다',async()=>{for(const status of['RESTORED','FINISHED','ELIMINATED']){const g=new RecoveryAdmission();const p=g.wait();g.accept(status);await expect(p).resolves.toBeUndefined()}})
it('연결 변경은 이전 대기를 취소하고 새 연결의 완료 상태를 빌리지 않는다',async()=>{const g=new RecoveryAdmission();const result=expect(g.wait()).rejects.toThrow('복구 상태');g.reset();await result;g.accept('LOBBY');await expect(g.wait()).resolves.toBeUndefined()})
it('복구 불가 및 응답 지연 시 재입장을 반복하지 않는다',async()=>{vi.useFakeTimers();const g=new RecoveryAdmission();g.accept('UNAVAILABLE');await expect(g.wait()).rejects.toThrow('복구 상태');g.reset();const result=expect(g.wait(100)).rejects.toThrow('지연');await vi.advanceTimersByTimeAsync(100);await result})
