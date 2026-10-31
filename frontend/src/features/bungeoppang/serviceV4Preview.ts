import { BUNGEOPPANG_V4 as R } from './config';
import { makeHeatList, makeOrderList, replayGrill, type BreadOrder, type GrillLogEntry } from './rulesV4';
import type { BungeoppangGame, BungeoppangService, BungeoppangSubmit, BungeoppangSubmitResult } from './service';

/** Explicit local development simulation; no persistence, HTTP, wallet writes or API fallback. */
export function createV4PreviewService(random = Math.random, now = Date.now): BungeoppangService {
  type Round = { game: BungeoppangGame; orders: BreadOrder[]; at: number; pausedAt?:number; abandoned: boolean; result?: BungeoppangSubmitResult };
  const rounds = new Map<string, Round>();
  const keys = new Map<string, string>();
  let id = 0;
  const clone = <T,>(value: T): T => structuredClone(value);
  const active = (input: BungeoppangSubmit) => {
    const round = rounds.get(input.gameId);
    if (!round || round.abandoned) throw new Error('진행 중인 미리보기 판이 아니에요.');
    return round;
  };
  return {
    mock: true,
    async getStatus() {
      return { rulesVersion: 'v4', todayEarned: 0, dailyCap: R.dailyCoinCap, isFirstGame: true, seenTips: [] };
    },
    async startGame(key) {
      const existing = keys.get(key);
      if (existing) return clone(rounds.get(existing)!.game);
      for (const round of rounds.values()) round.abandoned = true;
      const orders = makeOrderList(random, R), gameId = `preview-${++id}`;
      const game: BungeoppangGame = { gameId, startedAt: new Date(now()).toISOString(), rulesVersion: 'v4',
        heats: makeHeatList(random, R), isFirstGame: true, v4: { rules: { ...R }, order: orders[0]! } };
      rounds.set(gameId, { game, orders, at: now(), abandoned: false }); keys.set(key, gameId);
      return clone(game);
    },
    async setManualPaused(gameId,paused) {
      const r=rounds.get(gameId);
      if(!r||r.abandoned||r.result)throw new Error('진행 중인 미리보기 판이 아니에요.');
      if(paused&&r.pausedAt===undefined)r.pausedAt=now();
      else if(!paused&&r.pausedAt!==undefined){r.at+=now()-r.pausedAt;delete r.pausedAt;}
    },
    async nextOrder(input) {
      const round = active(input);
      const log = input.log as GrillLogEntry[];
      const index = log.filter(e => e.action === 'DELIVER').length;
      // Recalculate with issuer-owned originals; a repeated prefix returns the same order.
      replayGrill(log, round.game.heats, round.orders.slice(0, index), R);
      if (!index || !round.orders[index]) throw new Error('다음 주문을 발급할 수 없어요.');
      return { index, order: clone(round.orders[index]!) };
    },
    async submitResult(input) {
      const round = active(input);
      if (round.result) return clone(round.result);
      if (now() - round.at < R.durationMs + R.countdownMs) throw new Error('60초 플레이가 끝난 뒤 다시 확인해 주세요.');
      const replay = replayGrill(input.log as GrillLogEntry[], round.game.heats, round.orders, R);
      round.result = { ...replay, coinsCalculated: replay.coins, coinsGranted: 0, todayEarned: 0,
        dailyCap: R.dailyCoinCap, capReached: false };
      return clone(round.result);
    },
    async abandon(gameId) { const round = rounds.get(gameId); if (round && !round.result) round.abandoned = true; },
    async balance() { throw new Error('미리보기는 실제 지갑을 조회하지 않아요.'); },
  };
}
