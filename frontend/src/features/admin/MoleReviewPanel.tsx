import { useEffect, useState } from 'react'
import { AdminAccessError } from './adminAccess'
import {
  moleTimingCriteria, readMoleDetections, readMoleTimingDetections, type MoleDetectedMember,
  type MoleDetectionLink, type MoleDetections, type MoleGame, type MoleTimingDetections, type MoleTimingMember,
} from './adminMoleAudit'

const detectedTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
})

type ReviewRow = {
  latest: MoleDetectedMember | MoleTimingMember
  trap?: MoleDetectedMember
  timing?: MoleTimingMember
}

function reviewRows(traps: MoleDetections | null, timings: MoleTimingDetections | null) {
  const rows = new Map<string, ReviewRow>()
  for (const trap of traps?.items ?? []) rows.set(trap.userId, { latest: trap, trap })
  for (const timing of timings?.items ?? []) {
    const trap = rows.get(timing.userId)?.trap
    const latest = trap && Date.parse(trap.lastDetectedAt) > Date.parse(timing.lastDetectedAt) ? trap : timing
    rows.set(timing.userId, { latest, trap, timing })
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.latest.lastDetectedAt) - Date.parse(a.latest.lastDetectedAt))
}

export function MoleReviewPanel({ game, onAuthEnded, onOpen }: {
  game: MoleGame
  onAuthEnded: () => void
  onOpen: (item: MoleDetectionLink) => void
}) {
  const [traps, setTraps] = useState<MoleDetections | null>(null)
  const [timings, setTimings] = useState<MoleTimingDetections | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const criteria = moleTimingCriteria[game]
  const pace = moleTimingCriteria.sustainedPace
  const early = moleTimingCriteria.repeatedEarlyReaction
  const isSpeedMole = game === 'speed-mole'

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const load = async () => {
      if (signal.aborted) return
      const [trapResult, timingResult] = await Promise.allSettled([
        readMoleDetections(game, signal), readMoleTimingDetections(game, signal),
      ])
      if (signal.aborted) return
      const sources = []
      let authEnded = false
      if (trapResult.status === 'rejected') {
        sources.push('함정 표적')
        authEnded = trapResult.reason instanceof AdminAccessError && trapResult.reason.kind === 'unauthenticated'
      }
      if (timingResult.status === 'rejected') {
        sources.push('타이밍')
        authEnded ||= timingResult.reason instanceof AdminAccessError && timingResult.reason.kind === 'unauthenticated'
      }
      setTraps(trapResult.status === 'fulfilled' ? trapResult.value : null)
      setTimings(timingResult.status === 'fulfilled' ? timingResult.value : null)
      setError(sources.length ? `${sources.join('·')} 기록을 조회하지 못했습니다.` : '')
      setLoading(false)
      if (authEnded) onAuthEnded()
    }
    queueMicrotask(() => { void load() })
    return () => controller.abort()
  }, [game, onAuthEnded, refresh])

  const rows = reviewRows(traps, timings)
  const capped = (traps !== null && traps.items.length >= traps.limit)
    || (timings !== null && timings.items.length >= timings.limit)

  return <section className="admin-macro-card" aria-labelledby="mole-review-title">
    <div className="admin-mole-detections-head">
      <h3 id="mole-review-title">매크로 의심 회원</h3>
      <button type="button" disabled={loading} onClick={() => {
        setLoading(true)
        setError('')
        setRefresh(value => value + 1)
      }}>새로고침</button>
    </div>
    <p>최근 30일의 함정 표적과 타이밍 신호입니다. 운영 검토용이며 자동 제재에는 쓰지 않습니다.</p>
    {loading && <p role="status">의심 신호를 확인하고 있어요…</p>}
    {error && <p role="alert">{error}</p>}
    {rows.length > 0 ? <>
      <p>{rows.length}명 · 최근 신호 순{capped && ' · 유형별 상위 결과'}</p>
      <div className="admin-macro-scroll admin-mole-detections-table" tabIndex={0} aria-label="두더지 매크로 의심 회원 표">
        <table>
          <thead><tr><th scope="col">회원</th><th scope="col">최근 의심 판</th>
            <th scope="col">함정 표적</th><th scope="col">타이밍 근거</th><th scope="col">최근 신호 (한국 시간)</th>
          </tr></thead>
          <tbody>{rows.map(({ latest, trap, timing }) => <tr key={latest.userId}>
            <th scope="row">{latest.nickname || '이름 없음'}<small>회원 #{latest.userId}{latest.withdrawn ? ' · 탈퇴' : ''}</small></th>
            <td><button type="button" onClick={() => onOpen(latest)}>{latest.latestRoundId}번 판 보기</button></td>
            <td>{trap ? <>
              <strong>{trap.flaggedRounds}판</strong><small>판 중 {trap.liveRounds} · 종료 {trap.completionRounds}</small>
              {trap.latestRoundId !== latest.latestRoundId &&
                <button type="button" onClick={() => onOpen(trap)}>함정 {trap.latestRoundId}번</button>}
            </> : '—'}</td>
            <td>{timing ? <>
              <strong>{timing.flaggedRounds} / {timing.auditedRounds}판</strong>
              {timing.fastRounds > 0 && <small>초고속 반응 {timing.fastRounds}판</small>}
              {timing.steadyRounds > 0 && <small>{criteria.steadyLabel} {timing.steadyRounds}판</small>}
              {!!timing.repeatedEarlyReactionRounds && <small>{early.label} {timing.repeatedEarlyReactionRounds}판</small>}
              {isSpeedMole && !!timing.sustainedPaceRounds && <small>{pace.label} {timing.sustainedPaceRounds}판</small>}
              {timing.lowestMedianReactionMs !== null && <small>최저 판 중앙값 {timing.lowestMedianReactionMs}ms</small>}
              {timing.latestRoundId !== latest.latestRoundId &&
                <button type="button" onClick={() => onOpen(timing)}>타이밍 {timing.latestRoundId}번</button>}
            </> : '—'}</td>
            <td><time dateTime={latest.lastDetectedAt}>{detectedTime.format(new Date(latest.lastDetectedAt))}</time></td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : !loading && traps && timings && <p>최근 30일 동안 검토 신호가 기록된 회원이 없습니다.</p>}
    <details>
      <summary>탐지 기준과 집계 범위</summary>
      <ul className="admin-mole-timing-criteria">
        <li><strong>함정 표적</strong> 숨겨진 표적 ID를 판 중 또는 종료 제출에서 타격한 기록</li>
        <li><strong>초고속 반응</strong> 반응 {moleTimingCriteria.fastMinReactions}건 이상, 판 전체 중앙값 {moleTimingCriteria.fastMedianMs}ms 미만</li>
        <li><strong>{criteria.steadyLabel}</strong> {criteria.minSamples}건 이상이고 흔들림이 {criteria.steadyMs}ms 미만인 구간이 2개 이상</li>
        <li><strong>{early.label}</strong> 반응 {early.minSamples}건 이상과 {criteria.earlyMaxMs}ms 이하 반응 비율 {early.minPercent}% 이상을 모두 충족한 구간이 2개 이상</li>
        {isSpeedMole && <li><strong>{pace.label}</strong> 20초 구간 3개 모두 적중 {pace.hits}건 이상, 정확도 {pace.accuracyPercent}% 이상, 간격 90백분위 {pace.p90Ms}ms 이하</li>}
      </ul>
      <p>함정 표적과 타이밍 판 수는 각 유형에서 계산합니다. 조회 결과는 최대 30초 동안 재사용됩니다.</p>
      {traps && <p>함정 표적 집계 {detectedTime.format(new Date(traps.until))} (한국 시간)</p>}
      {timings && <p>타이밍 집계 {detectedTime.format(new Date(timings.until))} (한국 시간)</p>}
    </details>
  </section>
}
