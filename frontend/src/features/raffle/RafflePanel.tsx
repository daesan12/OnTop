import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { closeConstructionNotice } from '../construction/model'
import { BOARD_COLS, BOARD_ROWS, drawBlock, formatKst, schedule, ticketCells, type DrawBlock } from './protocol'
import { drawRaffleTicket, refreshRaffle, useRaffle } from './store'
import './raffle.css'

const PRIZES = [
  { rank: 1, image: '/art/raffle/prize-1.webp', brand: 'BBQ', item: '황금올리브치킨', alt: 'BBQ 황금올리브치킨' },
  { rank: 2, image: '/art/raffle/prize-2.webp', brand: '맘스터치', item: '싸이버거 세트 x2명', alt: '맘스터치 싸이버거 세트 2명' },
  { rank: 3, image: '/art/raffle/prize-3.webp', brand: '메가커피', item: '아이스 아메리카노 x5명', alt: '메가커피 아이스 아메리카노 5명' },
]
const HINTS: Record<Exclude<DrawBlock, null>, string> = {
  scheduled: '아직 판매 전이에요. 매주 월요일 오전 9시에 판매가 시작돼요.',
  closed: '이번 주 판매가 끝났어요. 월요일 오전 9시에 새 회차가 열려요.',
  limit: '이번 주 뽑기권을 모두 뽑았어요. 월요일 오전 9시 발표를 기다려 주세요!',
  balance: '사용 가능한 엽전이 부족해요.',
}
const LABELS: Record<Exclude<DrawBlock, null>, string> = {
  scheduled: '판매 시작 전', closed: '이번 주 판매 마감', limit: '이번 주 뽑기 완료', balance: '엽전이 부족해요',
}
/** 결과를 기다리는 동안 손이 머무는 판 위 지점(%). */
const HOVER = { x: 78, y: 76 }

type Phase = 'idle' | 'reach' | 'pick' | 'lift' | 'reveal'
const moving = (phase: Phase) => phase === 'reach' || phase === 'pick' || phase === 'lift'
const center = (cell: number) => ({ x: (cell % BOARD_COLS + .5) / BOARD_COLS * 100, y: (Math.floor(cell / BOARD_COLS) + .5) / BOARD_ROWS * 100 })

function Crown({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 64 44" aria-hidden="true">
    <path d="M6 14 20 26 32 6 44 26 58 14 52 40H12Z" fill="#ffc928" stroke="#7a4a00" strokeWidth="3.5" strokeLinejoin="round"/>
    <circle cx="6" cy="13" r="4.5" fill="#ffc928" stroke="#7a4a00" strokeWidth="3"/>
    <circle cx="32" cy="6" r="4.5" fill="#ffc928" stroke="#7a4a00" strokeWidth="3"/>
    <circle cx="58" cy="13" r="4.5" fill="#ffc928" stroke="#7a4a00" strokeWidth="3"/>
  </svg>
}

/** 주간 응모권 구매 화면. 손으로 칸을 뽑는 연출은 서버가 배정한 번호를 받은 뒤에만 그 번호의 칸으로 간다. */
export function RafflePanel() {
  const { busy, error, retry, data } = useRaffle()
  const dialog = useRef<HTMLDialogElement>(null), confirm = useRef<HTMLButtonElement>(null), board = useRef<HTMLDivElement>(null)
  const drawButton = useRef<HTMLButtonElement>(null)
  const timers = useRef<number[]>([]), mounted = useRef(true), known = useRef(new Set<number>())
  const [phase, setPhase] = useState<Phase>('idle')
  const [drawn, setDrawn] = useState<{ number: number; cell: number } | null>(null)
  useEffect(() => {
    mounted.current = true
    const el = dialog.current
    el?.showModal(); el?.querySelector<HTMLButtonElement>('.raffle-close')?.focus()
    void refreshRaffle()
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); el?.close() }
  }, [])
  useEffect(() => { if (phase === 'reveal') confirm.current?.focus() }, [phase])
  const later = (ms: number, task: () => void) => { timers.current.push(window.setTimeout(task, ms)) }
  const closeReveal = () => { setPhase('idle'); requestAnimationFrame(() => drawButton.current?.focus()) }

  // 새로 뽑은 번호는 손이 칸을 들어 올릴 때 판에서, 종이가 펼쳐질 때 목록에서 드러낸다.
  const tickets = data?.tickets ?? []
  const cells = ticketCells(tickets.map(t => t.ticketNumber))
  const fresh = (ticketId: number) => moving(phase) && !known.current.has(ticketId)
  const empty = new Set(cells.filter((_, i) => !(fresh(tickets[i]!.ticketId) && phase !== 'lift')))
  const shown = tickets.filter(t => !fresh(t.ticketId))
  const block = data ? drawBlock(data) : null
  const times = data && schedule(data)

  async function draw() {
    if (!data || busy || phase !== 'idle' || (block && !retry)) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, started = performance.now()
    known.current = new Set(tickets.map(t => t.ticketId))
    setDrawn(null)
    board.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    if (!reduce) setPhase('reach')
    const receipt = await drawRaffleTicket()
    if (!mounted.current) return
    if (!receipt) { setPhase('idle'); return }
    const numbers = (useRaffle.getState().data?.tickets ?? []).map(t => t.ticketNumber)
    if (!numbers.includes(receipt.ticketNumber)) numbers.push(receipt.ticketNumber)
    setDrawn({ number: receipt.ticketNumber, cell: ticketCells(numbers)[numbers.indexOf(receipt.ticketNumber)]! })
    if (reduce) { setPhase('reveal'); return }
    later(Math.max(0, 650 - (performance.now() - started)), () => {
      setPhase('pick')
      later(800, () => { setPhase('lift'); later(600, () => setPhase('reveal')) })
    })
  }

  const target = phase === 'reach' || !drawn ? HOVER : center(drawn.cell)
  const label = busy === 'purchase' || moving(phase) ? '뽑는 중…' : retry ? '뽑기 결과 다시 확인'
    : !data ? '응모 정보 확인 중' : block ? LABELS[block] : `뽑기권 뽑기 · ${data.ticketPrice}냥`
  const hint = retry ? '뽑기 결과를 받지 못했어요. 엽전이 두 번 차감되지 않도록 같은 뽑기로 다시 확인해 주세요.'
    : block ? HINTS[block] : '버튼을 누르면 손이 판에서 한 칸을 뽑아 이번 주 응모 번호를 알려줘요.'

  return <dialog ref={dialog} className="raffle" aria-label="복권방 행운의 뽑기"
    onCancel={e => { e.preventDefault(); if (phase === 'reveal') closeReveal(); else closeConstructionNotice() }}
    onClose={closeConstructionNotice}
    onKeyDown={e => {
      e.stopPropagation()
      if (e.key !== 'Tab') return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>(phase === 'reveal'
        ? '.raffle-reveal button' : 'button:not(:disabled)') ?? [])
      const first = buttons[0], last = buttons.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }}>
    <button className="raffle-close" aria-label="복권방 닫기" onClick={closeConstructionNotice}>×</button>
    <header className="raffle-head">
      <h2 className="raffle-title"><Crown className="raffle-title-crown"/><span>행운의</span> <span>뽑기</span></h2>
      <ul className="raffle-prizes" aria-label="이번 주 경품">
        {PRIZES.map(p => <li key={p.rank} data-rank={p.rank}>
          <span className="raffle-rank"><Crown/>{p.rank}등</span>
          <img src={p.image} alt={p.alt} draggable={false}/>
          <p><b>{p.brand}</b><span>{p.item}</span></p>
        </li>)}
      </ul>
    </header>

    <div ref={board} className="raffle-board" role="img" aria-label={`별 타일 판. 이번 주 내가 뽑은 칸 ${empty.size}개`}>
      <div className="raffle-grid">
        {Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, i) => <span key={i} className={empty.has(i) ? 'is-empty' : undefined}/>)}
        {moving(phase) && <img className="raffle-hand" data-phase={phase} src="/art/raffle/hand.webp" alt="" draggable={false}
          style={{ left: `${target.x}%`, top: `${target.y}%` }}/>}
      </div>
    </div>

    <section className="raffle-desk" aria-label="뽑기권 구매">
      {data && <dl className="raffle-stats">
        <div><dt>이번 주 뽑기</dt><dd>{data.purchasedCount} / {data.weeklyLimit}장</dd></div>
        <div><dt>뽑기권 한 장</dt><dd>{data.ticketPrice}냥</dd></div>
        <div><dt>사용 가능 엽전</dt><dd>{data.availableBalance}냥</dd></div>
      </dl>}
      <p className="raffle-message" role="status" aria-live="polite">
        {error || (!data ? busy ? '이번 주 응모 정보를 불러오는 중이에요…' : '' : hint)}
      </p>
      {/* 뽑는 중에는 포커스를 잃지 않도록 aria-disabled만 쓴다. 중복 실행은 draw()가 막는다. */}
      <button ref={drawButton} className="raffle-draw" disabled={!data || (!!block && !retry)} aria-disabled={!!busy || phase !== 'idle'}
        onClick={() => void draw()}>{label}</button>
      {!data && !busy && <button className="raffle-reload" onClick={() => void refreshRaffle()}>다시 불러오기</button>}
      {shown.length > 0 && <div className="raffle-mine">
        <h3>이번 주 내 응모 번호</h3>
        <ul>{shown.map(t => <li key={t.ticketId}>{t.ticketNumber}</li>)}</ul>
      </div>}
    </section>

    <section className="raffle-guide" aria-labelledby="raffle-guide-title">
      <h3 id="raffle-guide-title">응모·추첨 안내</h3>
      <ol>
        <li><b>판매</b> 매주 월요일 오전 9시부터 일요일 밤 11시 59분까지(한국 시간) 뽑기권을 팔아요.</li>
        <li><b>뽑기</b> {data ? `한 장에 ${data.ticketPrice}냥, 한 주에 최대 ${data.weeklyLimit}장까지` : '한 주에 정해진 장수까지'} 뽑을 수 있어요. 뽑을 때마다 1~10,000 중 다른 사람과 겹치지 않는 응모 번호 1개가 나와요.</li>
        <li><b>추첨</b> 판매가 끝나는 월요일 0시에 그 주의 응모 번호 중에서 당첨 번호를 추첨해요.</li>
        <li><b>발표</b> 같은 월요일 오전 9시, 새 회차 판매 시작과 함께 당첨 번호를 발표해요.</li>
      </ol>
      {times && <p className="raffle-round">
        이번 회차 · 판매 {formatKst(times.opens)} ~ {formatKst(times.lastSale)}<br/>
        추첨 {formatKst(times.draw)} · 발표 {formatKst(times.announce)}
      </p>}
      <p className="raffle-note">엽전은 경기 참가금으로 예약된 금액을 뺀 사용 가능 엽전에서 차감돼요. 새 회차가 시작되면 지난주 번호는 이 화면에서 보이지 않으니 응모 번호를 꼭 기억해 두세요.</p>
    </section>

    {phase === 'reveal' && drawn && <div className="raffle-reveal" role="group" aria-label="뽑은 응모 번호">
      <div className="raffle-paper" style={{ '--digits': String(drawn.number).length } as CSSProperties}>
        <i className="raffle-spark" aria-hidden="true"/><i className="raffle-spark" aria-hidden="true"/>
        <i className="raffle-spark" aria-hidden="true"/><i className="raffle-spark" aria-hidden="true"/>
        <Crown/>
        <strong>{drawn.number}</strong>
      </div>
      <p aria-live="assertive">응모 번호 <b>{drawn.number}</b>번이 나왔어요!
        {times && <><br/>{formatKst(times.announce)}에 당첨 번호를 발표해요.</>}</p>
      <button ref={confirm} onClick={closeReveal}>확인</button>
    </div>}
  </dialog>
}
