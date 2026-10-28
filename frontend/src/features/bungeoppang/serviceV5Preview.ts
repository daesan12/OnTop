import { BUNGEOPPANG_V5 as R } from './config';
import { makeHeatList, makeOrderList, summarize, type GrillLogEntry } from './rulesV4';
import { createGrill, replay, type CustomerOrder, type GrillState } from './rulesV5';
import { BungeoppangServiceError, type BungeoppangGame, type BungeoppangService, type BungeoppangSubmit, type BungeoppangSubmitResult } from './service';

/** Issuer simulation for the explicit v5 dev mode. Never touches HTTP, storage or a wallet. */
export function createV5PreviewService(random = Math.random, now = Date.now): BungeoppangService {
  type Round = { game: BungeoppangGame; history: CustomerOrder[]; accepted: GrillState;
    revision: number; end: number; abandoned: boolean; result?: BungeoppangSubmitResult;
    receipts: Map<string, { body: string; grill: GrillState; revision: number }> };
  const rounds = new Map<string, Round>(), keys = new Map<string, string>();
  const clone = <T,>(value: T): T => structuredClone(value);
  let id = 0;
  function round(gameId: string) {
    const value = rounds.get(gameId);
    if (!value || value.abandoned) throw new BungeoppangServiceError('GAME_NOT_ACTIVE', '종료된 미리보기 판이에요.');
    return value;
  }
  function deliver(input: BungeoppangSubmit) {
    const r = round(input.gameId), key = input.deliveryKey;
    const log = input.log as GrillLogEntry[], body = JSON.stringify(log);
    if (!key || log.at(-1)?.action !== 'DELIVER') throw new BungeoppangServiceError('DELIVERY_REJECTED', '납품 기록이 필요해요.');
    const receipt = r.receipts.get(key);
    if (receipt) {
      if (receipt.body !== body) throw new BungeoppangServiceError('IDEMPOTENCY_KEY_CONFLICT', '같은 키의 기록이 바뀌었어요.');
      return clone({ grill: receipt.grill, revision: receipt.revision });
    }
    if (JSON.stringify(log.slice(0, r.accepted.log.length)) !== JSON.stringify(r.accepted.log))
      throw new BungeoppangServiceError('PREFIX_MISMATCH', '승인된 기록이 달라요.');
    const target = r.accepted.activeOrders.find(o => o.orderId === log.at(-1)?.orderId);
    if (!target) throw new BungeoppangServiceError('STALE_ORDER', '이미 바뀐 주문이에요.');
    let state: GrillState;
    try { state = replay(log, r.game.heats, r.history, R); }
    catch { throw new BungeoppangServiceError('DELIVERY_REJECTED', '서버가 납품 기록을 승인하지 않았어요.'); }
    // Generate only after validation; a rejected request never consumes an order draw.
    const items = makeOrderList(random, { ...R, orderListLength: 2 })[1]!.items;
    const replacement: CustomerOrder = { orderId: String(r.history.length + 1), customerSlot: target.customerSlot,
      availableAfterSeq: log.length, items };
    r.history.push(replacement);
    r.accepted = { ...state, activeOrders: [...state.activeOrders, replacement] };
    r.revision++;
    r.receipts.set(key, { body, grill: clone(r.accepted), revision: r.revision });
    return clone({ grill: r.accepted, revision: r.revision });
  }
  return {
    mock: true,
    async getStatus() { return { rulesVersion: 'v5', todayEarned: 0, dailyCap: R.dailyCoinCap, isFirstGame: true, seenTips: [] }; },
    async startGame(key) {
      const previous = keys.get(key);
      if (previous) return clone(rounds.get(previous)!.game);
      for (const r of rounds.values()) r.abandoned = true;
      const orders = makeOrderList(random, { ...R, orderListLength: 3 }).map((o, i): CustomerOrder =>
        ({ ...o, orderId: String(i + 1), customerSlot: i, availableAfterSeq: 0 }));
      const heats = makeHeatList(random, R), gameId = `preview-v5-${++id}`, at = now();
      const game: BungeoppangGame = { gameId, startedAt: new Date(at).toISOString(), rulesVersion: 'v5', heats,
        isFirstGame: true, v5: { orders, rules: { ...R } } };
      rounds.set(gameId, { game: clone(game), history: clone(orders), accepted: createGrill(heats, orders, R),
        revision: 0, end: at + R.countdownMs + R.durationMs, abandoned: false, receipts: new Map() });
      keys.set(key, gameId); return clone(game);
    },
    async deliverV5(input) { return deliver(input); },
    async recoverV5(gameId) { const r = round(gameId); return clone({ grill: r.accepted, revision: r.revision }); },
    async submitResult(input) {
      const r = round(input.gameId);
      if (r.result) return clone(r.result);
      if (now() < r.end) throw new BungeoppangServiceError('TOO_EARLY', '3분 플레이가 끝난 뒤 확인해 주세요.', true);
      if (input.deliveryKey && !r.receipts.has(input.deliveryKey)) {
        // The in-flight prefix is the last DELIVER; suffix cooking remains part of final replay.
        let lastDelivery = -1;
        for (let i = input.log.length - 1; i >= 0; i--) if (input.log[i]!.action === 'DELIVER') { lastDelivery = i; break; }
        if (lastDelivery >= r.accepted.log.length) deliver({ ...input, log: input.log.slice(0, lastDelivery + 1) });
      }
      const state = replay(input.log as GrillLogEntry[], r.game.heats, r.history, R), summary = summarize(state, R);
      r.result = { ...summary, coinsCalculated: summary.coins, coinsGranted: 0, todayEarned: 0,
        dailyCap: R.dailyCoinCap, capReached: false, rulesVersion: 'v5' };
      return clone(r.result);
    },
    async abandon(gameId) { const r = rounds.get(gameId); if (r && !r.result) r.abandoned = true; },
    async balance() { throw new Error('개발 미리보기는 실제 지갑을 조회하지 않아요.'); },
  };
}
