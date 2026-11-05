import { useEffect, useRef, useState } from 'react'
import { speedMoleService, type SpeedMoleRankings as Rankings } from './service'

export function SpeedMoleRankings({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Rankings | null>(null)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const load = async (from: number) => {
    const current = ++request.current
    setBusy(true); setError('')
    try { const value = await speedMoleService.rankings(from); if (request.current === current) { setData(value); setOffset(from) } }
    catch (e) { if (request.current === current) setError(e instanceof Error ? e.message : '랭킹 조회 실패') }
    finally { if (request.current === current) setBusy(false) }
  }
  useEffect(() => { void load(0); return () => { ++request.current } }, [])
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  return <dialog ref={dialog} className="speed-mole__ranking-dialog" aria-label="스피드 두더지 전체 랭킹" onCancel={event => { event.preventDefault(); onClose() }}><section className="speed-mole__card">
    <h2>스피드 두더지 랭킹</h2><p>전체 기간 · 개인 최고 점수 · 실수가 적은 순</p>
    {busy && <p role="status">랭킹을 불러오고 있어요…</p>}
    {error && <p role="alert">{error} <button onClick={() => void load(offset)} disabled={busy}>다시 확인</button></p>}
    {data && <><p>{data.me ? `내 최고 ${data.me.score}점 · ${data.me.rank}위 · 실수 ${data.me.misses}회` : '아직 서버에 확정된 내 기록이 없어요.'}</p>
      <table><caption>참가자 {data.totalParticipants}명 · 동점은 공동 순위</caption><thead><tr><th>순위</th><th>닉네임</th><th>점수</th><th>실수</th></tr></thead>
        <tbody>{data.items.map(item => <tr key={item.userId} data-me={item.userId === data.me?.userId}><td>{item.rank}</td><td>{item.nickname}</td><td>{item.score}</td><td>{item.misses}</td></tr>)}</tbody></table>
      {!data.items.length && <p>아직 등록된 기록이 없어요.</p>}
      <div className="speed-mole__actions"><button disabled={busy || offset === 0} onClick={() => void load(Math.max(0, offset - 20))}>이전</button><button disabled={busy || !data.hasMore} onClick={() => void load(offset + 20)}>다음</button></div>
    </>}
    <div className="speed-mole__actions"><button className="speed-mole__primary" onClick={onClose}>닫기</button></div>
  </section></dialog>
}
