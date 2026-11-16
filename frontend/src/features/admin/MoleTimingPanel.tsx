import { useEffect, useState } from 'react'
import { AdminAccessError } from './adminAccess'
import {
  moleTimingCriteria, readMoleTimingDetections, type MoleGame, type MoleTimingDetections, type MoleTimingMember,
} from './adminMoleAudit'

const detectedTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
})

export function MoleTimingPanel({ game, onAuthEnded, onOpen }: {
  game: MoleGame
  onAuthEnded: () => void
  onOpen: (item: MoleTimingMember) => void
}) {
  const [list, setList] = useState<MoleTimingDetections | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const criteria = moleTimingCriteria[game]
  const pace = moleTimingCriteria.sustainedPace
  const isSpeedMole = game === 'speed-mole'

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const load = async () => {
      if (signal.aborted) return
      try {
        const result = await readMoleTimingDetections(game, signal)
        if (!signal.aborted) setList(result)
      } catch (cause) {
        if (signal.aborted) return
        if (cause instanceof AdminAccessError && cause.kind === 'unauthenticated') onAuthEnded()
        else setError(cause instanceof Error ? cause.message : '타이밍 적발 회원을 조회하지 못했습니다.')
      } finally { if (!signal.aborted) setLoading(false) }
    }
    // 개발 모드 StrictMode가 첫 effect를 정리하면 네트워크 요청을 보내지 않는다.
    queueMicrotask(() => { void load() })
    return () => controller.abort()
  }, [game, onAuthEnded, refresh])

  return <section className="admin-macro-card" aria-labelledby="mole-timing-title">
    <div className="admin-mole-detections-head">
      <h3 id="mole-timing-title">타이밍 적발 회원</h3>
      <button type="button" disabled={loading} onClick={() => {
        setLoading(true)
        setError('')
        setRefresh(value => value + 1)
      }}>새로고침</button>
    </div>
    <p>최근 30일 동안 판을 끝낼 때 아래 타이밍 신호가 기록된 회원입니다. 두더지가 나온 시각은 서버가 다시 계산한 값입니다. 운영 검토용 신호이며 자동 제재는 적용되지 않습니다.</p>
    <ul className="admin-mole-timing-criteria">
      <li><strong>초고속 반응</strong> 두더지가 나온 뒤 처음 친 반응 시간의 판 전체 중앙값이 {moleTimingCriteria.fastMedianMs}ms 미만 ({moleTimingCriteria.fastMinReactions}건 이상{game === 'speed-mole' ? ', 처음 4마리 제외' : ''})</li>
      <li><strong>{criteria.steadyLabel}</strong> {criteria.segmentSeconds}초 구간 중 {criteria.sample} 표본이 {criteria.minSamples}건 이상이고 흔들림이 {criteria.steadyMs}ms 미만인 구간이 2개 이상</li>
      {isSpeedMole && <li><strong>{pace.label}</strong> 20초 구간 3개 모두 적중 {pace.hits}건 이상, 적중률 {pace.accuracyPercent}% 이상, 입력 간격 90백분위 {pace.p90Ms}ms 이하</li>}
    </ul>
    <p>최근 조회 결과는 새로고침해도 최대 30초 동안 표시될 수 있습니다.</p>
    {loading && <p role="status">타이밍 기록을 확인하고 있어요…</p>}
    {error && <p role="alert">{error}</p>}
    {list && <>
      <p>{list.items.length >= list.limit ? `상위 ${list.limit}명` : `${list.items.length}명`} · 적발 판이 많은 순 · {detectedTime.format(new Date(list.until))} 기준 (한국 시간)</p>
      {list.items.length === 0 ? <p>최근 30일 동안 타이밍 적발 기록이 없습니다.</p> :
        <div className="admin-macro-scroll admin-mole-detections-table" tabIndex={0} aria-label="두더지 타이밍 적발 회원 표">
          <table>
            <thead><tr>
              <th scope="col">회원</th><th scope="col">적발 판 / 기록 판</th><th scope="col">최근 판</th>
              <th scope="col">초고속 반응</th><th scope="col">{criteria.steadyLabel}</th>
              {isSpeedMole && <th scope="col">{pace.label}</th>}
              <th scope="col">최저 반응 중앙값</th><th scope="col">최근 적발 (한국 시간)</th>
            </tr></thead>
            <tbody>{list.items.map(item => <tr key={item.userId}>
              <th scope="row">{item.nickname || '이름 없음'}<small>회원 #{item.userId}{item.withdrawn ? ' · 탈퇴' : ''}</small></th>
              <td data-signal><strong>{item.flaggedRounds}</strong> / {item.auditedRounds}판</td>
              <td><button type="button" onClick={() => onOpen(item)}>{item.latestRoundId}번 판 보기</button></td>
              <td>{item.fastRounds}판</td><td>{item.steadyRounds}판</td>
              {isSpeedMole && <td>{item.sustainedPaceRounds === undefined ? '—' : `${item.sustainedPaceRounds}판`}</td>}
              <td>{item.lowestMedianReactionMs === null ? '—' : `${item.lowestMedianReactionMs}ms`}</td>
              <td><time dateTime={item.lastDetectedAt}>{detectedTime.format(new Date(item.lastDetectedAt))}</time></td>
            </tr>)}</tbody>
          </table>
        </div>}
      {list.items.length > 0 && <p>같은 판에서 신호가 여러 개 나오면 각 항목에 표시하고 전체 적발 판은 한 번만 셉니다.</p>}
    </>}
  </section>
}
