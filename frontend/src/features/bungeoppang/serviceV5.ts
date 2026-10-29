import { record } from '../../network/protocol';
import { RestError } from '../../network/restError';
import { BUNGEOPPANG_V5 as R, BUNGEOPPANG_V5_LEGACY } from './config';
import { completeResult, createBungeoppangV4Service, prefixHash, toCheckpoint, toRules, toTiming } from './serviceV4';
import { validateCustomers, type CustomerOrder, type GrillState } from './rulesV5';
import { BREAD_FILLINGS, type BungeoppangRules, type GrillLogEntry } from './rulesV4';
import { BungeoppangServiceError, messages, type BungeoppangService, type BungeoppangSubmit } from './service';
import type { RoundTiming } from './serverTime';

type WireAction = { seq: number; action: GrillLogEntry['action']; t: number; slot?: number;
  filling?: GrillLogEntry['filling']; breadId?: number; orderId?: string; deliveryKey?: string };
type Source = { config: string; rules: Readonly<BungeoppangRules>; heats: number[]; timing: RoundTiming;
  grill: GrillState; accepted: WireAction[]; revision: number };
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v);
const keyOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const fail = (): never => { throw new BungeoppangServiceError('INVALID_RESPONSE', 'v5 서버 응답을 확인하지 못했어요.', true); };
function orders(value: unknown, rules: BungeoppangRules): CustomerOrder[] {
  if (!Array.isArray(value) || !value.every(o => record(o) && id(o.orderId)
    && whole(o.customerSlot) && whole(o.availableAfterSeq) && record(o.items))) return fail();
  const result = structuredClone(value) as CustomerOrder[];
  try { validateCustomers(result, rules); } catch { return fail(); }
  return result;
}
function checkpoint(value: unknown, source: Pick<Source, 'rules' | 'heats'>, log: GrillLogEntry[]) {
  if (!record(value)) return fail();
  const c = toCheckpoint({ ...value, currentOrder: null }), activeOrders = orders(value.activeOrders, source.rules);
  if (c.throughSeq !== log.length || c.tray.length > 10 || c.heatCursor > source.heats.length
    || new Set(c.tray.map(b => b.breadId)).size !== c.tray.length
    || activeOrders.some(o => o.availableAfterSeq > c.throughSeq)
    || c.slots.some(s => s.since >= source.rules.durationMs || s.heat < source.rules.heatMin || s.heat > source.rules.heatMax
      || (s.lastAt !== null && s.lastAt >= source.rules.durationMs))) return fail();
  const grill: GrillState = { rulesVersion: 'v5', order: null, orderIndex: c.stats.customersServed,
    activeOrders, slots: c.slots.map(({ slot: _slot, ...s }) => s), heats: [...source.heats],
    tray: c.tray.map(({ breadId, ...b }) => ({ id: breadId, ...b })), fills: c.heatCursor,
    lastAt: c.lastAt, score: c.stats.score, made: c.stats.made, golden: c.stats.golden,
    failed: c.stats.failed, wasted: c.stats.wasted, combo: c.stats.combo, maxCombo: c.stats.maxCombo,
    served: c.stats.served, customersServed: c.stats.customersServed, specialServed: c.stats.specialServed,
    bonusScore: c.stats.bonusScore, log: structuredClone(log) };
  return { grill, revision: c.revision, hash: c.prefixHash };
}
function localLog(actions: WireAction[], rules: BungeoppangRules): GrillLogEntry[] {
  return actions.map((a, index) => {
    if (!record(a) || a.seq !== index + 1 || !whole(a.t) || a.t >= rules.durationMs
      || !['POUR', 'FILL', 'TURN', 'DISCARD', 'TRAY_DISCARD', 'DELIVER'].includes(a.action)) return fail();
    if (a.action === 'DELIVER' && (!id(a.orderId) || !keyOk(a.deliveryKey))) return fail();
    if (a.action === 'TRAY_DISCARD' && (!whole(a.breadId) || a.breadId < 1)) return fail();
    if (a.action === 'FILL' && !BREAD_FILLINGS.includes(a.filling!)) return fail();
    if (!['DELIVER', 'TRAY_DISCARD'].includes(a.action) && (!whole(a.slot) || a.slot > 5)) return fail();
    return { action: a.action, t: a.t, slot: a.action === 'DELIVER' ? -1 : a.slot ?? 0,
      ...(a.action === 'FILL' ? { filling: a.filling } : {}), ...(a.orderId ? { orderId: a.orderId } : {}),
      ...(a.breadId ? { breadId: a.breadId } : {}) };
  });
}
/** Draft REST adapter: opt-in only until the BE accepts docs/bungeoppang-v5. No error-to-mock fallback. */
export function createBungeoppangV5Service(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>): BungeoppangService {
  const path = '/api/v1/minigames/sessions', sources = new Map<string, Source>();
  const frozen = new Map<string, { fingerprint: string; body: unknown }>();
  const sessionPath = (gameId: string) => id(gameId) ? `${path}/${gameId}` : fail();
  const post = (body: unknown, key?: string): RequestInit => ({ method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  async function request(url: string, init: RequestInit = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try { return await requestJSON(url, { ...init, signal: controller.signal }); }
    catch (error) {
      if (error instanceof BungeoppangServiceError) throw error;
      if (error instanceof RestError) throw new BungeoppangServiceError(error.code, messages[error.code] ?? error.message,
        error.status >= 500 || error.status === 429 || error.code === 'TOO_EARLY', error.status);
      throw new BungeoppangServiceError('NETWORK_ERROR', 'v5 서버 연결을 확인한 뒤 같은 요청으로 다시 시도해 주세요.', true);
    } finally { clearTimeout(timer); }
  }
  function source(gameId: string) { return sources.get(gameId) ?? fail(); }
  async function body(input: BungeoppangSubmit, operation: 'DELIVERY' | 'COMPLETE') {
    const s = source(input.gameId), key = operation === 'DELIVERY' ? input.deliveryKey : input.completeKey;
    if (!keyOk(key)) return fail();
    const fingerprint = JSON.stringify(input), identity = `${input.gameId}/${operation}/${key}`, previous = frozen.get(identity);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new BungeoppangServiceError('IDEMPOTENCY_KEY_CONFLICT', '재시도 기록이 변경됐어요.');
      return previous.body;
    }
    const actions = input.log.map((raw, index): WireAction => {
      const entry = raw as GrillLogEntry;
      const a: WireAction = { seq: index + 1, action: entry.action, t: entry.t };
      if (entry.action === 'DELIVER') {
        if (!id(entry.orderId)) return fail();
        a.orderId = entry.orderId;
        a.deliveryKey = index < s.accepted.length ? s.accepted[index]?.deliveryKey : input.deliveryKey;
        if (!keyOk(a.deliveryKey)) return fail();
      } else if (entry.action === 'TRAY_DISCARD') a.breadId = entry.breadId;
      else { a.slot = entry.slot; if (entry.action === 'FILL') a.filling = entry.filling; }
      return a;
    });
    localLog(actions, s.rules);
    const tuple = (a: WireAction) => [a.seq, a.action, a.t, a.slot ?? null, a.filling ?? null,
      a.breadId ?? null, a.orderId ?? null, a.deliveryKey ?? null];
    if (actions.length > s.rules.maxLogEntries || actions.length < s.accepted.length
      || s.accepted.some((a, i) => JSON.stringify(tuple(a)) !== JSON.stringify(tuple(actions[i]!)))) return fail();
    if (operation === 'DELIVERY' && actions.at(-1)?.action !== 'DELIVER') return fail();
    const hash = await prefixHash(input.gameId, s.config, actions, 'v5');
    const result = { rulesVersion: 'v5', throughSeq: actions.length, prefixHash: hash, log: actions,
      ...(operation === 'COMPLETE' ? { seenTips: input.seenTips, clientScore: input.clientScore } : {}) };
    frozen.set(identity, { fingerprint, body: result }); return result;
  }
  const service: BungeoppangService = {
    mock: false,
    async getStatus() {
      const p = await request(`${path}?rulesVersion=v5`);
      if (!record(p) || p.rulesVersion !== 'v5' || !whole(p.todayEarned) || p.dailyCap !== 100
        || p.todayEarned > p.dailyCap || typeof p.isFirstGame !== 'boolean' || !Array.isArray(p.seenTips)
        || !p.seenTips.every(t => typeof t === 'string')) return fail();
      return { rulesVersion: 'v5', todayEarned: p.todayEarned, dailyCap: p.dailyCap,
        isFirstGame: p.isFirstGame, seenTips: p.seenTips as string[] };
    },
    async startGame(key) {
      if (!keyOk(key)) return fail();
      const p = await request(path, post({ minigameType: 'BUNGEOPPANG', rulesVersion: 'v5' }, key));
      if (!record(p) || !id(p.minigameSessionId) || p.rulesVersion !== 'v5' || p.minigameType !== 'BUNGEOPPANG'
        || p.status !== 'PLAYING' || typeof p.configVersion !== 'string' || typeof p.startedAt !== 'string'
        || !Number.isFinite(Date.parse(p.startedAt)) || typeof p.isFirstGame !== 'boolean' || !Array.isArray(p.heats)) return fail();
      const rules = toRules(p.rules), timing = toTiming(p.timing, rules.durationMs);
      const supportedTiming = [R, BUNGEOPPANG_V5_LEGACY].some(profile =>
        rules.durationMs === profile.durationMs && rules.rushFromMs === profile.rushFromMs);
      if (!record(p.rules) || p.rules.heatAssignment !== 'FILL' || p.rules.maxActiveOrders !== 3
        || rules.slots !== 6 || !supportedTiming || rules.trayCapacity !== 10
        || rules.sideMs !== 8000 || rules.rushSideMs !== 6000 || rules.heatMin !== 85 || rules.heatMax !== 115
        || p.heats.length !== rules.heatListLength || rules.heatListLength < 1 || rules.heatListLength > 4096
        || rules.maxLogEntries < 1 || rules.maxLogEntries > 3600
        || !p.heats.every(h => whole(h) && h >= rules.heatMin && h <= rules.heatMax)) return fail();
      const heats = p.heats as number[], initial = checkpoint(p.checkpoint, { rules, heats }, []);
      if (!sources.has(p.minigameSessionId)) { sources.clear(); frozen.clear(); }
      sources.set(p.minigameSessionId, { config: p.configVersion, rules, timing, heats: [...heats],
        grill: initial.grill, accepted: [], revision: initial.revision });
      const timeSync = await service.syncTimeV4!(p.minigameSessionId);
      const current = timeSync.status === 'PLAYING' ? await service.recoverV5!(p.minigameSessionId) : initial;
      return { gameId: p.minigameSessionId, startedAt: p.startedAt, rulesVersion: 'v5', heats: [...heats],
        isFirstGame: p.isFirstGame, v5: { orders: current.grill.activeOrders, rules, grill: current.grill, timing, timeSync } };
    },
    async syncTimeV4(gameId) {
      const s = source(gameId), sent = performance.now(), p = await request(sessionPath(gameId)), receivedAt = performance.now();
      if (!record(p) || p.rulesVersion !== 'v5' || p.minigameSessionId !== gameId || p.configVersion !== s.config
        || !['PLAYING', 'COMPLETED', 'ABANDONED', 'INVALID'].includes(String(p.status))
        || typeof p.serverNow !== 'string' || !Number.isFinite(Date.parse(p.serverNow))) return fail();
      const timing = toTiming(p.timing, s.rules.durationMs);
      if (JSON.stringify(timing) !== JSON.stringify(s.timing)) return fail();
      if (receivedAt - sent > 1000) throw new BungeoppangServiceError('TIME_SYNC_SLOW', '서버 시간을 다시 확인해 주세요.', true);
      return { timing, sample: { receivedAt, serverNowMs: Date.parse(p.serverNow), rttMs: receivedAt - sent },
        status: p.status as 'PLAYING' | 'COMPLETED' | 'ABANDONED' | 'INVALID',
        ...(p.status === 'COMPLETED' ? { result: completeResult(p.result, gameId, 'v5') } : {}) };
    },
    async deliverV5(input) {
      const s = source(input.gameId), data = await body(input, 'DELIVERY');
      const p = await request(`${sessionPath(input.gameId)}/deliveries`, post(data, input.deliveryKey));
      if (!record(p) || p.minigameSessionId !== input.gameId || p.deliveryKey !== input.deliveryKey || p.accepted !== true
        || !record(data) || p.throughSeq !== data.throughSeq || p.prefixHash !== data.prefixHash) return fail();
      const next = checkpoint(p.checkpoint, s, input.log as GrillLogEntry[]);
      if (next.hash !== data.prefixHash || next.revision < s.revision) return fail();
      s.grill = next.grill; s.revision = next.revision; s.accepted = data.log as WireAction[];
      return next;
    },
    async recoverV5(gameId) {
      const s = source(gameId), p = await request(`${sessionPath(gameId)}?includeProgress=true`);
      if (!record(p) || p.minigameSessionId !== gameId || p.rulesVersion !== 'v5' || p.configVersion !== s.config
        || p.status !== 'PLAYING' || !Array.isArray(p.acceptedLog)) return fail();
      const accepted = p.acceptedLog as WireAction[], log = localLog(accepted, s.rules), next = checkpoint(p.checkpoint, s, log);
      if (next.revision < s.revision || await prefixHash(gameId, s.config, accepted, 'v5') !== next.hash) return fail();
      s.grill = next.grill; s.revision = next.revision; s.accepted = structuredClone(accepted); return next;
    },
    async submitResult(input) {
      const data = await body(input, 'COMPLETE');
      try { return completeResult(await request(`${sessionPath(input.gameId)}/complete`, post(data, input.completeKey)), input.gameId, 'v5'); }
      catch (error) {
        if (error instanceof BungeoppangServiceError && error.retryable) {
          try {
            const p = await request(sessionPath(input.gameId));
            if (record(p) && p.minigameSessionId === input.gameId && p.status === 'COMPLETED') return completeResult(p.result, input.gameId, 'v5');
          } catch { /* Preserve the identical completion body and its original failure. */ }
        }
        throw error;
      }
    },
    async abandon(gameId) {
      const p = await request(`${sessionPath(gameId)}/abandon`, post({}));
      if (!record(p) || p.minigameSessionId !== gameId || p.status !== 'ABANDONED' || p.rewardAmount !== 0) return fail();
      sources.delete(gameId);
      for (const key of frozen.keys()) if (key.startsWith(`${gameId}/`)) frozen.delete(key);
    },
    balance: () => createBungeoppangV4Service(requestJSON).balance(),
  };
  return service;
}
