import { useCallback, useEffect, useRef, useState } from 'react'
import { loadServiceOperation, type ServiceOperationMode, type ServiceOperationStatus } from '../operation/serviceOperation'
import {
  AdminServiceOperationError,
  loadAdminServiceOperation,
  updateAdminServiceOperation,
  type AdminServiceOperationCommand,
} from './adminServiceOperation'
import './adminServiceOperation.css'

const labels: Record<ServiceOperationMode, { title: string; summary: string; action: string }> = {
  NORMAL: {
    title: '정상 운영',
    summary: '공원 입장과 새 게임 시작을 모두 허용합니다.',
    action: '정상 운영으로 변경',
  },
  DRAINING: {
    title: '신규 활동 차단',
    summary: '새 입장과 게임 시작을 막고 진행 중인 게임은 마무리합니다.',
    action: '신규 활동 차단으로 변경',
  },
  MAINTENANCE: {
    title: '점검 중',
    summary: '이용자에게 점검 화면을 표시하고 신규 이용을 차단합니다.',
    action: '점검 중으로 변경',
  },
}

const local = (value: string | null) => value
  ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const instant = (value: string) => value ? new Date(value).toISOString() : null

function futureDefault(serverTime: string) {
  return local(new Date(Math.max(Date.now(), Date.parse(serverTime)) + 30 * 60_000).toISOString())
}

function command(status: ServiceOperationStatus, mode: ServiceOperationMode, notice: string, expectedOpenAt: string) {
  if (mode === 'NORMAL') return { mode, notice: '', expectedOpenAt: null, expectedVersion: status.version }
  const normalized = notice.trim()
  const opening = instant(expectedOpenAt)
  if (!normalized || normalized.length > 200) throw new Error('점검 안내를 공백 제외 1자 이상 200자 이하로 입력해주세요.')
  if (!opening || Date.parse(opening) <= Math.max(Date.now(), Date.parse(status.serverTime))) {
    throw new Error('예상 재개 시각을 현재 시각보다 뒤로 정해주세요.')
  }
  return { mode, notice: normalized, expectedOpenAt: opening, expectedVersion: status.version }
}

export function AdminServiceOperationPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [status, setStatus] = useState<ServiceOperationStatus | null>(null)
  const [mode, setMode] = useState<ServiceOperationMode>('NORMAL')
  const [notice, setNotice] = useState('진행 중인 게임 종료 후 서버 점검을 시작합니다.')
  const [expectedOpenAt, setExpectedOpenAt] = useState('')
  const [confirmation, setConfirmation] = useState<AdminServiceOperationCommand | null>(null)
  const [pending, setPending] = useState<'load' | 'update' | null>('load')
  const [error, setError] = useState(''), [success, setSuccess] = useState('')
  const request = useRef<AbortController | null>(null), inFlight = useRef(false)

  const applyStatus = useCallback((value: ServiceOperationStatus) => {
    setStatus(value); setMode(value.mode)
    setNotice(value.notice || '진행 중인 게임 종료 후 서버 점검을 시작합니다.')
    setExpectedOpenAt(local(value.expectedOpenAt) || futureDefault(value.serverTime))
    setConfirmation(null)
  }, [])

  const showError = useCallback((cause: unknown) => {
    if (cause instanceof AdminServiceOperationError && cause.authEnded) { onAuthEnded(); return }
    setError(cause instanceof Error ? cause.message : '운영 상태를 처리하지 못했습니다. 다시 시도해주세요.')
  }, [onAuthEnded])

  const refresh = useCallback(async () => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    inFlight.current = true; setPending('load'); setError(''); setSuccess('')
    try { const value = await loadAdminServiceOperation(abort.signal); if (!abort.signal.aborted) applyStatus(value) }
    catch (cause) { if (!abort.signal.aborted) showError(cause) }
    finally {
      if (request.current === abort) {
        inFlight.current = false
        if (!abort.signal.aborted) setPending(null)
      }
    }
  }, [applyStatus, showError])

  useEffect(() => { void refresh(); return () => request.current?.abort() }, [refresh])

  function prepare() {
    if (!status || inFlight.current) return
    setError(''); setSuccess('')
    try { setConfirmation(command(status, mode, notice, expectedOpenAt)) }
    catch (cause) { showError(cause) }
  }

  async function update() {
    if (!confirmation || inFlight.current) return
    request.current?.abort()
    const abort = request.current = new AbortController()
    inFlight.current = true; setPending('update'); setError(''); setSuccess('')
    let committed: ServiceOperationStatus | null = null
    try {
      committed = await updateAdminServiceOperation(confirmation, abort.signal)
      if (abort.signal.aborted) return
      applyStatus(committed)
      setSuccess(`${labels[committed.mode].title} 상태로 변경했습니다.`)
      try {
        const published = await loadServiceOperation(abort.signal)
        if (published.version !== committed.version || published.mode !== committed.mode) {
          setError('변경은 완료됐지만 공개 운영 상태가 아직 일치하지 않습니다. 잠시 후 새로고침해주세요.')
        } else applyStatus(published)
      } catch {
        if (!abort.signal.aborted) setError('변경은 완료됐지만 공개 운영 상태를 재확인하지 못했습니다. 새로고침해주세요.')
      }
    } catch (cause) {
      if (abort.signal.aborted) return
      showError(cause)
      if (cause instanceof AdminServiceOperationError && cause.requiresRefresh) {
        try { applyStatus(await loadAdminServiceOperation(abort.signal)) } catch (refreshCause) { showError(refreshCause) }
      }
    } finally { inFlight.current = false; if (!abort.signal.aborted) setPending(null) }
  }

  const busy = pending !== null
  return <section className="admin-feedback-content admin-operation" aria-label="서비스 운영 제어" aria-busy={busy}>
    <header className="admin-operation-heading">
      <div><h2>서비스 운영 제어</h2><p>신규 활동을 순서대로 차단하고 점검 화면을 전환합니다.</p></div>
      {status && <span className="admin-operation-badge" data-mode={status.mode}>{labels[status.mode].title}</span>}
    </header>
    {error && <div className="admin-feedback-error" role="alert"><p>{error}</p></div>}
    {success && <p className="admin-operation-success" role="status">{success}</p>}
    {!status ? <div className="admin-operation-loading" role="status">
      <p>{pending === 'load' ? '현재 운영 상태를 확인하고 있어요…' : '운영 상태를 불러오지 못했습니다.'}</p>
      {!busy && <button type="button" onClick={() => void refresh()}>다시 조회</button>}
    </div> : <>
      <section className="admin-operation-current" aria-label="현재 운영 상태">
        <div><span>현재 상태</span><strong>{labels[status.mode].title}</strong><p>{labels[status.mode].summary}</p></div>
        <dl><div><dt>상태 버전</dt><dd>{status.version}</dd></div>
          <div><dt>마지막 변경</dt><dd>{new Date(status.updatedAt).toLocaleString('ko-KR')}</dd></div>
          <div><dt>예상 재개</dt><dd>{status.expectedOpenAt ? new Date(status.expectedOpenAt).toLocaleString('ko-KR') : '설정 없음'}</dd></div></dl>
        {status.notice && <p className="admin-operation-current-notice"><strong>현재 안내</strong>{status.notice}</p>}
      </section>
      <form onSubmit={event => { event.preventDefault(); prepare() }}>
        <fieldset disabled={busy}><legend>변경할 운영 상태</legend>
          <div className="admin-operation-modes">
            {(Object.keys(labels) as ServiceOperationMode[]).map(value => <label key={value} data-selected={mode === value}>
              <input type="radio" name="operation-mode" value={value} checked={mode === value}
                onChange={() => { setMode(value); setConfirmation(null); setError(''); setSuccess('') }} />
              <span><strong>{labels[value].title}</strong><small>{labels[value].summary}</small></span>
            </label>)}
          </div>
          {mode !== 'NORMAL' && <div className="admin-operation-fields">
            <label>이용자 안내<textarea rows={3} maxLength={200} value={notice}
              onChange={event => { setNotice(event.target.value); setConfirmation(null) }} />
              <small>{notice.length}/200자 · 점검 화면에 표시됩니다.</small></label>
            <label>예상 재개 시각<input type="datetime-local" value={expectedOpenAt}
              min={futureDefault(status.serverTime).slice(0, 16)}
              onChange={event => { setExpectedOpenAt(event.target.value); setConfirmation(null) }} />
              <small>현재 기기의 시간대를 기준으로 입력합니다.</small></label>
          </div>}
          <button type="submit">변경 내용 확인</button>
        </fieldset>
      </form>
      {confirmation && <section className="admin-operation-confirm" aria-label="운영 상태 변경 확인">
        <h3>{labels[confirmation.mode].title} 상태로 변경할까요?</h3>
        <p>{labels[confirmation.mode].summary}</p>
        {confirmation.mode !== 'NORMAL' && <dl><div><dt>이용자 안내</dt><dd>{confirmation.notice}</dd></div>
          <div><dt>예상 재개</dt><dd>{new Date(confirmation.expectedOpenAt!).toLocaleString('ko-KR')}</dd></div></dl>}
        <p className="admin-operation-warning">현재 상태 버전 {confirmation.expectedVersion}을 기준으로 변경합니다. 다른 관리자가 먼저 변경하면 다시 확인해야 합니다.</p>
        <div><button className="admin-operation-execute" type="button" disabled={busy} onClick={() => void update()}>
          {pending === 'update' ? '변경하고 있어요…' : labels[confirmation.mode].action}</button>
          <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>취소</button></div>
      </section>}
      <aside className="admin-operation-guide"><h3>권장 점검 순서</h3>
        <ol><li><strong>신규 활동 차단</strong>으로 전환합니다.</li><li>진행 중인 게임이 끝날 때까지 기다립니다.</li>
          <li><strong>점검 중</strong>으로 전환하고 배포합니다.</li><li>검증이 끝나면 <strong>정상 운영</strong>으로 되돌립니다.</li></ol></aside>
    </>}
  </section>
}
