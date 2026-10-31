import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/features/bungeoppang/access', () => ({ canOpenBungeoppang: () => true }));
vi.mock('../../src/features/bungeoppang/service', async original => ({
  ...await original<typeof import('../../src/features/bungeoppang/service')>(),
  bungeoppangService: { mock: true, getStatus: vi.fn(), startGame: vi.fn(), submitResult: vi.fn(), abandon: vi.fn(),
    balance: vi.fn(), deliverV5: vi.fn(), recoverV5: vi.fn() },
}));
import { bungeoppangService as service, BungeoppangServiceError } from '../../src/features/bungeoppang/service';
import { BUNGEOPPANG_V5 as R, BUNGEOPPANG_V5_LEGACY } from '../../src/features/bungeoppang/config';
import { createGrill, replay, type GrillState } from '../../src/features/bungeoppang/rulesV5';
import type { BreadFilling, GrillLogEntry } from '../../src/features/bungeoppang/rulesV4';
import { advanceBungeoppangTime, deliverBungeoppangOrder, deliverMatchingBungeoppangOrder, leaveBungeoppang, openBungeoppang, pressBungeoppangSlot,
  resetBungeoppang, selectBungeoppangCustomer, selectBungeoppangTray, startBungeoppang, trashBungeoppangSelection,
  useBungeoppang } from '../../src/features/bungeoppang/store';
import { bungeoppangClock, gameNow } from '../../src/features/bungeoppang/bungeoppangView';
import fixture from '../fixtures/bungeoppang-v5.json';
import { beginCustomerSpeechV5, advanceCustomerSpeechV5, useCustomerSpeechV5 } from '../../src/features/bungeoppang/customerSpeechV5';
import { useCustomerDeparturesV5 } from '../../src/features/bungeoppang/customerDepartureV5';
import { useCustomerArrivalsV5 } from '../../src/features/bungeoppang/customerArrivalV5';
import {openManual,closeManual,finishManualOpening,finishManualClosing} from '../../src/features/manual/manualState';
const heats = Array(2048).fill(100);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  const windowEvents = new EventTarget();
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => windowEvents.dispatchEvent(e), setTimeout,
    addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    innerWidth: 1280, innerHeight: 720 });
  vi.stubGlobal('document', { hidden: false, activeElement: null, pointerLockElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.mocked(service.getStatus).mockResolvedValue({ rulesVersion: 'v5', todayEarned: 0, dailyCap: 100, isFirstGame: true, seenTips: [] });
  vi.mocked(service.startGame).mockResolvedValue({ gameId: 'preview-1', startedAt: new Date(0).toISOString(), rulesVersion: 'v5',
    heats, isFirstGame: true, v5: { rules: { ...R }, orders: fixture.orders } });
  vi.mocked(service.submitResult).mockResolvedValue({ score: 0, made: 0, golden: 0, failed: 0, wasted: 0,
    maxCombo: 0, coinsCalculated: 0, coinsGranted: 0, todayEarned: 0, dailyCap: 100, capReached: false });
});
afterEach(() => { resetBungeoppang(); delete service.setManualPaused; vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function start() {
  openBungeoppang(); await vi.advanceTimersByTimeAsync(800); await startBungeoppang();
  await vi.advanceTimersByTimeAsync(3500);
  expect(useBungeoppang.getState().phase).toBe('play');
  // Simulate ready 3D actors; admission still follows the real round clock below.
  for (const order of fixture.orders) { beginCustomerSpeechV5(order.orderId); advanceCustomerSpeechV5(order.orderId, 'summary'); }
}
const current = () => useBungeoppang.getState().grill as GrillState;
const stock = (...fillings: BreadFilling[]) => fillings.map((filling, index) =>
  ({ id: index + 1, filling, front: 80, back: 80, points: 10 }));
it('F1 freezes cooking and countdown time, then resumes without burning or consuming the remaining round',async()=>{
  await start();await vi.advanceTimersByTimeAsync(2000);
  const before=gameNow();
  openManual('fish-bread');finishManualOpening();await vi.advanceTimersByTimeAsync(0);
  expect(useBungeoppang.getState().manualPaused).toBe(true);
  await vi.advanceTimersByTimeAsync(180000);
  expect(gameNow()).toBe(before);expect(bungeoppangClock.t).toBe(before);
  expect(useBungeoppang.getState().phase).toBe('play');expect(service.submitResult).not.toHaveBeenCalled();
  closeManual();finishManualClosing();await vi.advanceTimersByTimeAsync(0);
  expect(useBungeoppang.getState().manualPaused).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(gameNow()).toBe(before+1000);
});
it('F1 recovers a completed server round instead of trapping the player in a paused error',async()=>{
  await start();
  const result=await service.submitResult({gameId:'preview-1',log:[],seenTips:[],clientScore:0,completeKey:'completed'});
  const at=new Date(0).toISOString();
  service.setManualPaused=vi.fn(async()=>({status:'COMPLETED' as const,result,
    timing:{countdownStartsAt:at,playStartsAt:at,playEndsAt:at,submitDeadline:at,expiresAt:at},
    sample:{receivedAt:performance.now(),serverNowMs:0,rttMs:0}}));
  openManual('fish-bread');finishManualOpening();await vi.advanceTimersByTimeAsync(0);
  expect(useBungeoppang.getState()).toMatchObject({phase:'result',result,manualPaused:false,manualPauseError:null,manualPausePending:false});
  expect(bungeoppangClock.pausedAt).toBeNull();
});
it('an unconfirmed pause stays frozen and cannot burn bread while the player retries',async()=>{
  await start();const before=gameNow();
  service.setManualPaused=vi.fn().mockRejectedValue(new Error('연결 확인 필요'));
  openManual('fish-bread');finishManualOpening();await vi.advanceTimersByTimeAsync(0);
  expect(useBungeoppang.getState().manualPauseError).toBe('연결 확인 필요');
  await vi.advanceTimersByTimeAsync(180000);pressBungeoppangSlot(0);
  expect(gameNow()).toBe(before);expect(current().log).toEqual([]);
  expect(useBungeoppang.getState().phase).toBe('play');
});
it('R finds an unselected fulfillable order, keeps extra bread and blocks repeat delivery while pending', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14000);
  const grill: GrillState = { ...current(), activeOrders: [...current().activeOrders].reverse(),
    tray: stock('bean', 'custard', 'chocolate') };
  useBungeoppang.setState({ grill, selectedCustomer: '1' });
  vi.mocked(service.deliverV5!).mockReturnValue(new Promise(() => {}));
  deliverMatchingBungeoppangOrder(); deliverMatchingBungeoppangOrder();
  expect(current().log.at(-1)).toMatchObject({ action: 'DELIVER', orderId: '2' });
  expect(current().tray.map(b => b.filling)).toEqual(['custard', 'chocolate']);
  expect(service.deliverV5).toHaveBeenCalledTimes(1);
  expect(useBungeoppang.getState().orderPending).toBe(true);
  expect(vi.mocked(service.deliverV5!).mock.calls[0]![0].log.at(-1)).toMatchObject({ orderId: '2' });
});
it('R prioritizes a ready selected customer and sends just one order per press', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14000);
  useBungeoppang.setState({ grill: { ...current(), tray: stock('bean', 'bean', 'custard') }, selectedCustomer: '3' });
  vi.mocked(service.deliverV5!).mockImplementation(async () => ({ grill: current(), revision: 1 }));
  deliverMatchingBungeoppangOrder(); await vi.advanceTimersByTimeAsync(0);
  expect(current().log.at(-1)).toMatchObject({ action: 'DELIVER', orderId: '3' });
  expect(current().tray.map(b => b.filling)).toEqual(['bean', 'bean']);
  expect(service.deliverV5).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(50); deliverMatchingBungeoppangOrder();
  expect(current().log.at(-1)).toMatchObject({ action: 'DELIVER', orderId: '1' });
  expect(service.deliverV5).toHaveBeenCalledTimes(2);
});
it('R does not send a partial or wrong-filling order', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14000);
  const grill: GrillState = { ...current(), activeOrders: [fixture.orders[0]!, fixture.orders[2]!],
    tray: stock('bean', 'chocolate') };
  useBungeoppang.setState({ grill, selectedCustomer: '1' });
  deliverMatchingBungeoppangOrder();
  expect(current().log).toEqual([]); expect(current().tray).toHaveLength(2);
  expect(service.deliverV5).not.toHaveBeenCalled();
});
it('R matches every filling in a mixed order and consumes only the requested quantities', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14000);
  const order = { ...fixture.orders[1]!, items: { bean: 1, custard: 1, pizza: 0, chocolate: 0 } };
  const grill: GrillState = { ...current(), activeOrders: [order], tray: stock('bean', 'bean', 'custard', 'chocolate') };
  useBungeoppang.setState({ grill, selectedCustomer: null });
  vi.mocked(service.deliverV5!).mockReturnValue(new Promise(() => {}));
  deliverMatchingBungeoppangOrder();
  expect(current().log.at(-1)).toMatchObject({ action: 'DELIVER', orderId: '2' });
  expect(current().tray.map(b => b.filling)).toEqual(['bean', 'chocolate']);
});
it('R skips hidden or greeting customers, then delivers when their request is announced', async () => {
  await start();
  useBungeoppang.setState({ grill: { ...current(), tray: stock('custard') }, selectedCustomer: '1' });
  deliverMatchingBungeoppangOrder(); expect(service.deliverV5).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(14000);
  useCustomerSpeechV5.setState(s => ({ stages: { ...s.stages, '3': 'greeting' } }));
  deliverMatchingBungeoppangOrder(); expect(service.deliverV5).not.toHaveBeenCalled();
  advanceCustomerSpeechV5('3', 'request');
  vi.mocked(service.deliverV5!).mockReturnValue(new Promise(() => {}));
  deliverMatchingBungeoppangOrder();
  expect(current().log.at(-1)).toMatchObject({ action: 'DELIVER', orderId: '3' });
});
it('R preserves failed-delivery retry state and ignores input while an exit dialog is open', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14000);
  useBungeoppang.setState({ grill: { ...current(), tray: stock('custard') }, selectedCustomer: '1', orderError: '응답 유실' });
  deliverMatchingBungeoppangOrder();
  expect(useBungeoppang.getState().orderError).toBe('응답 유실');
  useBungeoppang.setState({ orderError: null, confirmExit: true }); deliverMatchingBungeoppangOrder();
  expect(current().log).toEqual([]); expect(service.deliverV5).not.toHaveBeenCalled();
});
it('cannot select or deliver an approved order before that customer enters', async () => {
  await start();
  const grill = createGrill(heats, fixture.orders, R), wanted = fixture.orders[1]!;
  grill.tray = Array.from({ length: wanted.items.bean }, (_, i) => ({ id: i + 1, filling: 'bean' as const, front: 80, back: 80, points: 10 }));
  useBungeoppang.setState({ grill, selectedCustomer: wanted.orderId });
  expect(selectBungeoppangCustomer(wanted.orderId)).toBe(false);
  deliverBungeoppangOrder();
  expect(current().log).toEqual([]); expect(service.deliverV5).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  expect(Object.keys(useCustomerArrivalsV5.getState().admitted)).toEqual(['1']);
  expect(selectBungeoppangCustomer(wanted.orderId)).toBe(false);
  await vi.advanceTimersByTimeAsync(6000);
  expect(selectBungeoppangCustomer(wanted.orderId)).toBe(true);
  resetBungeoppang();
  expect(useCustomerArrivalsV5.getState().admitted).toEqual({});
  useCustomerSpeechV5.setState({ stages: {}, dialogues: {} });
});
it('does not end at the old 60 second cutoff and closes at 120 seconds', async () => {
  await start(); await vi.advanceTimersByTimeAsync(60000);
  expect(gameNow()).toBe(60000); expect(useBungeoppang.getState().phase).toBe('play');
  expect(service.submitResult).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(59999);
  expect(useBungeoppang.getState().phase).toBe('play');
  expect(service.submitResult).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); advanceBungeoppangTime();
  expect(bungeoppangClock.t).toBe(120000); expect(useBungeoppang.getState().phase).toBe('ending');
  expect(service.submitResult).toHaveBeenCalledTimes(1);
});
it('keeps a server-issued three-minute round playing after two minutes', async () => {
  vi.mocked(service.startGame).mockResolvedValueOnce({ gameId: 'legacy-1', startedAt: new Date(0).toISOString(), rulesVersion: 'v5',
    heats, isFirstGame: true, v5: { rules: { ...BUNGEOPPANG_V5_LEGACY }, orders: fixture.orders } });
  await start(); await vi.advanceTimersByTimeAsync(120000);
  expect(useBungeoppang.getState().phase).toBe('play');
  expect(bungeoppangClock.durationMs).toBe(180000);
  expect(service.submitResult).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000); advanceBungeoppangTime();
  expect(useBungeoppang.getState().phase).toBe('ending');
  expect(service.submitResult).toHaveBeenCalledTimes(1);
});
it('a normal key on burned filled bread emits one DISCARD, never a TURN or a tray insertion', async () => {
  await start(); pressBungeoppangSlot(0); await vi.advanceTimersByTimeAsync(300);
  useBungeoppang.setState({ tool: 'bean' }); pressBungeoppangSlot(0);
  await vi.advanceTimersByTimeAsync(8000); pressBungeoppangSlot(0);
  expect(current().log.map(e => e.action)).toEqual(['POUR', 'FILL', 'DISCARD']);
  expect(current()).toMatchObject({ tray: [], made: 0, failed: 1, wasted: 1 });
});
it('keeps a frozen delivery prefix, allows suffix cooking, and shows success only after approval', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14850);
  const before = replay(fixture.log.slice(0, 4) as GrillLogEntry[], heats, fixture.orders, R);
  useBungeoppang.setState({ grill: before, selectedCustomer: '2', feedback: [] });
  let approve!: (value: { grill: GrillState; revision: number }) => void;
  vi.mocked(service.deliverV5!).mockReturnValue(new Promise(resolve => { approve = resolve; }));
  deliverBungeoppangOrder();
  expect(useBungeoppang.getState().orderPending).toBe(true);
  expect(useBungeoppang.getState().feedback.some(f => f.kind === 'deliver')).toBe(false);
  expect(useCustomerDeparturesV5.getState().visits['2']?.phase).toBe('pending');
  expect(service.deliverV5).toHaveBeenCalledTimes(1);
  const submitted = vi.mocked(service.deliverV5!).mock.calls[0]![0];
  selectBungeoppangCustomer('3');
  await vi.advanceTimersByTimeAsync(50); pressBungeoppangSlot(1);
  const accepted = replay(submitted.log as GrillLogEntry[], heats, fixture.orders, R);
  accepted.activeOrders.push({ ...fixture.orders[1]!, orderId: '4', availableAfterSeq: 5 });
  approve({ grill: accepted, revision: 1 }); await vi.advanceTimersByTimeAsync(0);
  expect(current().slots[1]!.phase).toBe('batter'); expect(current().log).toHaveLength(6);
  expect(submitted.log).toHaveLength(5);
  expect(useBungeoppang.getState()).toMatchObject({ selectedCustomer: '3', orderPending: false });
  expect(useBungeoppang.getState().feedback.find(f => f.kind === 'deliver')?.guestIndex).toBe(1);
  expect(useBungeoppang.getState().feedback.find(f => f.kind === 'deliver')?.guestOrderId).toBe('2');
  expect(useCustomerDeparturesV5.getState().visits['2']?.phase).toBe('receiving');
  await vi.advanceTimersByTimeAsync(550);
  expect(useCustomerDeparturesV5.getState().visits['2']?.phase).toBe('thanks');
});
it('a late server recovery cannot change a departed visit', async () => {
  await start(); await vi.advanceTimersByTimeAsync(14850);
  useBungeoppang.setState({ grill: replay(fixture.log.slice(0, 4) as GrillLogEntry[], heats, fixture.orders, R), selectedCustomer: '2' });
  let recover!: (value: { grill: GrillState; revision: number }) => void;
  vi.mocked(service.deliverV5!).mockRejectedValue(new BungeoppangServiceError('PREFIX_MISMATCH', 'conflict'));
  vi.mocked(service.recoverV5!).mockReturnValue(new Promise(resolve => { recover = resolve; }));
  deliverBungeoppangOrder(); await vi.advanceTimersByTimeAsync(0);
  leaveBungeoppang(); recover({ grill: createGrill(heats, fixture.orders, R), revision: 0 });
  await vi.advanceTimersByTimeAsync(0);
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'idle', grill: null, orderError: null });
});
it('selecting a bread by ID stays correct after another tray position disappears', async () => {
  await start();
  const s = createGrill(heats, fixture.orders, R);
  s.tray = [1, 2].map(id => ({ id, filling: 'bean', front: 80, back: 80, points: 10 })); s.made = 2;
  useBungeoppang.setState({ grill: s }); selectBungeoppangTray(2);
  useBungeoppang.setState({ grill: { ...s, tray: s.tray.slice(1) } }); trashBungeoppangSelection();
  expect(current().tray).toEqual([]); expect(current().log[0]).toMatchObject({ action: 'TRAY_DISCARD', breadId: 2 });
});
