import { useEffect, useState } from 'react'
import { AdminAccessError } from './adminAccess'
import { readMoleDetections, type MoleDetections, type MoleGame } from './adminMoleAudit'

const detectedTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
})

export function MoleDetectionsPanel({ game, onAuthEnded, onOpen }: {
  game: MoleGame
  onAuthEnded: () => void
  onOpen: (userId: string, roundId: string) => void
}) {
  const [list, setList] = useState<MoleDetections | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    queueMicrotask(async () => {
      if (signal.aborted) return
      try {
        const result = await readMoleDetections(game, signal)
        if (!signal.aborted) setList(result)
      } catch (cause) {
        if (signal.aborted) return
        if (cause instanceof AdminAccessError && cause.kind === 'unauthenticated') onAuthEnded()
        else setError(cause instanceof Error ? cause.message : '적발 회원을 조회하지 못했습니다.')
      } finally { if (!signal.aborted) setLoading(false) }
    })
    return () => controller.abort()
  }, [game, onAuthEnded, refresh])

  return <section className="admin-macro-card" aria-labelledby="mole-detections-title">
    <div className="admin-mole-detections-head">
      <h3 id="mole-detections-title">적발 회원</h3>
      <button type="button" disabled={loading} onClick={() => {
        setLoading(true)
        setError('')
        setRefresh(value => value + 1)
      }}>새로고침</button>
    </div>
    <p>선택한 게임에서 최근 30일 동안 숨겨진 표적 ID의 타격이 기록된 회원입니다. 운영 검토용 신호이며 자동 제재는 적용되지 않습니다.</p>
    {loading && <p role="status">적발 기록을 확인하고 있어요…</p>}
    {error && <p role="alert">{error}</p>}
    {list && <>
      <p>{list.items.length >= list.limit ? `상위 ${list.limit}명` : `${list.items.length}명`} · 적발 판이 많은 순 · {detectedTime.format(new Date(list.until))} 기준 (한국 시간)</p>
      {list.items.length === 0 ? <p>최근 30일 동안 적발 기록이 없습니다.</p> :
        <div className="admin-macro-scroll admin-mole-detections-table" tabIndex={0} aria-label="두더지 적발 회원 표">
          <table>
            <thead><tr>
              <th scope="col">회원</th><th scope="col">적발 판</th><th scope="col">최근 판</th>
              <th scope="col">판 중</th><th scope="col">종료 제출</th><th scope="col">최근 적발 (한국 시간)</th>
            </tr></thead>
            <tbody>{list.items.map(item => <tr key={item.userId}>
              <th scope="row">{item.nickname || '이름 없음'}<small>회원 #{item.userId}{item.withdrawn ? ' · 탈퇴' : ''}</small></th>
              <td data-signal><strong>{item.flaggedRounds}</strong>판</td>
              <td><button type="button" onClick={() => onOpen(item.userId, item.latestRoundId)}>
                {item.latestRoundId}번 판 보기
              </button></td>
              <td>{item.liveRounds}판</td><td>{item.completionRounds}판</td>
              <td><time dateTime={item.lastDetectedAt}>{detectedTime.format(new Date(item.lastDetectedAt))}</time></td>
            </tr>)}</tbody>
          </table>
        </div>}
      {list.items.length > 0 && <p>같은 판에서 두 신호가 확인되면 각 항목에는 표시하되 전체 적발 판은 한 번만 셉니다.</p>}
    </>}
  </section>
}
