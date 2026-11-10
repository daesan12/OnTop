import { create } from 'zustand'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, STAGE_COUNT, expectedCoins, kstDate, COURSE } from './course'
import { parseJumpEvent, type JumpEvent, type JumpStatus, type RunView, type TipKey, type EndReason } from './protocol'

/** recovered: 끊긴 동안 끝나 status lastRun으로 늦게 받은 결과. 팁·효과음을 다시 내지 않는다. */
export interface ResultView extends RunView { reason: EndReason; finishMs?: number; bestFinishMs?: number | null; newBest?: boolean; until: number; recovered?: boolean }
export interface Popup { gate: number; amount: number | null; label: string; at: number; anticipated: boolean }
const initial = () => ({ owner: '', channelId: '', mapVersion: '', available: false, checked: false, recovering: false,
  completion: null as { runId: string } | null,
  error: '', revision: -1, refresh: 0, walletRevision: 0, earningsDate: '', todayEarned: null as number | null, bestFinishMs: null as number | null,
  seenTips: [] as TipKey[], run: null as (RunView & { startedAt: number }) | null, result: null as ResultView | null,
  banner: null as { title: string; subtitle: string; until: number } | null, popup: null as Popup | null, tip: null as { key: TipKey; text: string; until: number } | null })
export const useJumpmap = create(initial)
export const hits = new Map<number, { at: number; power: number }>()
export const standing = new Map<string, number>()
const lastSteps = new Map<string, number>(), closed = new Set<string>()
// 재연결하면 closed가 비므로, 이미 보여 준 결과 runId는 탭 단위로 남겨 같은 결과를 두 번 띄우지 않는다.
const SHOWN_KEY = 'ontop.jumpmap.shownResults'
function shownResults(): string[] {
  try { const value = JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [] } catch { return [] }
}
function markShown(runId: string) {
  try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shownResults().filter(id => id !== runId), runId].slice(-32))) } catch { /* 저장 불가 환경은 이번 연결의 closed로만 막는다. */ }
}
const stepListeners = new Set<(block: number, player: string, power: number) => void>()
export const onStep = (fn: (block: number, player: string, power: number) => void) => { stepListeners.add(fn); return () => { stepListeners.delete(fn) } }
export function presentStep(block: number, player: string, power: number, now = performance.now()) {
  if (!COURSE[block]) return
  standing.set(player, block)
  const key = `${player}:${block}`
  if (now - (lastSteps.get(key) ?? -Infinity) < 150) return
  lastSteps.set(key, now); if (lastSteps.size > 2048) lastSteps.clear()
  const previous = hits.get(block)
  if (!previous || now - previous.at >= 150) hits.set(block, { at: now, power })
  stepListeners.forEach(fn => fn(block, player, power))
}
export function resetJumpmap() { hits.clear(); standing.clear(); lastSteps.clear(); closed.clear(); useJumpmap.setState(initial(), true) }
export function closeJumpCompletion() { useJumpmap.setState({ completion: null }) }
export function bindJumpmap(owner: string, channelId: string, mapVersion: string) {
  const s = useJumpmap.getState()
  if (owner === s.owner && channelId === s.channelId && mapVersion === s.mapVersion) return
  resetJumpmap(); useJumpmap.setState({ owner, channelId, mapVersion })
}
function moneyPatch(e: { earningsDate: string; todayEarned: number }) {
  const date = kstDate()
  return { earningsDate: date, todayEarned: e.earningsDate === date ? e.todayEarned : null }
}
export function applyJumpStatus(status: JumpStatus, now = performance.now()) {
  const s = useJumpmap.getState()
  if (status.channelId !== s.channelId || status.mapVersion !== s.mapVersion || status.revision < s.revision) return
  const available = status.enabled && status.courseVersion === COURSE_VERSION && status.rulesVersion === RULES_VERSION && status.mapVersion === MAP_VERSION
  const r = status.activeRun
  useJumpmap.setState({ available, checked: true, error: status.enabled && !available ? '점프맵 버전이 달라요. 새로고침 후 다시 확인해 주세요.' : '',
    revision: status.revision, ...moneyPatch(status), bestFinishMs: status.bestFinishMs,
    seenTips: [...new Set([...s.seenTips, ...status.seenTips])], recovering: available && !!status.activeRunId && !r,
    run: available && r ? { ...r, startedAt: now - r.elapsedMs } : null,
    ...(!available ? { completion: null } : {}) })
  const last = status.lastRun
  if (available && last && !r && !closed.has(last.runId) && !shownResults().includes(last.runId)) {
    closed.add(last.runId); markShown(last.runId)
    // 끊긴 동안 받은 엽전이 있을 수 있어 지갑도 다시 읽는다.
    useJumpmap.setState(state => ({ walletRevision: state.walletRevision + 1, result: { runId: last.runId, elapsedMs: last.elapsedMs, gatesPassed: last.gatesPassed, finalReached: last.reason === 'FINISH',
      maxHeight: last.maxHeight, runCoins: last.runCoins, reason: last.reason, finishMs: last.finishMs ?? undefined, bestFinishMs: last.bestFinishMs,
      newBest: last.newBest ?? undefined, until: now + (last.reason === 'FINISH' ? 7000 : 10000), recovered: true }, ...(last.reason === 'FINISH' ? { completion: { runId: last.runId } } : {}) }))
  }
}
export function receiveJumpmap(type: string, payload: unknown, owner: string, channelId: string, mapVersion: string, now = performance.now()) {
  if (!type.startsWith('JUMPMAP_')) return false
  bindJumpmap(owner, channelId, mapVersion)
  try { const event = parseJumpEvent(type, payload); if (event) acceptJumpEvent(event, now) }
  catch { useJumpmap.setState(s => ({ error: '점프맵 정보를 다시 확인하고 있어요.', refresh: s.refresh + 1 })) }
  return true
}
export function acceptJumpEvent(e: JumpEvent, now = performance.now()) {
  const s = useJumpmap.getState()
  if (!s.owner || e.channelId !== s.channelId || e.mapVersion !== s.mapVersion) return
  if (e.type === 'JUMPMAP_STEP') { if (s.available) presentStep(e.block, e.playerId, e.playerId === s.owner ? 1 : .65, now); return }
  if (e.revision <= s.revision) return
  if (e.type === 'JUMPMAP_STARTED') {
    if (closed.has(e.runId)) return
    const available = e.courseVersion === COURSE_VERSION && e.rulesVersion === RULES_VERSION && e.mapVersion === MAP_VERSION
    if (!available) { useJumpmap.setState({ available: false, checked: true, error: '점프맵 버전이 달라요. 새로고침해 주세요.' }); return }
    const same = s.run?.runId === e.runId
    useJumpmap.setState({ available: true, checked: true, revision: e.revision, ...moneyPatch(e), result: null, recovering: false, completion: null,
      run: same ? s.run : { runId: e.runId, elapsedMs: 0, gatesPassed: 0, finalReached: false, maxHeight: 0, runCoins: 0, startedAt: now },
      ...(same ? {} : { popup: null, banner: null }) }); return
  }
  if (!s.available) return
  const ownRun = s.run?.runId === e.runId, ownResult = s.result?.runId === e.runId
  if (e.type === 'JUMPMAP_GATE_SETTLED') {
    useJumpmap.setState({ revision: e.revision, ...moneyPatch(e), walletRevision: s.walletRevision + 1,
      ...(ownRun ? { run: { ...s.run!, runCoins: e.runCoins } } : {}), ...(ownResult ? { result: { ...s.result!, runCoins: e.runCoins } } : {}),
      ...(ownRun && s.popup?.gate === e.gate ? { popup: { ...s.popup, amount: e.coinsGranted, label: e.coinsGranted === 0 ? '오늘 미니게임 공통 상한 500냥 도달' : '', anticipated: false } } : {}) }); return
  }
  if (!ownRun) { if (!closed.has(e.runId)) useJumpmap.setState({ refresh: s.refresh + 1 }); return }
  if (e.type === 'JUMPMAP_FINAL_PAD') {
    useJumpmap.setState({ revision: e.revision, run: { ...s.run!, finalReached: true } }); return
  }
  if (e.type === 'JUMPMAP_GATE') {
    if (e.gate <= s.run!.gatesPassed) return
    useJumpmap.setState({ revision: e.revision, ...moneyPatch(e), walletRevision: s.walletRevision + (e.pending ? 0 : 1),
      run: { ...s.run!, gatesPassed: e.gate, runCoins: e.runCoins, elapsedMs: e.elapsedMs },
      popup: { gate: e.gate, amount: e.pending ? s.todayEarned === null ? null : expectedCoins(e.gate, s.todayEarned) : e.coinsGranted,
        label: e.pending ? '정산 중…' : e.coinsGranted === 0 ? '오늘 미니게임 공통 상한 500냥 도달' : Number(e.coinsGranted) < e.coinsCalculated ? '오늘 상한까지' : '', at: now, anticipated: false },
      banner: null }); return
  }
  if (e.type === 'JUMPMAP_ENDED') {
    closed.add(e.runId); if (closed.size > 128) closed.delete(closed.values().next().value!)
    markShown(e.runId)
    useJumpmap.setState({ revision: e.revision, ...moneyPatch(e), run: null, recovering: false, walletRevision: s.walletRevision + 1,
      result: { runId: e.runId, elapsedMs: e.elapsedMs, gatesPassed: e.gatesPassed, finalReached: e.reason === 'FINISH', maxHeight: e.maxHeight, runCoins: e.runCoins,
        reason: e.reason, finishMs: e.finishMs, bestFinishMs: e.bestFinishMs, newBest: e.newBest, until: now + (e.reason === 'FINISH' ? 7000 : 10000) },
      ...(e.reason === 'FINISH' ? { bestFinishMs: e.bestFinishMs ?? null, completion: { runId: e.runId } } : { completion: null }), banner: null, ...(e.reason === 'FALL' || e.reason === 'LAKE' ? { tip: { key: 'FIRST_FALL', text: '첫 발판으로 돌아가 다시 도전해요', until: now + 1500 } } : {}) })
  }
}
export function anticipateGate(gate: number, now = performance.now()) {
  const s = useJumpmap.getState()
  if (!s.run || gate !== s.run.gatesPassed + 1 || s.popup?.gate === gate) return
  useJumpmap.setState({ popup: { gate, amount: s.todayEarned === null ? null : expectedCoins(gate, s.todayEarned), label: '확인 중…', at: now, anticipated: true } })
}
const tips: Record<TipKey, string> = { START_SPOT: '첫 발판을 밟으면 시작해요. 세이브 포인트는 없어요', RUN_STARTED: '구간 문을 지나면 엽전을 받아요', FIRST_GATE: '떨어져도 받은 엽전은 그대로예요', FIRST_FALL: '걸어서 돌탑으로 돌아가요. 돌탑 길 안내를 켜 보세요', FINAL_PAD: STAGE_COUNT===10?'오리를 따라 호수섬으로 내려오세요':'앞의 엽전을 향해 호수로 뛰어드세요' }
export function showTip(key: TipKey, now = performance.now()) {
  const s = useJumpmap.getState(); if (s.seenTips.includes(key)) return false
  useJumpmap.setState({ seenTips: [...s.seenTips, key], tip: { key, text: tips[key], until: now + 1200 } }); return true
}
