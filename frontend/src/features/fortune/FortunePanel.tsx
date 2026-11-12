import { useEffect, useRef, useState } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { avatars, useSession } from '../../network/worldClient'
import { selectDestination } from '../navigation/navigationState'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { fortuneGuideTarget } from './destinations'
import { chooseFortuneCard, closeFortune, finishFortuneGather, finishFortuneReveal, finishFortuneShuffle,
  FORTUNE_GATHER_MS, FORTUNE_REVEAL_MS, FORTUNE_SHUFFLE_MS, startFortuneShuffle, startNewFortune, syncFortuneCooldown, useFortune } from './state'
import { captureFortuneCards, FortuneGather } from './FortuneGather'
import { FortuneCard } from './FortuneCard'
import { fortuneReceiptKey, fortuneWaitLabel } from './cooldown'
import { watchFortuneConnection } from './controller'
import { canReachFortune } from './placement'
import './fortune.css'
import cardBack from './art/tapgol-card-back-v4.png'
import cardFront from './art/tapgol-card-front-v6.png'

export function FortunePanel() {
  const open = useFortune(s => s.open)
  useEffect(() => {
    const unwatch = watchFortuneConnection()
    return () => { unwatch(); closeFortune() }
  }, [])
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      const s = useSession.getState(), a = avatars.get(s.sessionId)
      if (s.status !== 'connected' || !s.mapCompatible || !a?.connected || a.swimming || a.carry
        || s.tableId || a.seatIndex >= 0 || a.fitnessId || a.telescopeId || !canReachFortune(a.current)) closeFortune()
    }, 150)
    return () => clearInterval(timer)
  }, [open])
  return open ? <FortuneDialog /> : null
}

export function FortuneDialog({ onGuide }: { onGuide?: () => void } = {}) {
  const { result, deck, nickname, draft, error, phase, connection, selectedIndex, issuedAt, nextAllowedAt, pending } = useFortune()
  const [now, setNow] = useState(Date.now)
  const remaining = Math.max(0, nextAllowedAt - Math.max(now, issuedAt))
  useEffect(() => {
    const update = () => { setNow(Date.now()); syncFortuneCooldown() }
    const changed = (event: StorageEvent) => { if (event.key === fortuneReceiptKey(useFortune.getState().owner)) update() }
    const timer = setInterval(update, 1000)
    window.addEventListener('storage', changed)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); window.removeEventListener('storage', changed); document.removeEventListener('visibilitychange', update) }
  }, [])
  const nameInput = useRef<HTMLInputElement>(null)
  const guideButton = useRef<HTMLButtonElement>(null)
  const choices = useRef<HTMLDivElement>(null)
  const origins = useRef<ReturnType<typeof captureFortuneCards>>([])
  const resultCard = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLElement>(null)
  useEffect(() => {
    // Start loading the front and possible game art while the player is still choosing.
    for (const src of [cardFront, ...deck.map(game => game.art)]) { const image = new Image(); image.src = src }
  }, [deck])
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (phase === 'shuffling' || phase === 'gathering' || phase === 'revealing')
      heading.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('.paper-close')?.focus({ preventScroll: true })
    if (phase === 'shuffling') {
      const timer = setTimeout(() => finishFortuneShuffle(connection), reduced ? 120 : FORTUNE_SHUFFLE_MS)
      return () => clearTimeout(timer)
    }
    if (phase === 'revealing') {
      const timer = setTimeout(() => finishFortuneReveal(connection), reduced ? 120 : FORTUNE_REVEAL_MS)
      return () => clearTimeout(timer)
    }
    if (phase === 'gathering') {
      const finish = () => finishFortuneGather(connection)
      const timer = setTimeout(finish, reduced ? 120 : FORTUNE_GATHER_MS)
      window.addEventListener('resize', finish, { once: true })
      return () => { clearTimeout(timer); window.removeEventListener('resize', finish) }
    }
    if (phase === 'choosing') choices.current?.querySelector('button')?.focus({ preventScroll: true })
    if (phase === 'revealed') guideButton.current?.focus({ preventScroll: true })
    if (phase === 'writing') nameInput.current?.focus({ preventScroll: true })
  }, [phase, connection])
  function guide() {
    if (onGuide) { onGuide(); return }
    if (!result || phase !== 'revealed') return
    const s = useSession.getState(), pose = avatars.get(s.sessionId)?.current
    if (!pose || s.status !== 'connected') return
    const target = fortuneGuideTarget(result, pose)
    if (!target) { useFortune.setState({ error: '현재 맵에서 게임 입구를 찾지 못했어요. 잠시 후 다시 시도해주세요.' }); return }
    selectDestination(target, s.sessionId, s.roomId)
    closeFortune()
  }
  const subtitles = {
    writing: '이름을 남기고, 당신을 기다리는 한 장을 만나보세요.',
    shuffling: '당신의 행운을 섞고 있어요',
    choosing: '마음이 이끄는 카드 한 장을 골라보세요',
    gathering: '선택한 한 장에 행운이 모이고 있어요',
    revealing: '선택한 카드가 당신의 운세를 보여줍니다',
    revealed: `${nickname} 님에게 찾아온 한 장`,
  }
  return <div className="fortune-overlay"><PaperPopup title="" label="오늘의 운세" onClose={closeFortune}
    closeLabel="운세 닫기" className={`fortune-popup fortune-popup--${phase}`}
    initialFocusRef={phase === 'writing' ? nameInput : undefined}>
    <header ref={heading} className="fortune-heading"><h2>오늘의 운세</h2><p role="status">{subtitles[phase]}</p></header>
    <div className="fortune-content" data-phase={phase}>
      {error && phase !== 'writing' && <p className="fortune-error" role="alert">{error}</p>}
      {phase === 'writing' && <div className="fortune-entry">
        <img className="fortune-entry__card" src={cardBack} alt="" draggable={false}/>
        <form onSubmit={event => { event.preventDefault(); startFortuneShuffle() }}>
          <h3>당신의 이름을 들려주세요</h3>
          <p className="fortune-description">승리의 예감, 새로운 기록의 기운.<br/>오늘의 놀이는 카드가 안내해줄 거예요.</p>
          <label htmlFor="fortune-nickname">나의 닉네임</label>
          <input ref={nameInput} id="fortune-nickname" value={draft} maxLength={20} autoComplete="off" placeholder="닉네임을 입력해주세요"
            aria-invalid={!!error} aria-describedby={error ? 'fortune-error' : 'fortune-name-help'}
            onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }}
            onChange={event => useFortune.setState({ draft: event.target.value, error: '' })}/>
          <p id="fortune-name-help" className="fortune-small">1~20자 · 운세에만 사용할 이름이에요.</p>
          {error && <p id="fortune-error" className="fortune-error" role="alert">{error}</p>}
          <button type="submit" className="fortune-primary" disabled={pending}>카드 섞기</button>
        </form>
      </div>}
      {phase === 'shuffling' && <div className="fortune-shuffle" aria-label="타로 카드 섞는 중" aria-busy="true">
        {[0, 1, 2].map(index => <img src={cardBack} key={index} alt="" draggable={false} style={{ '--card-index': index } as import('react').CSSProperties}/>) }
      </div>}
      {phase === 'choosing' && <div className="fortune-choices" ref={choices}>
        {['첫 번째', '두 번째', '세 번째'].map((name, index) => <button type="button" key={name} className="fortune-choice"
          aria-label={`${name} 카드 선택`} disabled={pending} onClick={() => {
            origins.current = captureFortuneCards(choices.current)
            void chooseFortuneCard(index)
          }}>
          <img src={cardBack} alt="" draggable={false}/><span>{name} 카드</span>
        </button>)}
      </div>}
      {result && <div className="fortune-result" data-selected-card={selectedIndex} data-gathering={phase === 'gathering'} aria-hidden={phase === 'gathering'} inert={phase === 'gathering'}>
        <div ref={resultCard} className={`fortune-flip ${phase === 'revealing' ? 'fortune-flip--playing' : ''}`}>
          {phase === 'revealing' && <img className="fortune-flip__back" src={cardBack} alt=""/>}
          <FortuneCard game={result}/>
        </div>
        <section className="fortune-reading" aria-labelledby="fortune-reading-title" aria-hidden={phase !== 'revealed'} inert={phase !== 'revealed'}>
          <h3 id="fortune-reading-title">{result.title}</h3>
          <p className="fortune-reading__omen">{result.omen}</p>
          <div className="fortune-reading__advice"><h4>행운의 한 수</h4><p>{result.advice}</p></div>
          <div className="fortune-result__actions">
            <button ref={guideButton} type="button" className="fortune-primary" onClick={guide} disabled={phase !== 'revealed'}>
              {result.name} 길 안내 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 19 19 5M6 5h13v13"/></svg>
            </button>
            {result.destination === 'pagoda' && <p className="fortune-small">대석탑 정원 입구에서 E를 눌러 돌탑 생존전에 입장하세요.</p>}
            {result.destination === 'vr' && <p className="fortune-small">VR 체험관 입구에서 E를 눌러 온탑 꼬치왕을 열어보세요.</p>}
            {result.destination === 'table' && <p className="fortune-small">{RENEWAL_PARK_ENABLED ? '메인 팔각정 안의 테이블' : '테이블'}에 앉아 추천 게임을 선택해보세요.</p>}
            {result.destination === 'arcade' && <p className="fortune-small">{RENEWAL_PARK_ENABLED && (result.id === 'whack-a-mole' || result.id === 'speed-mole') ? '두더지 게임장' : '오락기'} 앞에서 E를 누르고 {result.name} 게임을 선택해보세요.</p>}
            {nextAllowedAt > 0 && remaining === 0 && <button type="button" className="fortune-again" onClick={startNewFortune}>새 운세 카드 뽑기</button>}
          </div>
        </section>
      </div>}
      {phase === 'gathering' && selectedIndex !== null && <FortuneGather origins={origins.current} selectedIndex={selectedIndex} target={resultCard}/>}
    </div>
    <footer className="fortune-footer"><p>{nextAllowedAt > 0
      ? remaining > 0 ? <>다음 운세까지 <time className="fortune-countdown" aria-label="다음 운세까지 남은 시간">{fortuneWaitLabel(remaining)}</time></> : '3시간이 지났어요. 새 운세를 확인할 수 있어요.'
      : '3시간에 한 번 이용할 수 있어요.'}</p>
      {nextAllowedAt > 0 && remaining > 0 && <p className="fortune-next-time">다음 이용 가능 · <time dateTime={new Date(nextAllowedAt).toISOString()}>{new Date(nextAllowedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</time></p>}
    </footer>
  </PaperPopup></div>
}
