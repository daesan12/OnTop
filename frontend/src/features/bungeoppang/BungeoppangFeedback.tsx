import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { BREAD_NAMES, type BreadTool } from './rulesV4';
import { INGREDIENT_LOOK, type BungFeedback } from './presentation';
import { isV4Grill, useBungeoppang } from './store';
import { isV5Grill } from './rulesV5';

export const ingredientStyle = (tool: BreadTool): CSSProperties => ({
  '--ingredient': INGREDIENT_LOOK[tool].color, '--ingredient-ink': INGREDIENT_LOOK[tool].ink,
} as CSSProperties);

/** Small reusable vector token; the crust keeps its cooking color and the filling has its own marker. */
export const BreadToken = memo(function BreadToken({ tool, burnt = false }: { tool: BreadTool; burnt?: boolean }) {
  return <svg className="bung-bread-token" viewBox="0 0 96 54" aria-hidden="true">
    <path d="M14 27 3 12 6 27 3 42 20 35C30 54 68 52 88 33Q99 27 88 21C68 2 30 0 20 19Z" fill={burnt ? '#45382e' : '#e5af55'} stroke={burnt ? '#30251f' : '#9a642a'} strokeWidth="2" />
    <path d="m35 15 20 26m-10-29 20 25m-32 3 29-25m-17 28 27-23" stroke={burnt ? '#241d17' : '#c2893b'} strokeWidth="1.5" />
    <circle cx="77" cy="23" r="2.5" fill="#422b1d" />
    <circle cx="38" cy="27" r="9" fill={INGREDIENT_LOOK[tool].color} stroke="#fff9e9" strokeWidth="2" />
  </svg>;
});

function CustomerFigure({ index, carrying = false }: { index: number; carrying?: boolean }) {
  const shirts = ['#638b82', '#bf7660', '#7872a0', '#ba9349'];
  return <svg className="bung-customer-figure" viewBox="0 0 70 96" aria-hidden="true" style={{ '--shirt': shirts[index % shirts.length] } as CSSProperties}>
    <g className="bung-customer-leg bung-customer-leg-left"><path d="m29 65-3 22-8 4h14l5-26" fill="#424c50" /></g>
    <g className="bung-customer-leg bung-customer-leg-right"><path d="m38 65 6 22 8 4H38l-6-26" fill="#58646a" /></g>
    <path d="M21 38Q35 31 48 38L54 66H16Z" fill="var(--shirt)" />
    <path d="m22 42-8 19m33-18 8 15" stroke="#e2b791" strokeWidth="8" strokeLinecap="round" />
    <ellipse cx="35" cy="23" rx="15" ry="17" fill="#e9c5a2" />
    <path d="M20 22Q15 1 35 3q22 0 15 23l-4-14-11 5-11-3Z" fill="#514035" />
    <path d="M29 24h1m10 0h1" stroke="#47382c" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M31 31q4 3 8-1" fill="none" stroke="#9b6050" strokeWidth="1.5" strokeLinecap="round" />
    {carrying && <g><path d="M47 54h19l-2 26H49Z" fill="#dbb981" stroke="#92734a" /><path d="M52 55v-5q5-7 10 0v5" fill="none" stroke="#92734a" strokeWidth="2" /></g>}
  </svg>;
}

export function CustomerScene({ index, hasOrder, ready, pending }: { index: number; hasOrder: boolean; ready: boolean; pending: boolean }) {
  const departed = useBungeoppang(s => s.feedback.find(item => item.kind === 'deliver' && item.guestIndex === index - 1));
  return <div className="bung-customer-scene" data-state={hasOrder ? ready ? 'ready' : 'waiting' : 'pending'}>
    <div className="bung-customer-path" aria-hidden="true"><i /><i /><i /><i /></div>
    {departed && <div className="bung-customer-depart" key={`depart-${departed.id}`}><CustomerFigure index={index - 1} carrying /><span>고마워요!</span></div>}
    {hasOrder ? <div className="bung-customer-arrive" key={index}>
      <CustomerFigure index={index} /><span>{ready ? '다 됐네요! 전달해 주세요' : '안녕하세요, 부탁해요!'}</span>
    </div> : <p role="status">{pending ? '다음 손님이 오고 있어요…' : '다음 손님을 기다려요'}</p>}
  </div>;
}

export function ToolFeedback() {
  const tool = useBungeoppang(s => s.tool), revision = useBungeoppang(s => s.toolRevision);
  return <div className="bung-held-tool" style={ingredientStyle(tool)}>
    <div key={revision} className="bung-tool-change" role="status" aria-live="polite" aria-atomic="true" data-tool={tool}>
      <svg viewBox="0 0 56 40" aria-hidden="true"><path d="m7 4 25 21" stroke="#ba9466" strokeWidth="7" strokeLinecap="round" /><ellipse cx="36" cy="27" rx="15" ry="9" fill="#d8c4a2" /><ellipse cx="36" cy="26" rx="11" ry="6" fill="var(--ingredient)" /></svg>
      <span><b>{BREAD_NAMES[tool]} {revision ? '들었어요' : '선택 중'}</b><small>{INGREDIENT_LOOK[tool].description}</small></span>
    </div>
  </div>;
}

export function TrashBin() {
  const total = useBungeoppang(s => s.grill ? s.grill.wasted + s.grill.failed : 0);
  const latest = useBungeoppang(s => s.feedback.filter(item => item.kind === 'discard').at(-1));
  return <div className="bung-trash" data-hit={!!latest} aria-label="폐기함" data-count={total}>
    <svg key={latest?.id ?? 'rest'} className="bung-trash-icon" viewBox="0 0 60 66" aria-hidden="true">
      <g className="bung-trash-lid"><path d="M10 17h40M22 16V9h16v7" fill="none" stroke="#866954" strokeWidth="5" strokeLinecap="round" /></g>
      <path d="m14 23 4 34q12 7 24 0l4-34Z" fill="#ddd2bf" stroke="#866954" strokeWidth="2" />
      <path d="m25 29 1 23m9-23-1 23" stroke="#ad9a81" strokeWidth="3" strokeLinecap="round" />
    </svg>
    <span><b>폐기함 · {total}개</b><small>철판 우클릭 / Shift+칸 키</small><small>쟁반은 버리기 버튼</small></span>
  </div>;
}

function Flight({ item }: { item: BungFeedback }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const selector = item.kind === 'store' ? `[data-tray-bread-id="${item.breadId}"]`
      : item.kind === 'discard' ? '.bung-trash-icon' : '.bung-customer-scene';
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    const target = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : item.from;
    const element = ref.current!;
    element.style.setProperty('--flight-dx', `${target.x - item.from.x}px`);
    element.style.setProperty('--flight-dy', `${target.y - item.from.y}px`);
  }, [item]);
  return <div ref={ref} className="bung-flight" data-kind={item.kind} style={{ left: item.from.x, top: item.from.y, ...ingredientStyle(item.filling) }} aria-hidden="true">
    <BreadToken tool={item.filling} burnt={item.burnt} /><span>{BREAD_NAMES[item.filling]}</span>
  </div>;
}

export function FeedbackFlights() {
  const feedback = useBungeoppang(s => s.feedback);
  const active = useBungeoppang(s => s.phase === 'play' && isV4Grill(s.grill) && !isV5Grill(s.grill));
  const latest = feedback.at(-1);
  if (!active) return null;
  return <>
    {feedback.map(item => <Flight key={item.id} item={item} />)}
    {latest && <div className="bung-action-receipt" key={latest.id} data-kind={latest.kind} role="status" aria-live="polite">{latest.message}</div>}
  </>;
}
