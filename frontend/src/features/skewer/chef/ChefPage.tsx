import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { INGREDIENTS, ingredientName, availablePieces } from '../game'
import { IngredientIcon } from '../OrderDisplay'
import { recipeNotes } from '../presentation'
import { MenuArt, disposeMenuArt } from '../serviceHall/MenuArt'
import { ChefPreview } from './model'
import type { ChefAction } from './model'
import { ChefScene } from './ChefScene'
import type { ChefMode } from './ChefScene'
import type { ChefDriver } from '../coop/drivers'
import { INITIAL_PANTRY } from '../cooperativeMenu'
import { chefPresentation } from './chefPresentation'
import { CHEF_VR_STEPS, chefVRArt } from './vrGuide'
import { TouchControllerGuide } from '../../vrGuide/TouchControllerDiagram'
import { useGameDragScroll } from '../useGameDragScroll'
import './chef.css'
import './chefHud.css'
import './chefPc.css'
import './chefVr.css'
import { ClosingNotice } from '../ClosingNotice'
import { closingTime } from '../closingTime'

const modeFromURL = (): ChefMode => new URLSearchParams(location.search).get('mode') === 'vr' ? 'vr' : 'pc'
export default function ChefPage({ driver, onXRChanged, onExit, preferredMode, allowVR = true, protectVR }: { driver?: ChefDriver; onXRChanged?: (active: boolean) => void; onExit?: () => void; preferredMode?: ChefMode; allowVR?: boolean; protectVR?: () => Promise<() => void> } = {}) {
  useGameDragScroll('.chef-app', !driver?.online)
  const model = useRef<ChefDriver | null>(null); model.current ??= driver ?? new ChefPreview()
  const host = useRef<HTMLDivElement>(null), scene = useRef<ChefScene | null>(null), guide = useRef<HTMLDialogElement>(null)
  const [view, setView] = useState(() => model.current!.view()), [mode, setMode] = useState<ChefMode>(() => allowVR ? preferredMode ?? modeFromURL() : 'pc')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [xrActive, setXRActive] = useState(false), [supported, setSupported] = useState(false), [pending, setPending] = useState(false)
  const modeRef = useRef(mode); modeRef.current = mode
  const act = (action: ChefAction) => {
    if (scene.current?.vrGuideOpen) return
    if (action.type === 'exit') { onExit?.(); return }
    if (action.type === 'ready' && !xrActive) { setNotice('VR을 먼저 연결해 주세요.'); return }
    model.current!.action(action); setNotice(''); setView(model.current!.view())
  }
  const actRef = useRef(act); actRef.current = act
  useEffect(() => {
    let live = true, lastPublish = 0
    if (!host.current) return
    try {
      scene.current = new ChefScene(host.current, model.current!.view(), modeRef.current, dt => {
        if (document.visibilityState === 'visible' && !guide.current?.open) model.current!.step(dt)
        const current = model.current!.view(), now = performance.now()
        if (now - lastPublish > 90 && live) { setView(current); lastPublish = now }
        return current
      }, action => actRef.current(action), text => { if (live) setNotice(text) }, active => { if (live) { setXRActive(active); if (active) setMode('vr'); onXRChanged?.(active) } }, driver?.online ? () => protectVR ? protectVR() : Promise.reject(new Error('VR 플레이 보호 연결이 필요해요.')) : undefined)
    } catch (e) { setError(e instanceof Error ? e.message : '주방을 불러오지 못했어요.') }
    if (allowVR && window.isSecureContext && navigator.xr) void navigator.xr.isSessionSupported('immersive-vr').then(value => { if (live) setSupported(value) }).catch(() => { if (live) setSupported(false) })
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat || guide.current?.open || scene.current?.vrGuideOpen || e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable=true],dialog,[role=dialog]')) return
      if (e.target instanceof Element && e.target.closest('button,a') && ['Space', 'Enter'].includes(e.code)) return
      const slot = /^(Digit|Numpad)([1-6])$/.exec(e.code)
      const order = modeRef.current === 'pc' ? model.current!.view().pantry ?? INITIAL_PANTRY : INITIAL_PANTRY
      const ingredient = slot ? INGREDIENTS.find(item => item.id === order[Number(slot[2]) - 1]) : undefined
      if (ingredient) { e.preventDefault(); actRef.current({ type: 'select', ingredient: ingredient.id }) }
      else if (e.code === 'Space') { e.preventDefault(); actRef.current({ type: 'thread' }) }
      else if (e.code === 'Backspace') { e.preventDefault(); actRef.current({ type: 'unthread' }) }
      else if (e.code === 'KeyR') { e.preventDefault(); actRef.current({ type: 'submit' }) }
    }
    window.addEventListener('keydown', key)
    return () => { live = false; window.removeEventListener('keydown', key); scene.current?.dispose(); scene.current = null; disposeMenuArt() }
  }, [])
  useEffect(() => { scene.current?.setMode(mode) }, [mode])
  useEffect(() => { if (!xrActive) setMode(allowVR ? preferredMode ?? modeFromURL() : 'pc') }, [preferredMode, xrActive, allowVR])
  const enterVR = async () => { if (pending || !allowVR) return; setPending(true); try { await scene.current?.enterVR() } catch (e) { setNotice(e instanceof Error ? e.message : 'VR 연결을 확인해 주세요.') } finally { setPending(false) } }
  const pantry = mode === 'pc' ? view.pantry ?? INITIAL_PANTRY : INITIAL_PANTRY
  const seconds = Math.ceil(view.seconds)
  const closing = closingTime(view.seconds)
  const presentation = chefPresentation(view), assembly = presentation.guide
  const recipeGuide = assembly ? <div className="chef-recipe-guide" aria-label="선택한 주문 조립 안내"><MenuArt recipe={assembly.expected} label="선택한 주문 완성 그림" /><ol aria-label="꽂는 순서">{assembly.expected.map((id, i) => <li key={i} data-ingredient={id} className={i < assembly.completed ? 'is-done' : i === assembly.next ? 'is-next' : ''}><b>{i + 1}</b><IngredientIcon id={id} /><span>{ingredientName(id)}</span></li>)}</ol><p>{recipeNotes(assembly.expected).join(' ')}</p></div> : null
  const closeGuide = () => { guide.current?.close(); host.current?.querySelector('canvas')?.focus({ preventScroll: true }) }
  return <main className={`chef-app is-${mode}${xrActive ? ' is-immersive' : ''}`} data-testid="chef-app" data-mode={mode} data-xr={xrActive} data-stack={view.skewer.join(',')}>
    <ClosingNotice seconds={view.seconds} />
    <div className="chef-stage" ref={host}>
      {INGREDIENTS.map(item => <button className="chef-ingredient-hit" key={item.id} style={{ left: `var(--chef-ingredient-${item.id}-x,50%)`, top: `var(--chef-ingredient-${item.id}-y,50%)` } as CSSProperties} aria-label={`${pantry.indexOf(item.id) + 1} ${item.name} 선택`} aria-pressed={view.ingredient === item.id} onClick={e => { act({ type: 'select', ingredient: item.id }); e.currentTarget.blur() }} />)}
      {view.visible.map((job, i) => <button className="chef-world-order-hit" data-order={job.id} data-recipe={job.recipe.join(',')} key={job.id} style={{ left: `var(--chef-order-${i}-x,50%)`, top: `var(--chef-order-${i}-y,50%)` }} aria-label={`${job.table}번 주문 선택`} aria-pressed={view.selectedJob === job.id} onClick={e => { if (host.current?.dataset.orderTransition === 'true') return; act({ type: 'choose', id: job.id }); e.currentTarget.blur() }} />)}
    </div>
    {mode === 'vr' ? <aside className="chef-round" data-clock-phase={closing.phase}><div className="chef-clock-label">{driver?.online ? '남은 영업 시간' : '남은 연습 시간'}</div><time aria-label={driver?.online ? '남은 영업 시간' : '남은 연습 시간'}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time>{view.cooperative?.score !== undefined ? <p className="chef-team-score">팀 점수 <strong>{view.cooperative.score.toLocaleString('ko-KR')}</strong></p> : null}<p className="chef-eligibility">{view.cooperative?.rankingEligible === false ? '팀 랭킹 제외 · 보상 가능' : xrActive ? driver?.online ? 'VR 연결 · 공동 경기' : 'VR 연습' : 'VR을 연결해 주세요'}</p>{mode === 'vr' ? <button className="chef-enter-vr" disabled={!supported || pending} onClick={() => void enterVR()}>{pending ? 'VR 연결 중…' : xrActive ? 'VR 종료' : supported ? 'VR 시작' : 'VR 연결 필요'}</button> : null}</aside> : null}
    <section className="chef-accessible-readout" aria-label="영업 상태와 주문 영수증">
      <time data-testid="remaining-time">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time>
      <span data-testid="team-score">{view.cooperative?.score ?? 0}점</span>
      <span data-testid="cooking-completed">{view.completed ?? 0}개</span>
      {view.visible.map(job => <MenuArt key={job.id} recipe={job.recipe} label={job.table + '번 주문 그림'} />)}
    </section>
    {mode === 'vr' ? <section className="chef-pass-status" aria-label="완성 접시 전달대" data-full={view.pass.length >= 2}><div><strong>전달대</strong><span>{view.pass.length} / 2</span></div><div className="chef-pass-slots">{[0, 1].map(i => { const dish = view.pass[i]; return <div className="chef-pass-slot" key={i}>{dish ? <><b>{String(dish.table).padStart(2, '0')}번</b><MenuArt recipe={dish.recipe} label={`${dish.table}번 완성 접시`} /><small>수령 대기</small></> : <><span aria-hidden="true">＋</span><small>빈 접시 자리</small></>}</div> })}</div><p>{view.pass.length >= 2 ? '서빙 담당이 가져가면 제출할 수 있어요' : '완성한 꼬치는 이곳에서 전달해요'}</p></section> : null}
    <p className="chef-status" role="status" data-idle={!notice && !view.message}>{notice || view.message || '주문 그림을 보고 재료를 골라보세요.'}</p>
    {mode === 'pc' ? <div className="chef-pc-help" aria-label="키보드 조작법"><span><kbd>1–6</kbd> 재료 집기</span><span><kbd>Space</kbd> 꽂기</span><span><kbd>⌫</kbd> 빼기</span><span><kbd>R</kbd> 완성·전달대 제출</span><button aria-label="요리사 이용 안내" onClick={() => guide.current?.showModal()}>?</button></div> : <div className="chef-vr-hint"><strong>트리거</strong> 재료 집기 · 초록 고리에서 놓기 <span>끝 재료를 가리켜 빼기 · 오른쪽 접시에 제출</span><button aria-label="요리사 이용 안내" onClick={() => guide.current?.showModal()}>?</button></div>}
    {mode === 'vr' ? <footer className="chef-controls"><div className="chef-pantry" aria-label="조리 재료">{INGREDIENTS.map(item => <button key={item.id} aria-label={`${item.name} 재료 고르기`} aria-pressed={view.ingredient === item.id} disabled={presentation.blocked || !view.visible.length || availablePieces(view.skewer, item.id) <= 0} onClick={e => { act({ type: 'select', ingredient: item.id }); e.currentTarget.blur() }}><kbd>{item.key}</kbd><IngredientIcon id={item.id} /><span>{item.name}</span></button>)}</div><div className="chef-keys"><button onClick={() => act({ type: 'thread' })} disabled={presentation.blocked || !view.visible.length || availablePieces(view.skewer, view.ingredient) <= 0}><kbd>Space</kbd> {ingredientName(view.ingredient)} 꽂기</button><button onClick={() => act({ type: 'unthread' })} disabled={presentation.blocked || !view.skewer.length}><kbd>⌫</kbd> 끝 재료 빼기</button></div><button className="chef-submit" data-ready={presentation.submitReady} aria-label="완성 접시 제출" onClick={() => act({ type: 'submit' })} disabled={presentation.blocked || !view.skewer.length || !view.visible.length || view.pass.length >= 2}><kbd>R</kbd><span>{presentation.submitLabel}</span></button></footer> : null}
    {mode === 'vr' ? <p className="chef-local-note">{driver?.online ? '공동 경기 · 20점당 각자 1냥 · 모든 미니게임 합산 하루 최대 500냥' : '연습 모드 · 엽전과 랭킹 기록 없음'}</p> : null}
    {error ? <p className="chef-error" role="alert">{error}</p> : null}
    <dialog ref={guide} className="chef-guide" aria-label="요리사 이용 안내" onCancel={e => { e.preventDefault(); closeGuide() }}>
      <button className="chef-close" aria-label="안내 닫기" onClick={closeGuide}>×</button>
      <h2>{mode === 'vr' ? '온탑 꼬치왕 · VR 조작 안내' : '요리사 주방을 둘러보세요'}</h2>
      {mode === 'vr' ? <img className="chef-guide-art" src={chefVRArt} alt="기존 꼬치왕 VR 주방과 주문표" /> : null}
      {mode === 'vr' ? <TouchControllerGuide mode="chef" /> : null}
      <p>전달받은 주문 두 장 중 하나를 골라 꼬치를 만들어요.<br />치즈·베이컨은 각각 2~3개를 사용하고, 같은 큐브 사이에는 다른 재료를 정확히 한 개 끼워요.{mode === 'pc' ? ' 제출할 때마다 PC 제작대의 재료 순서가 바뀌어요.' : ''}</p>
      {recipeGuide}
      {mode === 'vr' ? <ol className="chef-vr-guide-steps" aria-label="VR 컨트롤러 조작 순서">{CHEF_VR_STEPS.map(([title, detail]) => <li key={title}><strong>{title}</strong><p>{detail}</p></li>)}</ol> : null}
      {mode === 'vr' ? <p>검지 트리거로 가리킨 대상을 선택하고, 옆면 그립으로 꼬치를 잡아요. VR 안에서는 주방의 ‘VR 조작 안내’를 가리켜 트리거로 다시 열고, 아래 닫기 버튼도 트리거로 눌러요.</p> : null}
      <ul>{mode === 'pc' ? <><li>PC: 숫자·클릭으로 선택 → Space로 꽂기 → R로 완성·제출</li>{allowVR ? <li>VR: 트리거로 음식 집기 → 꼬치 끝에서 놓기. 그립으로 꼬치를 잡을 수 있어요. 끝 재료를 가리켜 트리거로 빼고, 오른쪽 전달대 접시를 가리켜 트리거로 제출해요.</li> : null}</> : null}<li>틀린 꼬치도 제출돼요. 제출 전에는 마지막 재료부터 빼서 고칠 수 있어요.</li><li>{driver?.online ? '전달대가 두 접시로 차면 친구가 접시를 수령할 때까지 기다려요.' : '전달대가 두 접시로 차면, 아래 접시 비우기로 공간을 비울 수 있어요.'}</li></ul>
      <p className="chef-guide-note">{driver?.online ? '안내를 읽는 동안에도 영업 시간은 흘러요.' : '연습 모드에서는 보상과 랭킹을 기록하지 않아요. 홀의 서빙 캐릭터는 동선 미리보기이며 실제 동료와 연결되지 않았어요.'} PC·VR 팀 기록은 따로 집계해요. 경기 중 방식을 바꾸면 해당 경기의 랭킹에서 제외돼요.</p>
      {!driver?.online ? <div className="chef-demo-tools"><button onClick={() => { model.current = new ChefPreview(); setView(model.current.view()); setNotice('') }}>주방 초기화</button><button onClick={() => { (model.current as ChefPreview).clearIncoming(); setView(model.current!.view()) }}>주문 없는 상태</button><button onClick={() => { (model.current as ChefPreview).receiveSamples(); setView(model.current!.view()) }}>연습 주문 받기</button><button onClick={() => act({ type: 'pickup' })}>전달대 접시 비우기</button></div> : null}
      <button className="chef-guide-done" onClick={closeGuide}>주방으로 돌아가기</button>
    </dialog>
  </main>
}
