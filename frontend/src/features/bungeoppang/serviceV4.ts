import { RestError } from '../../network/restError';
import { record } from '../../network/protocol';
import {
  applyAction,
  type BreadFilling,
  type BreadOrder,
  type BungeoppangRules,
  type GrillLogEntry,
  type GrillState,
} from './rulesV4';
import {
  BungeoppangServiceError,
  messages as sharedMessages,
  type BungeoppangGame,
  type BungeoppangService,
  type BungeoppangSubmit,
  type BungeoppangTimeSync,
} from './service';
import {validTimingUpdate,type RoundTiming,type ServerTimeSample} from './serverTime';

type RequestJson = (path: string, init?: RequestInit) => Promise<unknown>;
type WireAction = {
  seq: number;
  action: GrillLogEntry['action'];
  t: number;
  slot?: number;
  filling?: BreadFilling;
  breadId?: number;
  orderId?: string;
  deliveryKey?: string;
};
type WireOrder = Required<Pick<BreadOrder, 'orderId' | 'orderIndex'>> & BreadOrder;

export interface V4Checkpoint {
  revision: number;
  throughSeq: number;
  prefixHash: string;
  heatCursor: number;
  lastAt: number | null;
  slots: Array<{ slot: number; phase: 'empty' | 'batter' | 'front' | 'back'; since: number; heat: number;
    filling: BreadFilling | null; front: number; lastAt: number | null }>;
  tray: Array<{ breadId: number; filling: BreadFilling; front: number; back: number; points: number }>;
  stats: { score: number; made: number; successfulMade: number; golden: number; failed: number; wasted: number;
    grillDiscarded: number; trayDiscarded: number; combo: number; maxCombo: number; served: number;
    customersServed: number; specialServed: number; bonusScore: number };
  currentOrder: WireOrder | null;
}

interface SessionSource {
  configVersion: string;
  rules: Readonly<BungeoppangRules & { rulesVersion: 'v4' }>;
  heats: number[];
  checkpoint: V4Checkpoint;
  accepted: WireAction[];
  orders: WireOrder[];
  acceptedLocalCount: number;
  timing: RoundTiming;
}

const sessions = new Map<string, SessionSource>();
const whole = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value);
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const keyPattern = /^[A-Za-z0-9_-]{1,64}$/;
const fail = (): never => { throw new BungeoppangServiceError('INVALID_RESPONSE',
  '서버 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', true); };

const messages: Record<string, string> = {
  RULES_VERSION_MISMATCH: '게임 규칙이 변경됐어요. 새로고침 후 새 판을 시작해 주세요.',
  DELIVERY_REJECTED: '서버가 납품 기록을 승인하지 않았어요. 진행 상태를 복구합니다.',
  PREFIX_MISMATCH: '서버 승인 기록과 현재 기록이 달라 진행 상태를 복구합니다.',
  STALE_ORDER: '이미 바뀐 주문이에요. 현재 주문을 다시 확인합니다.',
  ORDER_ALREADY_DELIVERED: '이미 처리한 주문이에요. 서버 승인 결과를 다시 확인합니다.',
  TIME_AHEAD: '서버 플레이 시각과 맞지 않아 진행 상태를 다시 확인합니다.',
  GAME_NOT_ACTIVE: '이미 종료됐거나 제출 기한이 지난 판이에요.',
  MINIGAME_UNAVAILABLE: '미니게임 서버를 잠시 사용할 수 없어요.',
};

export function toTiming(value: unknown, durationMs = 60000): RoundTiming {
  const fields = ['countdownStartsAt', 'playStartsAt', 'playEndsAt', 'submitDeadline', 'expiresAt'] as const;
  if (!record(value) || !fields.every(name => instant(value[name]))) return fail();
  const times = fields.map(name => Date.parse(value[name] as string));
  if (times.some((time, index) => index > 0 && time <= times[index - 1]!)
    || times[1]! - times[0]! !== 3500 || times[2]! - times[1]! !== durationMs) return fail();
  if((value.paused!==undefined||value.pauseRevision!==undefined)
    &&(typeof value.paused!=='boolean'||!whole(value.pauseRevision)))return fail();
  return {...Object.fromEntries(fields.map(name => [name, value[name]])),
    ...(value.paused===undefined?{}:{paused:value.paused,pauseRevision:Number(value.pauseRevision)})} as unknown as RoundTiming;
}

export function toRules(value: unknown): Readonly<BungeoppangRules & { rulesVersion: 'v4' }> {
  if (!record(value)) return fail();
  const ints = ['slots', 'durationMs', 'countdownMs', 'sideMs', 'rushSideMs', 'rushFromMs', 'heatMin',
    'heatMax', 'heatListLength', 'trayCapacity', 'maxOrderItems', 'specialOrderChancePercent',
    'specialBonusPercent', 'okFrom', 'goldenFrom', 'goldenTo', 'burntFrom', 'okPoint', 'goldenPoint',
    'pointsPerCoin', 'dailyCoinCap', 'minGapMs', 'sameSlotGapMs', 'maxLogEntries'] as const;
  if (!ints.every(name => whole(value[name])) || !record(value.firstOrder)) return fail();
  const firstOrder = value.firstOrder;
  const fillings = ['bean', 'custard', 'pizza', 'chocolate'] as const;
  if (!fillings.every(name => whole(firstOrder[name]))) return fail();
  return Object.freeze({
    rulesVersion: 'v4', slots: Number(value.slots), durationMs: Number(value.durationMs),
    countdownMs: Number(value.countdownMs), sideMs: Number(value.sideMs), rushSideMs: Number(value.rushSideMs),
    rushFromMs: Number(value.rushFromMs), heatMin: Number(value.heatMin), heatMax: Number(value.heatMax),
    heatListLength: Number(value.heatListLength), trayCapacity: Number(value.trayCapacity),
    maxOrderItems: Number(value.maxOrderItems), orderListLength: 0,
    specialOrderChance: Number(value.specialOrderChancePercent) / 100,
    specialBonusPercent: Number(value.specialBonusPercent), firstOrder: {
      bean: Number(firstOrder.bean), custard: Number(firstOrder.custard),
      pizza: Number(firstOrder.pizza), chocolate: Number(firstOrder.chocolate),
    }, maxLogEntries: Number(value.maxLogEntries), okFrom: Number(value.okFrom),
    goldenFrom: Number(value.goldenFrom), goldenTo: Number(value.goldenTo), burntFrom: Number(value.burntFrom),
    okPoint: Number(value.okPoint), goldenPoint: Number(value.goldenPoint), pointsPerCoin: Number(value.pointsPerCoin),
    dailyCoinCap: Number(value.dailyCoinCap), minGapMs: Number(value.minGapMs),
    sameSlotGapMs: Number(value.sameSlotGapMs),
  });
}

function toOrder(value: unknown): WireOrder {
  if (!record(value) || !id(value.orderId) || !whole(value.orderIndex) || !record(value.items)) return fail();
  const items = value.items;
  if (!['bean', 'custard', 'pizza', 'chocolate'].every(name => whole(items[name]))) return fail();
  return { orderId: value.orderId, orderIndex: Number(value.orderIndex), items: {
    bean: Number(items.bean), custard: Number(items.custard), pizza: Number(items.pizza), chocolate: Number(items.chocolate),
  } };
}

export function toCheckpoint(value: unknown, allowNegativeScore = false): V4Checkpoint {
  if (!record(value) || !whole(value.revision) || !whole(value.throughSeq)
    || typeof value.prefixHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.prefixHash)
    || !whole(value.heatCursor) || !(value.lastAt === null || whole(value.lastAt))
    || !Array.isArray(value.slots) || value.slots.length !== 6 || !Array.isArray(value.tray)
    || !record(value.stats)) return fail();
  const slots = value.slots.map((slot, index) => {
    if (!record(slot) || slot.slot !== index || !['empty', 'batter', 'front', 'back'].includes(String(slot.phase))
      || !whole(slot.since) || !whole(slot.heat) || !whole(slot.front)
      || !(slot.lastAt === null || whole(slot.lastAt))
      || !(slot.filling === null || ['bean', 'custard', 'pizza', 'chocolate'].includes(String(slot.filling)))) return fail();
    return { slot: index, phase: slot.phase as V4Checkpoint['slots'][number]['phase'], since: Number(slot.since),
      heat: Number(slot.heat), filling: slot.filling as BreadFilling | null, front: Number(slot.front),
      lastAt: slot.lastAt === null ? null : Number(slot.lastAt) };
  });
  const tray = value.tray.map(bread => {
    if (!record(bread) || !whole(bread.breadId) || Number(bread.breadId) < 1
      || !['bean', 'custard', 'pizza', 'chocolate'].includes(String(bread.filling))
      || !whole(bread.front) || !whole(bread.back) || !whole(bread.points)) return fail();
    return { breadId: Number(bread.breadId), filling: bread.filling as BreadFilling,
      front: Number(bread.front), back: Number(bread.back), points: Number(bread.points) };
  });
  const stats = value.stats;
  const names = ['score', 'made', 'successfulMade', 'golden', 'failed', 'wasted', 'grillDiscarded',
    'trayDiscarded', 'combo', 'maxCombo', 'served', 'customersServed', 'specialServed', 'bonusScore'] as const;
  if (!names.every(name => name === 'score' && allowNegativeScore ? Number.isSafeInteger(stats[name]) : whole(stats[name]))) return fail();
  return { revision: Number(value.revision), throughSeq: Number(value.throughSeq), prefixHash: value.prefixHash,
    heatCursor: Number(value.heatCursor), lastAt: value.lastAt === null ? null : Number(value.lastAt), slots, tray,
    stats: Object.fromEntries(names.map(name => [name, Number(stats[name])])) as V4Checkpoint['stats'],
    currentOrder: value.currentOrder === null ? null : toOrder(value.currentOrder) };
}

function localAction(action: WireAction, orders: WireOrder[]): GrillLogEntry {
  const common = { action: action.action, t: action.t } as GrillLogEntry;
  if (action.action === 'TRAY_DISCARD') return { ...common, slot: 0 };
  if (action.action === 'DELIVER') return { ...common, slot: -1,
    order: orders.find(order => order.orderId === action.orderId)?.orderIndex ?? 0 };
  return { ...common, slot: action.slot!, ...(action.action === 'FILL' ? { filling: action.filling } : {}) };
}

export function grillFromCheckpoint(source: SessionSource): GrillState {
  const c = source.checkpoint;
  return {
    rulesVersion: 'v4', slots: c.slots.map(slot => ({ phase: slot.phase, since: slot.since, heat: slot.heat,
      filling: slot.filling, front: slot.front, lastAt: slot.lastAt })), heats: [...source.heats],
    order: c.currentOrder ? { ...c.currentOrder, items: { ...c.currentOrder.items } } : null,
    orderIndex: c.currentOrder?.orderIndex ?? source.orders.length, tray: c.tray.map(bread => ({ id: bread.breadId,
      filling: bread.filling, front: bread.front, back: bread.back, points: bread.points })),
    fills: c.heatCursor, lastAt: c.lastAt, score: c.stats.score, combo: c.stats.combo,
    maxCombo: c.stats.maxCombo, made: c.stats.made, golden: c.stats.golden, failed: c.stats.failed,
    wasted: c.stats.wasted, served: c.stats.served, customersServed: c.stats.customersServed,
    specialServed: c.stats.specialServed, bonusScore: c.stats.bonusScore,
    log: source.accepted.map(action => localAction(action, source.orders)),
  };
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export async function prefixHash(sessionId: string, configVersion: string, actions: WireAction[], version = 'v4'): Promise<string> {
  const encoder = new TextEncoder();
  let hash = await sha256(encoder.encode(`BUNGEOPPANG/${version}\n${sessionId}\n${configVersion}\n`));
  for (const action of actions) {
    const tuple = [action.seq, action.action, action.t, action.slot ?? null, action.filling ?? null,
      action.breadId ?? null, action.orderId ?? null, action.deliveryKey ?? null];
    const encoded = encoder.encode(JSON.stringify(tuple));
    const joined = new Uint8Array(hash.length + 1 + encoded.length);
    joined.set(hash); joined[hash.length] = 10; joined.set(encoded, hash.length + 1);
    hash = await sha256(joined);
  }
  return hex(hash);
}

function wirePrefix(source: SessionSource, input: BungeoppangSubmit): Promise<{ actions: WireAction[]; hash: string }> {
  if (!input.deliveryKey || !keyPattern.test(input.deliveryKey)) return Promise.reject(new BungeoppangServiceError(
    'INVALID_REQUEST', '납품 요청 키를 확인해 주세요.'));
  const suffix = input.log.slice(source.acceptedLocalCount);
  let state = grillFromCheckpoint(source);
  const actions = [...source.accepted];
  suffix.forEach((raw, offset) => {
    if (!('slot' in raw) || !['POUR', 'FILL', 'TURN', 'DISCARD', 'TRAY_DISCARD', 'DELIVER'].includes(raw.action)) fail();
    const entry = raw as GrillLogEntry;
    const seq = actions.length + 1;
    let action: WireAction;
    if (entry.action === 'TRAY_DISCARD') {
      const bread = state.tray[entry.slot];
      if (!bread) fail();
      action = { seq, action: entry.action, t: entry.t, breadId: bread.id };
    } else if (entry.action === 'DELIVER') {
      const order = source.orders.find(value => value.orderIndex === state.orderIndex);
      const orderId = order?.orderId;
      if (!orderId) fail();
      if (offset !== suffix.length - 1) fail();
      action = { seq, action: entry.action, t: entry.t, orderId, deliveryKey: input.deliveryKey };
    } else action = { seq, action: entry.action, t: entry.t, slot: entry.slot,
      ...(entry.action === 'FILL' ? { filling: entry.filling } : {}) };
    actions.push(action);
    state = applyAction(state, entry, source.rules).state;
  });
  if (!actions.length || actions.at(-1)?.action !== 'DELIVER') fail();
  return prefixHash(input.gameId, source.configVersion, actions).then(hash => ({ actions, hash }));
}

async function wireCompletion(source: SessionSource, input: BungeoppangSubmit) {
  const suffix = input.log.slice(source.acceptedLocalCount);
  let state = grillFromCheckpoint(source);
  const actions = [...source.accepted];
  let pendingDeliveries = 0;
  suffix.forEach(raw => {
    if (!('slot' in raw) || !['POUR', 'FILL', 'TURN', 'DISCARD', 'TRAY_DISCARD', 'DELIVER'].includes(raw.action)) fail();
    const entry = raw as GrillLogEntry;
    const seq = actions.length + 1;
    let action: WireAction;
    if (entry.action === 'TRAY_DISCARD') {
      const bread = state.tray[entry.slot];
      if (!bread) fail();
      action = { seq, action: entry.action, t: entry.t, breadId: bread.id };
    } else if (entry.action === 'DELIVER') {
      pendingDeliveries += 1;
      if (pendingDeliveries > 1 || !input.deliveryKey || !keyPattern.test(input.deliveryKey)) fail();
      const orderId = source.orders.find(value => value.orderIndex === state.orderIndex)?.orderId;
      if (!orderId) fail();
      action = { seq, action: entry.action, t: entry.t, orderId, deliveryKey: input.deliveryKey };
    } else action = { seq, action: entry.action, t: entry.t, slot: entry.slot,
      ...(entry.action === 'FILL' ? { filling: entry.filling } : {}) };
    actions.push(action);
    state = applyAction(state, entry, source.rules).state;
  });
  return { actions, hash: await prefixHash(input.gameId, source.configVersion, actions) };
}

export function completeResult(value: unknown, gameId: string, version = 'v4') {
  if (!record(value) || value.minigameSessionId !== gameId || value.status !== 'COMPLETED'
    || value.rulesVersion !== version || typeof value.configVersion !== 'string') return fail();
  const integers = ['verifiedCompletedCount', 'rewardAmount', 'score', 'made', 'golden', 'failed', 'wasted',
    'maxCombo', 'coinsCalculated', 'coinsGranted', 'todayEarned', 'dailyCap', 'successfulMade', 'served',
    'customersServed', 'specialServed', 'bonusScore', 'grillDiscarded', 'trayDiscarded', 'undeliveredCount',
    'unfinishedGrillCount', 'finalThroughSeq'] as const;
  if (!integers.every(name => name === 'score' && version === 'v5' ? Number.isSafeInteger(value[name]) : whole(value[name])) || typeof value.capReached !== 'boolean'
    || typeof value.rewardDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.rewardDate)
    || !instant(value.settledAt) || typeof value.finalPrefixHash !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.finalPrefixHash)
    || value.rewardAmount !== value.coinsGranted || value.verifiedCompletedCount !== value.made
    || Number(value.coinsGranted) > Number(value.coinsCalculated)
    || Number(value.todayEarned) > Number(value.dailyCap)) return fail();
  return {
    score: Number(value.score), made: Number(value.made), golden: Number(value.golden),
    failed: Number(value.failed), wasted: Number(value.wasted), maxCombo: Number(value.maxCombo),
    coinsCalculated: Number(value.coinsCalculated), coinsGranted: Number(value.coinsGranted),
    todayEarned: Number(value.todayEarned), dailyCap: Number(value.dailyCap), capReached: value.capReached,
    successfulMade: Number(value.successfulMade), served: Number(value.served),
    customersServed: Number(value.customersServed), specialServed: Number(value.specialServed),
    bonusScore: Number(value.bonusScore), grillDiscarded: Number(value.grillDiscarded),
    trayDiscarded: Number(value.trayDiscarded), undeliveredCount: Number(value.undeliveredCount),
    unfinishedGrillCount: Number(value.unfinishedGrillCount), rewardDate: value.rewardDate,
    settledAt: value.settledAt as string, finalThroughSeq: Number(value.finalThroughSeq),
    finalPrefixHash: value.finalPrefixHash, rulesVersion: version, configVersion: value.configVersion,
  };
}

function retryable(status: number, code: string) {
  return status >= 500 || status === 429 || code === 'TOO_EARLY';
}

export function createBungeoppangV4Service(requestJSON: RequestJson): BungeoppangService {
  const path = '/api/v1/minigames/sessions';
  async function request(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try { return await requestJSON(url, { ...init, signal: controller.signal }); }
    catch (error) {
      if (error instanceof BungeoppangServiceError) throw error;
      // 공통 안내는 호출 시점에 읽어 service.ts와의 순환 import 초기화 순서에 의존하지 않는다.
      if (error instanceof RestError) throw new BungeoppangServiceError(error.code,
        messages[error.code] ?? sharedMessages[error.code] ?? (error.status === 401 || error.status === 403 ? '로그인을 다시 확인해 주세요.' : error.message),
        retryable(error.status, error.code), error.status);
      throw new BungeoppangServiceError('NETWORK_ERROR', '서버 응답을 받지 못했어요. 같은 요청으로 다시 시도해 주세요.', true);
    } finally { clearTimeout(timer); }
  }
  const post = (body: unknown, key?: string): RequestInit => ({ method: 'POST', headers: {
    'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}),
  }, body: JSON.stringify(body) });
  const sessionPath = (gameId: string) => id(gameId) ? `${path}/${gameId}` : fail();
  const service: BungeoppangService = {
    mock: false,
    async getStatus() {
      const p = await request(`${path}?rulesVersion=v4`);
      if (!record(p) || p.rulesVersion !== 'v4' || !whole(p.todayEarned) || !whole(p.dailyCap)
        || !(p.activeSessionId == null || id(p.activeSessionId))
        || typeof p.isFirstGame !== 'boolean' || !Array.isArray(p.seenTips)
        || !p.seenTips.every(value => typeof value === 'string')) return fail();
      return { rulesVersion: 'v4', todayEarned: Number(p.todayEarned), dailyCap: Number(p.dailyCap),
        isFirstGame: p.isFirstGame, seenTips: [...p.seenTips] as string[], activeSessionId: p.activeSessionId as string | null | undefined };
    },
    async startGame(key) {
      if (!keyPattern.test(key)) return fail();
      const p = await request(path, post({ minigameType: 'BUNGEOPPANG', rulesVersion: 'v4' }, key));
      return loadRound(p, false);
    },
    async resumeGame(gameId) {
      const sentAt = performance.now();
      const p = await request(`${sessionPath(gameId)}?includeSource=true&includeProgress=true`);
      const receivedAt = performance.now();
      if (!record(p) || p.minigameSessionId !== gameId) return fail();
      if (!['PLAYING', 'COMPLETED'].includes(String(p.status)))
        throw new BungeoppangServiceError('GAME_NOT_ACTIVE', messages.GAME_NOT_ACTIVE!);
      if (!instant(p.serverNow)) return fail();
      return loadRound(p, true, { serverNowMs: Date.parse(p.serverNow), receivedAt, rttMs: receivedAt - sentAt });
    },
    async syncTimeV4(gameId): Promise<BungeoppangTimeSync> {
      const source = sessions.get(gameId);
      if (!source) return fail();
      // Bound resampling: a slow connection must not create another round or extend this one.
      for (let attempt = 0; attempt < 3; attempt++) {
        const sentAt = performance.now();
        const p = await request(sessionPath(gameId));
        const receivedAt = performance.now();
        if (!record(p) || p.minigameSessionId !== gameId || p.rulesVersion !== 'v4'
          || p.configVersion !== source.configVersion || !instant(p.serverNow)
          || !['PLAYING', 'COMPLETED', 'ABANDONED', 'INVALID'].includes(String(p.status))) return fail();
        const timing = toTiming(p.timing);
        if (!validTimingUpdate(source.timing,timing)) return fail();
        source.timing=timing;
        const sample = { serverNowMs: Date.parse(p.serverNow), receivedAt, rttMs: receivedAt - sentAt };
        const status = p.status as BungeoppangTimeSync['status'];
        if (status !== 'PLAYING' || sample.rttMs <= 1000) {
          const result = status === 'COMPLETED' ? completeResult(p.result, gameId) : undefined;
          if (status !== 'PLAYING') sessions.delete(gameId);
          return { timing, sample, status, ...(result ? { result } : {}) };
        }
      }
      throw new BungeoppangServiceError('TIME_SYNC_SLOW',
        '연결 지연으로 시간을 확인하지 못했어요. 같은 판의 시간을 다시 확인해 주세요.', true);
    },
    async setManualPaused(gameId,paused) {
      const current=await service.syncTimeV4!(gameId);
      if(current.status!=='PLAYING')return current;
      const source=sessions.get(gameId);
      if(!source||source.timing.pauseRevision===undefined)throw new BungeoppangServiceError('PAUSE_UNAVAILABLE','일시정지 연결을 확인해주세요.',true);
      await request(`${sessionPath(gameId)}/manual-pause`,post({paused,expectedPauseRevision:source.timing.pauseRevision}));
      return service.syncTimeV4!(gameId);
    },
    async nextOrder(input) {
      const source = sessions.get(input.gameId);
      if (!source) return fail();
      const frozenLocalCount = input.log.length;
      const { actions, hash } = await wirePrefix(source, input);
      const body = { rulesVersion: 'v4', throughSeq: actions.length, prefixHash: hash, log: actions };
      const p = await request(`${sessionPath(input.gameId)}/deliveries`, post(body, input.deliveryKey));
      if (!record(p) || p.minigameSessionId !== input.gameId || p.deliveryKey !== input.deliveryKey
        || p.accepted !== true || p.throughSeq !== actions.length || p.prefixHash !== hash
        || !Array.isArray(p.consumedBreadIds) || !p.consumedBreadIds.every(value => whole(value))
        || !Number.isSafeInteger(p.scoreDelta) || !Number.isSafeInteger(p.bonusDelta)) return fail();
      const checkpoint = toCheckpoint(p.checkpoint), order = toOrder(p.nextOrder);
      if (checkpoint.throughSeq !== actions.length || checkpoint.prefixHash !== hash
        || checkpoint.currentOrder?.orderId !== order.orderId) return fail();
      source.accepted = actions; source.acceptedLocalCount = frozenLocalCount; source.checkpoint = checkpoint;
      if (!source.orders.some(value => value.orderId === order.orderId)) source.orders.push(order);
      return { index: order.orderIndex, order, checkpoint };
    },
    async recoverV4(gameId) {
      const source = sessions.get(gameId);
      if (!source) return fail();
      const p = await request(`${sessionPath(gameId)}?includeProgress=true`);
      if (!record(p) || p.minigameSessionId !== gameId || p.rulesVersion !== 'v4' || p.status !== 'PLAYING'
        || !Array.isArray(p.acceptedLog) || !Array.isArray(p.issuedOrders)) return fail();
      return restoreProgress(gameId, source, p);
    },
    async submitResult(input) {
      const source = sessions.get(input.gameId);
      if (!source || !input.completeKey || !keyPattern.test(input.completeKey)) return fail();
      const { actions, hash } = await wireCompletion(source, input);
      const body = { rulesVersion: 'v4', throughSeq: actions.length, prefixHash: hash, log: actions,
        seenTips: input.seenTips, clientScore: input.clientScore };
      try {
        const result = completeResult(await request(`${sessionPath(input.gameId)}/complete`,
          post(body, input.completeKey)), input.gameId);
        sessions.delete(input.gameId);
        return result;
      } catch (error) {
        if (!(error instanceof BungeoppangServiceError) || !error.retryable) throw error;
        try {
          const loaded = await request(`${sessionPath(input.gameId)}?includeProgress=true`);
          if (record(loaded) && loaded.status === 'COMPLETED') {
            const result = completeResult(loaded.result, input.gameId);
            sessions.delete(input.gameId);
            return result;
          }
        } catch { /* Preserve the original ambiguous completion failure for an identical retry. */ }
        throw error;
      }
    },
    async abandon(gameId) {
      const p = await request(`${sessionPath(gameId)}/abandon`, post({}));
      if (!record(p) || p.minigameSessionId !== gameId || p.status !== 'ABANDONED' || p.rewardAmount !== 0) return fail();
      sessions.delete(gameId);
    },
    async balance() {
      const p = await request('/api/v1/wallets/me', { cache: 'no-store' });
      if (!record(p) || !whole(p.balance) || !whole(p.reservedBalance) || !whole(p.availableBalance)
        || Number(p.balance) - Number(p.reservedBalance) !== Number(p.availableBalance)) return fail();
      return Number(p.balance);
    },
  };
  async function restoreProgress(gameId: string, source: SessionSource, p: Record<string, unknown>) {
    if (!Array.isArray(p.acceptedLog) || !Array.isArray(p.issuedOrders)) return fail();
    const checkpoint = toCheckpoint(p.checkpoint), accepted = p.acceptedLog as WireAction[];
    if (accepted.length !== checkpoint.throughSeq || !accepted.every((entry, index) => record(entry)
      && entry.seq === index + 1 && typeof entry.action === 'string' && whole(entry.t))) return fail();
    const orders = p.issuedOrders.map(toOrder);
    if (await prefixHash(gameId, source.configVersion, accepted) !== checkpoint.prefixHash) return fail();
    source.accepted = accepted.map(entry => ({ ...entry })); source.orders = orders;
    source.checkpoint = checkpoint; source.acceptedLocalCount = accepted.length;
    return { grill: grillFromCheckpoint(source), checkpoint };
  }
  async function loadRound(p: unknown, restoring: boolean, sample?: ServerTimeSample): Promise<BungeoppangGame> {
    if (!record(p) || !id(p.minigameSessionId) || (!restoring && p.minigameType !== 'BUNGEOPPANG')
      || !['PLAYING', ...(restoring ? ['COMPLETED'] : [])].includes(String(p.status))
      || p.rulesVersion !== 'v4' || typeof p.configVersion !== 'string' || !instant(p.startedAt)
      || !record(p.timing) || !Array.isArray(p.heats) || typeof p.isFirstGame !== 'boolean') return fail();
    const timing = toTiming(p.timing), rules = toRules(p.rules);
    if (p.heats.length !== rules.heatListLength || !p.heats.every(value => whole(value)
      && Number(value) >= rules.heatMin && Number(value) <= rules.heatMax)) return fail();
    const checkpoint = toCheckpoint(p.checkpoint);
    const order = checkpoint.currentOrder ?? (restoring && Array.isArray(p.issuedOrders) && p.issuedOrders.length
      ? toOrder(p.issuedOrders[0]) : null);
    if (!order) return fail();
    const source: SessionSource = { configVersion: p.configVersion, rules, heats: [...p.heats] as number[],
      checkpoint, accepted: [], orders: [order], acceptedLocalCount: 0, timing };
    if (restoring && (!sample || (p.status === 'PLAYING' && sample.rttMs > 1000)))
      throw new BungeoppangServiceError('TIME_SYNC_SLOW', '연결 지연으로 시간을 확인하지 못했어요. 같은 판의 시간을 다시 확인해 주세요.', true);
    // Restore one coherent source/progress/time snapshot; a start receipt still needs a fresh GET.
    const recovered = restoring ? await restoreProgress(p.minigameSessionId, source, p) : null;
    const result = restoring && p.status === 'COMPLETED' ? completeResult(p.result, p.minigameSessionId) : undefined;
    sessions.set(p.minigameSessionId, source);
    const timeSync: BungeoppangTimeSync = restoring
      ? { timing, sample: sample!, status: p.status as 'PLAYING' | 'COMPLETED', ...(result ? { result } : {}) }
      : await service.syncTimeV4!(p.minigameSessionId);
    return { gameId: p.minigameSessionId, startedAt: p.startedAt, rulesVersion: 'v4', heats: [...source.heats],
      isFirstGame: p.isFirstGame, v4: { configVersion: source.configVersion, order, rules,
        timing: timeSync.timing, timeSync, checkpoint: recovered?.checkpoint ?? checkpoint,
        ...(recovered ? { grill: recovered.grill } : {}) } };
  }
  return service;
}

/** Test-only reset for the module-owned request/recovery metadata. */
export function resetBungeoppangV4Sessions() { sessions.clear(); }
