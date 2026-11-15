import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminJumpRopeMacroError, jitterMs, loadJumpRopeMacroReport, type JumpRopeMacroReport } from './adminJumpRopeMacro'
import './adminJumpmapMacro.css'

const when = (value: string) => new Date(value).toLocaleString('ko-KR')
const number = new Intl.NumberFormat('ko-KR')

/** 게임 매크로 분석의 줄넘기 화면. 판 확정 때 남긴 신호와 같은 점프 기록의 재제출을 보여준다. */
export function JumpRopeMacroPanel({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [report, setReport] = useState<JumpRopeMacroReport | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setLoading(true); setError('')
    try {
      const value = await loadJumpRopeMacroReport(abort.signal)
      if (!abort.signal.aborted) setReport(value)
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminJumpRopeMacroError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setError(cause instanceof AdminJumpRopeMacroError ? cause.message : '연결 상태를 확인한 뒤 다시 조회해주세요.')
    } finally { if (!abort.signal.aborted) setLoading(false) }
  }, [onAuthEnded])
  useEffect(() => {
    let active = true
    // StrictMode's discarded mount must not issue an extra private read.
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false; request.current?.abort() }
  }, [load])

  return <>
    <div className="admin-jumpmacro-head"><h2>구구구 줄넘기 기록</h2>
      <button type="button" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <ul className="admin-jumpmacro-notes">
      <li>서버에 제출된 점프 시각만으로 만든 목록입니다. 해당 회원에게는 어떤 안내도 가지 않으며 점수·보상·랭킹도 그대로입니다.</li>
      <li><b>같은 기록</b>: 점프 20개 이상인 기록이 다른 판과 한 치도 다르지 않게 같습니다. 사람에게서는 나올 수 없습니다.</li>
      <li><b>흔들림 없음</b>: 점프 30개 이상에서 박자 흔들림이 4ms 미만입니다. 사람은 숙련자도 십수 ms는 흔들립니다. 기준은 추정치입니다.</li>
      <li><b>공원 밖</b>: 판을 확정할 때 공원에 접속해 있지 않았습니다. 연결이 잠깐 끊겨도 생길 수 있어 참고용입니다.</li>
    </ul>
    {loading && <p role="status">줄넘기 기록을 확인하고 있어요…</p>}
    {error && <p role="alert">{error}</p>}
    {report && <>
      <div className="admin-macro-card">
        <h3>의심 회원</h3>
        {!report.enabled && <p role="status">이 서버는 줄넘기 기록 저장이 꺼져 있어 새 기록이 쌓이지 않습니다.</p>}
        <p role="status">{report.suspects.length}명 · 의심 판이 많은 순 · {when(report.generatedAt)} 기준
          {report.suspects.length >= report.limit ? ` · 상위 ${report.limit}명만 표시` : ''}</p>
        {report.suspects.length === 0 ? <p>의심 기록이 남은 회원이 없습니다.</p>
          : <div className="admin-macro-table admin-jumpmacro-table"><table>
            <thead><tr>
              <th scope="col">회원</th><th scope="col">의심 판</th><th scope="col">같은 기록</th>
              <th scope="col">흔들림 없음</th><th scope="col">가장 작은 흔들림</th><th scope="col">공원 밖</th>
              <th scope="col">최고 점수</th><th scope="col">최근 기록</th>
            </tr></thead>
            <tbody>{report.suspects.map(item => <tr key={item.userId}>
              <th scope="row">{item.nickname || '이름 없음'}<small>회원 #{item.userId}{item.withdrawn ? ' · 탈퇴' : ''}</small></th>
              <td><strong>{item.flaggedRounds}</strong>판<small>기록된 {item.auditedRounds}판 중</small></td>
              <td>{item.duplicateRounds}판</td>
              <td>{item.steadyRounds}판</td>
              <td>{jitterMs(item.lowestJitterUs)}</td>
              <td>{item.outsideParkRounds}판</td>
              <td>{item.bestScore === null ? '-' : `${number.format(item.bestScore)}점`}</td>
              <td><time dateTime={item.lastFlaggedAt}>{when(item.lastFlaggedAt)}</time>
                <small>첫 기록 {when(item.firstFlaggedAt)}</small></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
      <div className="admin-macro-card">
        <h3>같은 점프 기록의 재제출</h3>
        <p>기록 저장을 시작하기 전의 판까지 포함합니다. 여러 회원이 같은 기록을 냈다면 같은 스크립트를 쓴 것입니다.</p>
        {report.duplicateLogs.length === 0 ? <p>두 번 이상 제출된 기록이 없습니다.</p>
          : <div className="admin-macro-table admin-jumpmacro-table"><table>
            <thead><tr>
              <th scope="col">기록</th><th scope="col">제출</th><th scope="col">회원</th>
              <th scope="col">점수</th><th scope="col">첫 제출</th><th scope="col">최근 제출</th>
            </tr></thead>
            <tbody>{report.duplicateLogs.map(item => <tr key={item.inputHash}>
              <th scope="row"><code>{item.inputHash.slice(0, 10)}</code></th>
              <td><strong>{item.rounds}</strong>판</td>
              <td>{item.members}명<small>{item.userIds.map(id => `#${id}`).join(', ')}{item.members > item.userIds.length ? ' 외' : ''}</small></td>
              <td>{number.format(item.score)}점</td>
              <td><time dateTime={item.firstCompletedAt}>{when(item.firstCompletedAt)}</time></td>
              <td><time dateTime={item.lastCompletedAt}>{when(item.lastCompletedAt)}</time></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}
  </>
}
