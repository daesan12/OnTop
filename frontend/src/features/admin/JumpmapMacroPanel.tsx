import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminJumpmapMacroError, finishSeconds, flaggedShare, loadMacroSuspects, type MacroSuspectList } from './adminJumpmapMacro'
import './adminJumpmapMacro.css'

const when = (value: string) => new Date(value).toLocaleString('ko-KR')

/** 게임 매크로 분석의 점프맵 화면. 서버가 반복 패턴으로 기록한 회원과 적발 판 수를 보여준다. */
export function JumpmapMacroPanel({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [list, setList] = useState<MacroSuspectList | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setLoading(true); setError('')
    try {
      const value = await loadMacroSuspects(abort.signal)
      if (!abort.signal.aborted) setList(value)
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminJumpmapMacroError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setError(cause instanceof AdminJumpmapMacroError ? cause.message : '연결 상태를 확인한 뒤 다시 조회해주세요.')
    } finally { if (!abort.signal.aborted) setLoading(false) }
  }, [onAuthEnded])
  useEffect(() => {
    let active = true
    // StrictMode's discarded mount must not issue an extra private read.
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false; request.current?.abort() }
  }, [load])

  return <>
    <div className="admin-jumpmacro-head"><h2>점프맵 반복 패턴</h2>
      <button type="button" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <ul className="admin-jumpmacro-notes">
      <li>서버가 본 이동 기록만으로 만든 목록입니다. 해당 회원에게는 어떤 안내도 가지 않으며 보상·랭킹도 그대로입니다.</li>
      <li><b>박자 일치</b>: 초반 착지 20개의 발판 순서와 시각이 같은 회원의 이전 판 3개 이상과 같습니다.</li>
      <li><b>고정 출발</b>: 같은 자리에 멈췄다가 같은 시간 뒤에 판을 시작한 것이 이전 판 3개 이상과 같습니다.</li>
      <li>기준은 추정치라 오탐이 있을 수 있습니다. 적발 판 수와 비율을 함께 보고 판단해주세요. 서버를 재시작하면 그 전 판과는 비교하지 않습니다.</li>
    </ul>
    {loading && <p role="status">적발 기록을 확인하고 있어요…</p>}
    {error && <p role="alert">{error}</p>}
    {list && <div className="admin-macro-card">
      <h3>적발 회원</h3>
      {!list.enabled && <p role="status">이 서버는 점프맵이 꺼져 있어 새 기록이 쌓이지 않습니다.</p>}
      <p role="status">{list.items.length}명 · 적발 판이 많은 순 · {when(list.generatedAt)} 기준
        {list.items.length >= list.limit ? ` · 상위 ${list.limit}명만 표시` : ''}</p>
      {list.items.length === 0 ? <p>적발된 회원이 없습니다.</p>
        : <div className="admin-macro-table admin-jumpmacro-table"><table>
          <thead><tr>
            <th scope="col">회원</th><th scope="col">적발 판</th><th scope="col">전체 판 대비</th>
            <th scope="col">박자 일치</th><th scope="col">고정 출발</th><th scope="col">최고 기록</th>
            <th scope="col">첫 적발</th><th scope="col">최근 적발</th>
          </tr></thead>
          <tbody>{list.items.map(item => <tr key={item.userId}>
            <th scope="row">{item.nickname || '이름 없음'}<small>회원 #{item.userId}{item.withdrawn ? ' · 탈퇴' : ''}</small></th>
            <td><strong>{item.flaggedRuns}</strong>판</td>
            <td>{flaggedShare(item)}<small>전체 {item.totalRuns}판</small></td>
            <td>{item.replayRuns}판</td>
            <td>{item.fixedStartRuns}판</td>
            <td>{finishSeconds(item.bestFinishMs)}</td>
            <td><time dateTime={item.firstDetectedAt}>{when(item.firstDetectedAt)}</time></td>
            <td><time dateTime={item.lastDetectedAt}>{when(item.lastDetectedAt)}</time></td>
          </tr>)}</tbody>
        </table></div>}
    </div>}
  </>
}
