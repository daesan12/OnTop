import { useEffect, useRef, useState } from 'react'
import { speedMoleService, type SpeedMoleRankings as Rankings } from './service'
import { SpeedMoleRankingBoard } from './SpeedMoleRankingBoard'

export function SpeedMoleRankings({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Rankings | null>(null)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(true)
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
  return <dialog ref={dialog} className="speed-mole__ranking-dialog" aria-labelledby="speed-mole-ranking-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <SpeedMoleRankingBoard data={data} busy={busy} error={error} offset={offset} onLoad={from => void load(from)} onClose={onClose} />
  </dialog>
}
