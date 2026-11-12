import { useEffect, useRef } from 'react'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import jumpRopeThumbnail from '../jumpRope/assets/thumbnail.webp'
import { GameArt } from '../manual/GameArt'
import { openManual } from '../manual/manualState'
import { moleManual } from '../mole/manual'
import { POINTS_PER_COIN as MOLE_POINTS_PER_COIN } from '../mole/protocol'
import { useMole } from '../mole/store'
import { plusMinusManual } from '../plusMinus/manual'
import { DAILY_PLAYS as PLUS_MINUS_DAILY, FEE as PLUS_MINUS_FEE } from '../plusMinus/protocol'
import { usePlusMinus } from '../plusMinus/store'
import { rpsRouletteManual } from '../rpsRoulette/manual'
import { useRpsRoulette } from '../rpsRoulette/store'
import { speedMoleManual } from '../speedMole/manual'
import { SPEED_MOLE_POINTS_PER_COIN } from '../speedMole/game'
import { closeArcade, playArcadeGame, selectArcadeGame, useArcade, type ArcadeGame } from './store'
import '../tableLobby/paperPopup.css'
import './arcade.css'

interface Choice {
  id: ArcadeGame; name: string; tagline: string; summary: string
  fee: string; prize: string; limitLabel: string; limit: string; playsLeft: number | null; inProgress: boolean
}

function ArcadeArt({ game }: { game: ArcadeGame }) {
  if (game === 'jump-rope') {
    return <img className="manual-art" src={jumpRopeThumbnail} alt="" aria-hidden="true" style={{ objectFit: 'contain' }} />
  }
  return <GameArt game={game} />
}

export function ArcadePicker() {
  const open = useArcade(s => s.open)
  return open ? <ArcadeDialog /> : null
}

/** 테이블 태블릿의 게임 고르기와 같은 한지 화면. 혼자 하는 게임이라 인원·판돈·준비 대신 참가비와 오늘 남은 판(무료 게임은 오늘 받은 엽전)을 보여 준다. */
function ArcadeDialog() {
  const selected = useArcade(s => s.selected)
  const moleShop = useArcade(s => s.scope === 'mole')
  const rps = useRpsRoulette(s => s.data), plus = usePlusMinus(s => s.data), mole = useMole(s => s.state)
  const rpsBusy = useRpsRoulette(s => s.busy === 'status'), plusBusy = usePlusMinus(s => s.busy === 'status')
  const busy = rpsBusy || plusBusy
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])

  const plays = (left: number | null, daily: number) => left === null ? (busy ? '확인 중' : '-') : `${left} / ${daily}판`
  const rpsLeft = rps ? Math.max(0, rps.rules.dailyPlays - rps.playedToday) : null
  const plusLeft = plus ? Math.max(0, plus.rules.dailyPlays - plus.playedToday) : null
  const choices: Choice[] = [
    { id: 'rps-roulette', name: rpsRouletteManual.title, tagline: rpsRouletteManual.subtitle, summary: rpsRouletteManual.summary,
      fee: `${(rps?.rules.fees ?? [10, 20, 30]).join(' · ')}냥`, prize: '참가비 × 룰렛 칸 × 도전 배수',
      limitLabel: '오늘 남은 판', limit: plays(rpsLeft, rps?.rules.dailyPlays ?? 15), playsLeft: rpsLeft,
      inProgress: !!rps?.round && rps.round.phase !== 'SETTLED' },
    { id: 'plus-minus', name: plusMinusManual.title, tagline: plusMinusManual.subtitle, summary: plusMinusManual.summary,
      fee: `${plus?.rules.fee ?? PLUS_MINUS_FEE}냥`, prize: '결괏값 × 10냥 · 7 + 잭팟 500냥',
      limitLabel: '오늘 남은 판', limit: plays(plusLeft, plus?.rules.dailyPlays ?? PLUS_MINUS_DAILY), playsLeft: plusLeft,
      inProgress: false },
    { id: 'whack-a-mole', name: moleManual.title, tagline: moleManual.subtitle, summary: moleManual.summary,
      fee: '무료', prize: `${mole?.rules.pointsPerCoin ?? MOLE_POINTS_PER_COIN}점당 1냥 · 하루 상한 안에서`,
      limitLabel: '오늘 미니게임 엽전', limit: mole ? `${mole.todayEarned} / ${mole.dailyCap}냥` : '확인 중', playsLeft: null,
      inProgress: false },
    { id: 'speed-mole', name: speedMoleManual.title, tagline: speedMoleManual.subtitle, summary: speedMoleManual.summary,
      fee: '무료', prize: `${SPEED_MOLE_POINTS_PER_COIN}점당 1냥 · 하루 상한 안에서`,
      limitLabel: '오늘 미니게임 엽전', limit: mole ? `${mole.todayEarned} / ${mole.dailyCap}냥` : '확인 중', playsLeft: null, inProgress: false },
    { id: 'jump-rope', name: '구구구 줄넘기', tagline: '비둘기들이 당신을 시험합니다.',
      summary: 'Space로 줄을 넘고 60초 동안 버텨요. MISS가 세 번이면 경기가 끝나요.',
      fee: '무료', prize: '50점당 1냥 · 하루 상한 안에서',
      limitLabel: '오늘 미니게임 엽전', limit: mole ? `${mole.todayEarned} / ${mole.dailyCap}냥` : '확인 중', playsLeft: null, inProgress: false },
  ]
  const choice = choices.find(c => c.id === selected)!
  const balance = rps?.availableBalance ?? plus?.availableBalance

  return <dialog ref={dialog} className="table-paper-popup arcade-picker" aria-labelledby="arcade-picker-title"
    onCancel={event => { event.preventDefault(); closeArcade() }}>
    <div className="arcade-paper">
      <header className="arcade-title">
        <b className="arcade-brand">{moleShop ? '온탑 두더지 가게' : '온탑 오락기'}</b>
        <h2 id="arcade-picker-title">{moleShop ? '두더지 모드 선택' : '어떤 게임을 할까요?'}</h2>
        {!moleShop && <p>혼자 즐기는 게임이에요. 골라서 바로 시작해요.</p>}
        {!moleShop && balance !== undefined && <p className="arcade-balance"><img className="arcade-coin" src={coinImage} alt="" />보유 {balance.toLocaleString('ko-KR')}냥</p>}
      </header>
      <div className="arcade-selection">
        <div className="arcade-game-list" role="group" aria-label="게임 선택">
          {choices.filter(c => !moleShop || c.id === 'whack-a-mole' || c.id === 'speed-mole').map(c => <button key={c.id} type="button" className="arcade-game-card" data-selected={c.id === selected}
            aria-pressed={c.id === selected} onClick={() => selectArcadeGame(c.id)} onDoubleClick={() => playArcadeGame(c.id)}>
            <ArcadeArt game={c.id} />
            {c.inProgress && <b className="arcade-badge">진행 중</b>}
            <span><strong>{c.name}</strong><small>혼자 · {c.fee}</small></span>
            <em>{c.limitLabel} {c.limit}</em>
          </button>)}
        </div>
        <div className="arcade-detail">
          <small>선택한 게임</small>
          <h3>{choice.name}</h3>
          <p className="arcade-tagline">{choice.tagline}</p>
          <GameArt game={choice.id} />
          <p className="arcade-summary">{choice.summary}</p>
          <dl className="arcade-terms">
            <div><dt>참가비</dt><dd>{choice.fee !== '무료' && <img className="arcade-coin" src={coinImage} alt="" />}{choice.fee}</dd></div>
            <div><dt>{choice.limitLabel}</dt><dd>{choice.limit}</dd></div>
            <div><dt>받는 엽전</dt><dd>{choice.prize}</dd></div>
          </dl>
          {choice.inProgress && <p className="arcade-note" role="status">끝나지 않은 판이 있어요. 이어서 해요.</p>}
          {choice.playsLeft === 0 && <p className="arcade-note" role="status">오늘 판을 모두 했어요. 지난 결과만 볼 수 있어요.</p>}
          <button type="button" className="arcade-manual" onClick={() => openManual(choice.id)}>설명서</button>
          <button type="button" className="arcade-primary" onClick={() => playArcadeGame()}>
            {choice.inProgress ? '이어서 하기' : '이 게임 하기'}<span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
      <footer className="arcade-footer">
        <button type="button" aria-keyshortcuts="Escape" title="닫기 (Esc)" onClick={closeArcade}>닫기</button>
      </footer>
    </div>
  </dialog>
}
