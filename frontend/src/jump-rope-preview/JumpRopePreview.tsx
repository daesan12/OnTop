import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { JumpRopeHud, hudFeedbackMs, type HudJudgement } from './JumpRopeHud'
import { JumpRopeMenu } from './JumpRopeMenu'
import { JumpRopeRanking } from './JumpRopeRanking'
import { rankingPreviewStates, sampleScore } from './jumpRopeRankingFixtures'
import { JumpRopeResult } from './JumpRopeResult'
import { PreviewScene } from './PreviewScene'
import { requestJump, type PreviewPass } from './previewMotion'
import { clearanceWindowMs } from './jumpRopeJudgement'
import { pointsForPass, roundDurationMs, type RoundEndReason } from './jumpRopeRules'
import { createSuccessCue, successDurationMs, type PigeonSuccessCue, type PigeonSuccessKind } from './pigeonSuccess'
import { defaultRopeAcceleration, ropePeriodMs } from './ropeAcceleration'
import { distractionDefaults, distractionDurationLimits, distractionDurationMs, sampleDistraction, type DistractionCue, type DistractionKind, type DistractionSettings } from './pigeonDistractionMotion'
import { advanceDistractionSchedule, createDistractionSchedule } from './pigeonDistractionSchedule'
import { finaleStage } from './gameOverFinale'
import { completionResultMs } from './completionFinale'
import { GameOverSplash } from './GameOverSplash'
import { advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound, roundCue, roundSecondsLeft, type RoundCue, type ScoredPreviewPass } from './previewRound'
import type { JumpRopeService, JumpRopeSession } from '../features/jumpRope/service'
import type { JumpRopeSettlement, submitJumpRope } from '../features/jumpRope/store'
import type { JumpRopeRankingState } from './jumpRopeRankingData'
import './preview.css'

type RankedBindings = {
  owner: string; service: JumpRopeService; settlement: JumpRopeSettlement | null
  setActive: (active: boolean) => void; submit: typeof submitJumpRope; retry: () => void; onExit: () => void
  canJump: () => boolean
  exitRequest: RefObject<(() => boolean) | null>
}

const defaults = {
  cameraAngle: 18,
  cameraDistance: 7,
  cameraHeight: 2.8,
  fov: 42,
  avatarX: 0,
  avatarZ: 0,
  avatarScale: 1,
  jumpHeight: 0.6,
  jumpDuration: 0.4,
  ropeWidth: 0.035,
  ropeSpeed: 1,
  autoAcceleration: true,
  ...defaultRopeAcceleration,
  ropeHeight: 0.7,
  ropeSag: 0.12,
  pigeonNod: 0.65,
  pigeonGap: 4.6,
  pigeonScale: 1,
  audience: true,
  perfectWindowMs: 50,
  clearanceMargin: 0.03,
  reactionMs: 1350,
  laughTilt: 1,
}

export type PreviewSettings = typeof defaults
type NumberSetting = Exclude<keyof PreviewSettings, 'audience' | 'autoAcceleration'>
type Slider = [key: NumberSetting, label: string, min: number, max: number, step: number, unit: string]

const controls: { title: string; sliders: Slider[] }[] = [
  { title: '줄 가속', sliders: [
    ['startPeriodMs', '시작 회전 주기', 550, 1800, 10, ' ms'],
    ['endPeriodMs', '최종 회전 주기', 550, 1800, 10, ' ms'],
  ] },
  { title: '카메라', sliders: [
    ['cameraAngle', '각도', -55, 55, 1, '°'],
    ['cameraDistance', '거리', 4, 12, 0.1, ' m'],
    ['cameraHeight', '높이', 0.8, 6, 0.1, ' m'],
    ['fov', 'FOV', 25, 75, 1, '°'],
  ] },
  { title: '아바타와 점프', sliders: [
    ['avatarX', '좌우 위치', -1.2, 1.2, 0.05, ' m'],
    ['avatarZ', '앞뒤 위치', -0.9, 0.9, 0.05, ' m'],
    ['avatarScale', '크기', 0.6, 1.5, 0.05, '×'],
    ['jumpHeight', '최고 높이', 0.2, 1.6, 0.05, ' m'],
    ['jumpDuration', '체공 시간', 0.25, 1.4, 0.05, '초'],
  ] },
  { title: '전깃줄과 비둘기', sliders: [
    ['ropeWidth', '줄 두께', 0.01, 0.12, 0.005, ' m'],
    ['ropeSpeed', '줄 회전 속도', 0, 3, 0.1, '회/초'],
    ['ropeHeight', '줄 곡률', 0.2, 1.5, 0.05, ''],
    ['ropeSag', '줄 처짐', 0, 0.26, 0.01, ' m'],
    ['pigeonNod', '고개 움직임', 0, 1.5, 0.05, '×'],
    ['pigeonGap', '비둘기 간격', 3, 6, 0.1, ' m'],
    ['pigeonScale', '비둘기 크기', 0.6, 1.6, 0.05, '×'],
  ] },
  { title: '판정 조정', sliders: [
    ['perfectWindowMs', 'PERFECT 오차', 0, 150, 5, ' ms'],
    ['clearanceMargin', '줄 위 여유 높이', 0, 0.2, 0.01, ' m'],
    ['reactionMs', 'MISS 연출 시간', 1100, 1800, 50, ' ms'],
    ['laughTilt', 'MISS 고개 젖힘', 0.65, 1.1, 0.05, '×'],
  ] },
]

const demoActions = {
  jump: '점프 테스트',
  miss: 'MISS 시안',
  end: '종료 시안',
} as const

const distractionSliders: [keyof DistractionSettings, string, number, number, number, string][] = [
  ['flightScale', '비행 크기', 0.4, 0.95, 0.01, '×'],
  ['flightDurationMs', '비행 시간', distractionDurationLimits.flight.min, distractionDurationLimits.flight.max, 10, ' ms'],
  ['flightHeight', '비행 높이', -0.1, 0.65, 0.01, ' m'],
  ['flightDistance', '비행 카메라 거리', 1.7, 3.5, 0.05, ' m'],
  ['walkScale', '보행 크기', 0.45, 0.8, 0.01, '×'],
  ['walkDurationMs', '보행 시간', distractionDurationLimits.walk.min, distractionDurationLimits.walk.max, 50, ' ms'],
  ['walkSpan', '보행 경로 폭', 3, 4.7, 0.05, ' m'],
  ['walkDepth', '보행 경로 앞쪽 거리', 0.65, 1.2, 0.05, ' m'],
]

type DemoAction = keyof typeof demoActions
export type Demo = { action: DemoAction | 'laugh' | 'shock'; startedAt: number; durationMs: number }
export type FinalePreview = {
  reason: RoundEndReason
  startedAt: number
  stage: ReturnType<typeof finaleStage> | 'acknowledgement'
}
export type RopeSimulation = { angle: number; startedAt: number; lastAt: number; sampleSeconds: number }

const successDemoActions = {
  good: 'GOOD 반응 미리보기',
  perfect: 'PERFECT 반응 미리보기',
  combo5: '5 PERFECT 콤보 미리보기',
  combo10: '10 PERFECT 콤보 미리보기',
} satisfies Record<PigeonSuccessKind, string>

const hudSamples: Record<DemoAction, { note?: string; judgement?: PreviewPass['kind']; earnedPoints?: number }> = {
  jump: { note: '점프 테스트' },
  miss: { judgement: 'miss', earnedPoints: pointsForPass('miss', 0) },
  end: { note: '비둘기한테 졌습니다.' },
}

const hudPresets = {
  opening: { label: '시작 · 60초', seconds: 60, score: 0, combo: 0, chances: 3 },
  early: { label: '초반 · 3콤보', seconds: 46, score: sampleScore(7, 3), combo: 3, chances: 3 },
  streak: { label: '중반 · 7콤보', seconds: 27, score: sampleScore(17, 7), combo: 7, chances: 2 },
  final: { label: '마감 · 12콤보', seconds: 10, score: sampleScore(9, 12, 9, 12), combo: 12, chances: 1 },
} as const
type HudPreset = keyof typeof hudPresets | 'live'

function readRoundHud(round: ReturnType<typeof createPreviewRound>) {
  return { seconds: roundSecondsLeft(round), playedMs: Math.floor(round.playedMs / 100) * 100, stats: round.stats, endReason: round.endReason }
}

function canRunRoundPreview(round: ReturnType<typeof createPreviewRound>) {
  return round.phase.kind === 'menu' || round.phase.kind === 'initialCountdown' || round.phase.kind === 'playing'
}

const distractionLabels = { flight: '비행', walk: '걷기', manhole: '하수구 탈출' }
const eventLabels = { pending: '예정', running: '진행 중', finished: '완료', skipped: '건너뜀', cancelled: '중단' }

type ManholePreview = { cue: DistractionCue; startedAt: number; pausedAt: number | null; pausedMs: number }

function manholePreviewAge(preview: ManholePreview, now: number) {
  return (preview.pausedAt ?? now) - preview.startedAt - preview.pausedMs
}

function newDistractionSeed(previous?: number) {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
  return seed === previous ? (seed + 1) >>> 0 : seed
}

function parseDistractionSeed(input: string) {
  const seed = Number(input)
  return /^\d{1,10}$/.test(input) && seed <= 0xffffffff ? seed : null
}

export function JumpRopePreview({ ranked }: { ranked?: RankedBindings } = {}) {
  const [settings, setSettings] = useState(defaults)
  const [distractionSettings, setDistractionSettings] = useState(distractionDefaults)
  const [distractionDirection, setDistractionDirection] = useState<-1 | 1>(1)
  const [automaticDistraction, setAutomaticDistraction] = useState(true)
  const [fixedSeed, setFixedSeed] = useState('')
  const [distractionSchedule, setDistractionSchedule] = useState(() => createDistractionSchedule(newDistractionSeed()))
  const [showManholePreview, setShowManholePreview] = useState(false)
  const [demo, setDemo] = useState<{ action: DemoAction; startedAt: number } | null>(null)
  const [round] = useState(() => createPreviewRound('menu'))
  const [rankingOpen, setRankingOpen] = useState(false)
  const [liveRanking, setLiveRanking] = useState<JumpRopeRankingState>({ kind: 'loading' })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [confirmExit, setConfirmExit] = useState(false)
  const exitOpenedAt = useRef<number | null>(null)
  const exitDialog = useRef<HTMLDialogElement>(null)
  const exitTitle = useRef<HTMLHeadingElement>(null)
  const startRequest = useRef<AbortController | null>(null)
  const startKey = useRef('')
  const sessionRef = useRef<{ id: string; expiresAt: number } | null>(null)
  const submitRanked = ranked?.submit
  const rankedOwner = ranked?.owner
  const rankedService = ranked?.service
  const canJump = ranked?.canJump
  const exitRequest = ranked?.exitRequest
  const settlementStatus = ranked?.settlement?.status
  const [rankingMode, setRankingMode] = useState<keyof typeof rankingPreviewStates>('ready')
  const rankingTrigger = useRef<HTMLButtonElement | null>(null)
  const [hideMenuForPreview, setHideMenuForPreview] = useState(false)
  const [hud, setHud] = useState(() => readRoundHud(round))
  const [hudPreset, setHudPreset] = useState<HudPreset>('live')
  const [hudJudgement, setHudJudgement] = useState<{ kind: HudJudgement; earnedPoints: number; at: number } | null>(null)
  const [ropePaused, setRopePaused] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [sampleSeconds, setSampleSeconds] = useState(45)
  const [cue, setCue] = useState<RoundCue>('menu')
  const [lastPass, setLastPass] = useState<ScoredPreviewPass | null>(null)
  const [visiblePass, setVisiblePass] = useState<ScoredPreviewPass | null>(null)
  const [finalePreview, setFinalePreview] = useState<FinalePreview | null>(null)
  const finalePreviewRef = useRef<FinalePreview | null>(null)
  const clockOffset = useRef(0)
  const demoRef = useRef<Demo | null>(null)
  const successDemoRef = useRef<PigeonSuccessCue | null>(null)
  const successDemoVariant = useRef(0)
  const simulationRef = useRef<RopeSimulation | null>(null)
  const distractionRef = useRef<DistractionCue | null>(null)
  const manholePreviewRef = useRef<ManholePreview | null>(null)
  const scheduleRef = useRef(distractionSchedule)
  const stageRef = useRef<HTMLElement>(null)
  const controlsRef = useRef({ settings, paused: false, cue })
  const { jumpHeight, jumpDuration } = settings
  const getFinalePreview = useCallback(() => finalePreviewRef.current, [])
  const sceneTime = useCallback((now: number) =>
    (exitOpenedAt.current ?? finalePreviewRef.current?.startedAt ?? manholePreviewRef.current?.startedAt ?? now) - clockOffset.current, [])

  const closeManholePreview = useCallback((now: number) => {
    const preview = manholePreviewRef.current
    if (!preview) return
    clockOffset.current += now - preview.startedAt
    manholePreviewRef.current = null
    setShowManholePreview(false)
  }, [])

  const closeFinalePreview = useCallback((now: number) => {
    const preview = finalePreviewRef.current
    if (!preview) return
    clockOffset.current += now - preview.startedAt
    finalePreviewRef.current = null
    setFinalePreview(null)
  }, [])

  const step = useCallback((wallNow: number, speed?: number) => {
    if (exitOpenedAt.current !== null) return
    const finale = finalePreviewRef.current
    if (finale) {
      if (finale.stage === 'result') return
      const age = wallNow - finale.startedAt
      const stage: FinalePreview['stage'] = finale.reason === 'time'
        ? age >= completionResultMs ? 'result' : 'acknowledgement'
        : finaleStage(age)
      if (stage !== finale.stage) {
        const next: FinalePreview = { ...finale, stage }
        finalePreviewRef.current = next
        setFinalePreview(next)
      }
      return
    }
    const manholePreview = manholePreviewRef.current
    if (manholePreview) {
      if (manholePreviewAge(manholePreview, wallNow) < distractionDurationMs(manholePreview.cue)) return
      closeManholePreview(wallNow)
    }
    const now = sceneTime(wallNow)
    const controls = controlsRef.current
    const { settings } = controls
    const effectiveSpeed = simulationRef.current ? 0 : (speed ?? (controls.paused ? 0 : settings.ropeSpeed))
    if (round.phase.kind === 'initialCountdown' &&
      (simulationRef.current || (controls.paused && effectiveSpeed === 0 && round.phase.endsAt === undefined))) return
    const previous = readRoundHud(round)
    const latest = advancePreviewRound(round, now, effectiveSpeed, settings, settings.reactionMs,
      settings.autoAcceleration ? settings : undefined)
    if (!previous.endReason && round.endReason && sessionRef.current && round.ranked && rankedOwner) {
      submitRanked?.({ ...sessionRef.current, owner: rankedOwner, reason: round.endReason, offsets: round.ranked.offsets })
    }
    if (latest?.kind === 'miss' || round.endReason) successDemoRef.current = null
    if (latest?.kind === 'miss' || round.endReason) distractionRef.current = null
    if (latest?.kind === 'miss') demoRef.current = null
    const preview = distractionRef.current
    if (preview && now >= preview.startedAt + distractionDurationMs(preview)) distractionRef.current = null
    const phase = round.phase.kind
    const mode = round.endReason ? 'ended' : phase === 'menu' || phase === 'initialCountdown' ? 'inactive'
      : phase !== 'playing' ? 'miss' : round.motion.ropeSpeed > 0 ? 'playing' : 'paused'
    const schedule = advanceDistractionSchedule(scheduleRef.current, {
      playedMs: round.playedMs, mode, enabled: automaticDistraction,
      previewBusy: distractionRef.current !== null, settings: distractionSettings,
    })
    if (schedule !== scheduleRef.current) {
      scheduleRef.current = schedule
      setDistractionSchedule(schedule)
    }
    const next = readRoundHud(round)
    if (next.seconds !== previous.seconds || next.playedMs !== previous.playedMs || next.stats !== previous.stats || next.endReason !== previous.endReason) {
      setHud(next)
    }
    const nextCue = roundCue(round, now)
    if (nextCue !== controls.cue) {
      controls.cue = nextCue
      setCue(nextCue)
    }
    if (!latest) return
    setLastPass(latest)
    setVisiblePass(latest)
  }, [round, automaticDistraction, distractionSettings, sceneTime, closeManholePreview, submitRanked, rankedOwner])

  const sampleDistractionFrame = useCallback((now: number) => {
    if (finalePreviewRef.current || round.endReason) return null
    const manholePreview = manholePreviewRef.current
    if (manholePreview) return sampleDistraction(manholePreview.cue, manholePreviewAge(manholePreview, now))
    const preview = distractionRef.current
    if (preview) return sampleDistraction(preview, sceneTime(now))
    const active = scheduleRef.current.active
    return active ? sampleDistraction(active.cue, round.playedMs) : null
  }, [round, sceneTime])

  useEffect(() => {
    if (rankingOpen) return
    rankingTrigger.current?.focus({ preventScroll: true })
    rankingTrigger.current = null
  }, [rankingOpen])

  useEffect(() => {
    if (!rankingOpen || !rankedService) return
    const controller = new AbortController()
    void rankedService.rankings(controller.signal).then(result => {
      if (!controller.signal.aborted) setLiveRanking(result)
    }, () => { if (!controller.signal.aborted) setLiveRanking({ kind: 'error' }) })
    return () => controller.abort()
  }, [rankedService, rankingOpen])

  useEffect(() => () => startRequest.current?.abort(), [])

  useLayoutEffect(() => {
    if (!exitRequest) return
    exitRequest.current = () => {
      if (exitOpenedAt.current !== null) return true
      if (round.phase.kind === 'menu') return false
      if (round.endReason) return round.phase.kind !== 'ended' || settlementStatus === 'saving'

      // Leaving this round is irreversible. Freeze it before another frame can submit a result.
      exitOpenedAt.current = performance.now()
      startKey.current = ''
      setStartError('')
      setConfirmExit(true)
      return true
    }
    return () => { exitRequest.current = null }
  }, [exitRequest, round, settlementStatus])

  useLayoutEffect(() => {
    if (!confirmExit) return
    const dialog = exitDialog.current
    dialog?.showModal()
    exitTitle.current?.focus({ preventScroll: true })
    return () => dialog?.close()
  }, [confirmExit])

  useEffect(() => {
    if (!visiblePass) return
    const timeout = window.setTimeout(() => setVisiblePass(null), hudFeedbackMs)
    return () => window.clearTimeout(timeout)
  }, [visiblePass])

  useEffect(() => {
    if (!hudJudgement) return
    const timeout = window.setTimeout(() => setHudJudgement(null), hudFeedbackMs)
    return () => window.clearTimeout(timeout)
  }, [hudJudgement])

  useEffect(() => {
    if (demo?.action !== 'miss') return
    const timeout = window.setTimeout(() => setDemo(null), hudFeedbackMs)
    return () => window.clearTimeout(timeout)
  }, [demo])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Escape' && finalePreviewRef.current && !event.defaultPrevented) {
        event.preventDefault()
        closeFinalePreview(performance.now())
        stageRef.current?.focus({ preventScroll: true })
        return
      }
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (exitOpenedAt.current !== null || (canJump && (document.hidden || !canJump()))) return
      if (event.target instanceof HTMLElement && event.target.closest(
        'button, input:not([type="range"]), textarea, select, a[href], [contenteditable="true"]',
      )) return
      event.preventDefault()
      if (!event.repeat && !finalePreviewRef.current && !manholePreviewRef.current) {
        const now = performance.now()
        const playing = round.phase.kind === 'playing'
        step(now)
        if (playing || (round.ranked && round.phase.kind === 'playing')) requestRoundJump(round, sceneTime(now), jumpHeight, jumpDuration)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [round, jumpHeight, jumpDuration, step, sceneTime, closeFinalePreview, canJump])

  function showStageForPreview() {
    if (round.phase.kind === 'menu') setHideMenuForPreview(true)
    stageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }

  function startDemo(action: DemoAction) {
    if (manholePreviewRef.current) return
    const wallNow = performance.now()
    const playing = round.phase.kind === 'playing'
    step(wallNow)
    const now = sceneTime(wallNow)
    if (action === 'jump') {
      const jumped = round.phase.kind === 'menu' ? requestJump(round.motion, now, jumpHeight, jumpDuration)
        : playing && requestRoundJump(round, now, jumpHeight, jumpDuration)
      if (!jumped) return
    }
    const nextDemo = { action, startedAt: now, durationMs: settings.reactionMs }
    demoRef.current = nextDemo
    setVisiblePass(null)
    setDemo(nextDemo)
    showStageForPreview()
  }

  function startSuccessDemo(kind: PigeonSuccessKind) {
    if (!canRunRoundPreview(round)) return
    if (demoRef.current?.action === 'laugh' || demoRef.current?.action === 'miss' || demoRef.current?.action === 'shock') demoRef.current = null
    const { settings } = controlsRef.current
    const simulation = simulationRef.current
    const playedMs = simulation ? simulation.sampleSeconds * 1000 : round.playedMs
    const period = ropePeriodMs(settings.ropeSpeed, settings.autoAcceleration ? { profile: settings, playedMs } : undefined)
    successDemoRef.current = createSuccessCue(kind, sceneTime(performance.now()), successDemoVariant.current++, period)
    showStageForPreview()
  }

  function startLaughDemo() {
    if (round.phase.kind === 'landing' || round.phase.kind === 'reaction') return
    successDemoRef.current = null
    demoRef.current = { action: 'laugh', startedAt: sceneTime(performance.now()), durationMs: settings.reactionMs }
    showStageForPreview()
  }

  function startShockDemo() {
    if (!canRunRoundPreview(round)) return
    successDemoRef.current = null
    demoRef.current = { action: 'shock', startedAt: sceneTime(performance.now()), durationMs: 0 }
    showStageForPreview()
  }

  function startFinalePreview(reason: RoundEndReason) {
    if (finalePreviewRef.current) return
    const now = performance.now()
    step(now)
    if (!canRunRoundPreview(round)) return
    closeManholePreview(now)
    const preview: FinalePreview = { reason, startedAt: now, stage: reason === 'time' ? 'acknowledgement' : 'flight' }
    finalePreviewRef.current = preview
    setFinalePreview(preview)
    stageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }

  function resetScene(entry: 'menu' | 'initialCountdown', startsAt?: number, serverSeed?: number) {
    resetPreviewRound(round, entry, startsAt)
    setRankingOpen(false)
    finalePreviewRef.current = null
    clockOffset.current = 0
    setFinalePreview(null)
    distractionRef.current = null
    manholePreviewRef.current = null
    setShowManholePreview(false)
    const seed = serverSeed ?? parseDistractionSeed(fixedSeed) ?? newDistractionSeed(scheduleRef.current.seed)
    const schedule = createDistractionSchedule(seed, distractionSettings)
    scheduleRef.current = schedule
    setDistractionSchedule(schedule)
    simulationRef.current = null
    setSimulating(false)
    demoRef.current = null
    successDemoRef.current = null
    successDemoVariant.current = 0
    const nextCue = roundCue(round, performance.now())
    controlsRef.current.cue = nextCue
    setCue(nextCue)
    setHideMenuForPreview(false)
    setHud(readRoundHud(round))
    setDemo(null)
    setLastPass(null)
    setVisiblePass(null)
    setHudPreset('live')
    setHudJudgement(null)
  }

  function startDistraction(kind: DistractionKind) {
    if (finalePreviewRef.current) return
    const now = performance.now()
    step(now)
    if (!canRunRoundPreview(round)) return
    if (scheduleRef.current.active || distractionRef.current || manholePreviewRef.current) return
    if (kind === 'manhole' && simulationRef.current) return
    if (kind !== 'manhole') showStageForPreview()
    else stageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    const cue = { kind, startedAt: kind === 'manhole' ? 0 : sceneTime(now), direction: distractionDirection, settings: distractionSettings }
    if (kind === 'manhole') {
      manholePreviewRef.current = { cue, startedAt: now, pausedAt: null, pausedMs: 0 }
      setShowManholePreview(true)
    } else {
      distractionRef.current = cue
    }
  }

  function beginGame(server?: JumpRopeSession) {
    const now = performance.now()
    const serverNow = server ? Date.parse(server.serverNow) : 0
    sessionRef.current = server ? { id: server.id, expiresAt: now + Date.parse(server.expiresAt) - serverNow } : null
    controlsRef.current.paused = false
    setRopePaused(false)
    resetScene('initialCountdown', server ? now + Date.parse(server.startedAt) - serverNow : undefined, server?.seed)
    if (exitOpenedAt.current !== null) {
      exitOpenedAt.current = null
      exitDialog.current?.close()
      setConfirmExit(false)
    }
    step(now)
    stageRef.current?.focus({ preventScroll: true })
  }

  function restartGame() {
    if (!ranked) { beginGame(); return }
    if (startRequest.current || submissionBlocksStart) return
    const controller = new AbortController()
    startRequest.current = controller
    startKey.current ||= crypto.randomUUID()
    setStarting(true)
    setStartError('')
    ranked.setActive(true)
    void ranked.service.start(startKey.current, controller.signal).then(server => {
      if (controller.signal.aborted) return
      startKey.current = ''
      beginGame(server)
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      if (typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false) startKey.current = ''
      setStartError(error instanceof Error ? error.message : '게임을 시작하지 못했어요.')
      ranked.setActive(false)
    }).finally(() => {
      if (controller.signal.aborted) return
      startRequest.current = null
      setStarting(false)
    })
  }

  function startGame() {
    if (round.phase.kind === 'menu') restartGame()
  }

  function openRanking(event: MouseEvent<HTMLButtonElement>) {
    rankingTrigger.current = event.currentTarget
    if (ranked) setLiveRanking({ kind: 'loading' })
    setRankingOpen(true)
  }

  function quitGame() {
    if (ranked) {
      exitDialog.current?.close()
      ranked.onExit()
      return
    }
    controlsRef.current.paused = false
    setRopePaused(false)
    resetScene('menu')
    stageRef.current?.focus({ preventScroll: true })
  }

  function toggleRope() {
    const controls = controlsRef.current
    const paused = !controls.paused
    const now = performance.now()
    step(now, paused ? 0 : controls.settings.ropeSpeed)
    const preview = manholePreviewRef.current
    if (preview && paused) preview.pausedAt = now
    else if (preview?.pausedAt != null) {
      preview.pausedMs += now - preview.pausedAt
      preview.pausedAt = null
    }
    controls.paused = paused
    setRopePaused(paused)
  }

  function toggleSimulation() {
    if (manholePreviewRef.current) return
    const wallNow = performance.now()
    const now = sceneTime(wallNow)
    const simulation = simulationRef.current
    if (simulation) {
      if (round.phase.kind === 'initialCountdown' && round.phase.endsAt !== undefined) {
        round.phase.endsAt += now - simulation.startedAt
      }
      simulationRef.current = null
      step(wallNow)
      setSimulating(false)
      return
    }
    if (!canRunRoundPreview(round)) return
    step(wallNow, 0)
    if (!canRunRoundPreview(round)) return
    simulationRef.current = { angle: round.motion.angle, startedAt: now, lastAt: now, sampleSeconds }
    setSimulating(true)
  }

  function updateSettings(change: Partial<PreviewSettings>) {
    const controls = controlsRef.current
    const next = { ...controls.settings, ...change }
    step(performance.now(), controls.paused ? 0 : next.ropeSpeed)
    controls.settings = next
    setSettings(next)
  }

  const windowMs = clearanceWindowMs(jumpHeight, jumpDuration * 1000, settings)
  const demoHud = demo && (!lastPass || demo.startedAt >= lastPass.at) ? hudSamples[demo.action] : undefined
  const inMenu = cue === 'menu'
  const countdown = cue === '3' || cue === '2' || cue === '1' || cue === 'GO!' ? cue : null
  const canPreviewSuccess = inMenu || cue === 'playing' || countdown !== null
  const livePeriod = ropePeriodMs(settings.ropeSpeed, settings.autoAcceleration ? { profile: settings, playedMs: hud.playedMs } : undefined)
  const samplePeriod = ropePeriodMs(settings.ropeSpeed, settings.autoAcceleration ? { profile: settings, playedMs: sampleSeconds * 1000 } : undefined)
  const periodLabel = (period: number) => Number.isFinite(period) ? `${Math.round(period)} ms/회` : '정지'
  const reactionPeriod = simulating ? samplePeriod : livePeriod
  const reactionTimings = (['good', 'perfect', 'combo5', 'combo10'] as const).map((kind, index) => {
    const ms = successDurationMs(kind, reactionPeriod)
    const label = ['GOOD', 'PERFECT', '5~9', '10+'][index]
    return `${label} ${ms ? `${Math.round(ms)}ms` : '생략'}`
  }).join(' · ')
  const paused = ropePaused || settings.ropeSpeed === 0
  const status = showManholePreview ? '하수구 탈출 미리보기'
    : finalePreview ? finalePreview.reason === 'time' ? '완주 엔딩 미리보기' : '게임 오버 연출 미리보기'
    : simulating ? '가속 시뮬레이션' : cue === 'ended' ? '게임 종료' : cue === 'completion' ? '완주 엔딩'
    : cue === 'gameOver' || cue === 'gameOverSplash' ? '게임 오버 연출' : cue === 'landing' ? '착지 중' : cue === 'reaction' ? '비둘기 비웃음'
    : inMenu ? '메인 화면 · 시작 대기' : cue === 'GO!' ? '시작' : countdown ? paused ? '시작 대기 · 회전 일시 정지' : '시작 카운트다운'
      : paused ? '회전 일시 정지' : '플레이 중'
  const previewResult = finalePreview?.stage === 'result'
  const resultReason = previewResult ? finalePreview.reason : cue === 'ended' ? hud.endReason : null
  const showSplash = finalePreview?.stage === 'splash' || cue === 'gameOverSplash' || resultReason === 'missLimit'
  const canSampleHud = !hud.endReason && !finalePreview
  const sampleHud = canSampleHud && hudPreset !== 'live' ? hudPresets[hudPreset] : null
  const sampleJudgement = canSampleHud ? hudJudgement : null
  const liveFeedback = sampleHud ? null : visiblePass
  const legacyHud = sampleHud ? undefined : demoHud
  const showMenu = inMenu && !hideMenuForPreview && !finalePreview && !showManholePreview && !simulating && !sampleHud && !sampleJudgement
  const showRanking = showMenu && rankingOpen
  const settlement = ranked?.settlement
  const submissionBlocksStart = settlement?.status === 'saving' || (settlement?.status === 'failed' && settlement.retryable)
  const currentSettlement = settlement?.id === sessionRef.current?.id ? settlement : undefined
  const receipt = currentSettlement?.status === 'saved' ? currentSettlement.receipt : undefined
  const saveStatus = settlement?.status === 'saving' ? '서버에서 기록을 확정하는 중입니다.'
    : settlement?.status === 'failed' ? settlement.message : undefined
  const retry = settlement?.status === 'failed' && settlement.retryable ? ranked?.retry : undefined

  const stage = <section ref={stageRef} className="preview-stage" aria-label="3D 줄넘기 무대" tabIndex={showRanking ? undefined : 0}>
          <Canvas
            camera={{ fov: defaults.fov, near: 0.1, far: 40 }}
            dpr={[1, 1.5]}
            fallback={<p className="canvas-fallback">이 브라우저에서 3D 화면을 열 수 없습니다.</p>}
          >
            <PreviewScene settings={settings} demoRef={demoRef} successDemoRef={successDemoRef} simulationRef={simulationRef}
              sampleDistraction={sampleDistractionFrame} round={round} step={step} sceneTime={sceneTime} getFinalePreview={getFinalePreview} />
          </Canvas>
          {!showMenu && <JumpRopeHud
            seconds={sampleHud?.seconds ?? hud.seconds}
            score={receipt?.score ?? sampleHud?.score ?? hud.stats.score}
            combo={sampleHud?.combo ?? hud.stats.combo}
            chances={sampleHud?.chances ?? hud.stats.chances}
            judgement={sampleJudgement?.kind ?? liveFeedback?.kind ?? legacyHud?.judgement}
            earnedPoints={sampleJudgement?.earnedPoints ?? liveFeedback?.earnedPoints ?? legacyHud?.earnedPoints}
            note={liveFeedback || sampleJudgement ? undefined : legacyHud?.note}
            feedbackKey={sampleJudgement ? `sample-${sampleJudgement.at}`
              : liveFeedback ? `live-${liveFeedback.number}` : demo ? `demo-${demo.startedAt}` : undefined}
            sample={sampleHud !== null || sampleJudgement !== null}
          />}
          {showMenu && <JumpRopeMenu onStart={startGame} onOpenRanking={openRanking} rankingOpen={showRanking}
            startDisabled={starting || submissionBlocksStart} status={starting ? '서버 라운드를 준비하는 중입니다.' : startError || saveStatus} onRetry={retry} />}
          {showRanking && <JumpRopeRanking state={ranked ? liveRanking : rankingPreviewStates[rankingMode]} onClose={() => setRankingOpen(false)} />}
          {countdown && !paused && !simulating && !finalePreview && !showManholePreview && !sampleHud && !sampleJudgement &&
            <div className="rope-countdown" role="status" aria-label="시작 카운트다운">{countdown}</div>}
          {showSplash && <GameOverSplash />}
          {finalePreview && !previewResult && <button className="finale-preview-close" type="button" onClick={() => closeFinalePreview(performance.now())}>미리보기 닫기</button>}
          {resultReason && <JumpRopeResult reason={receipt?.endReason ?? resultReason} stats={ranked ? receipt : hud.stats} reward={receipt?.reward}
            status={starting ? '서버 라운드를 준비하는 중입니다.' : startError || saveStatus} onRetry={retry}
            restartDisabled={starting || submissionBlocksStart} onQuit={quitGame} onRestart={restartGame} />}
           {confirmExit && <dialog ref={exitDialog} className="rope-exit-confirm" role="alertdialog"
             aria-labelledby="rope-exit-title" aria-describedby="rope-exit-description"
             onCancel={event => { event.preventDefault(); event.stopPropagation() }}>
             <h2 id="rope-exit-title" ref={exitTitle} tabIndex={-1}>게임을 그만둘까요?</h2>
             <p id="rope-exit-description">현재 플레이 기록은 저장되지 않으며, 엽전도 지급되지 않습니다.</p>
             {starting && <p role="status">새 라운드를 준비하는 중입니다.</p>}
             {startError && <p role="alert">{startError}</p>}
             <div className="rope-exit-confirm__actions">
               <button type="button" onClick={quitGame}>그만하기</button>
               <button type="button" onClick={restartGame} disabled={starting}>다시하기</button>
             </div>
           </dialog>}
        </section>
  if (ranked) return stage

  return (
    <main className="preview">
      <header className="preview-header" inert={showRanking}>
        <div>
          <p className="eyebrow">ONTOP / 개발 프리뷰</p>
          <h1>구구구 줄넘기</h1>
        </div>
        <p className="preview-tag">06 · 비둘기 반응</p>
      </header>
      <div className="preview-layout">
        {stage}
        <aside className="preview-panel" aria-label="실시간 조정 패널" inert={finalePreview !== null || showRanking}>
          <h2>실시간 조정</h2>
          <p className="panel-note" aria-label="현재 게임 상태">현재 상태 · {status}</p>
          {previewResult && <p className="panel-note">Esc로 결과 시안을 닫을 수 있습니다.</p>}
          <p className="panel-note">Space로 점프합니다. 높이와 체공 시간은 다음 점프부터 적용됩니다.</p>
          {inMenu && <label className="audience-toggle">
            <input type="checkbox" checked={hideMenuForPreview} onChange={event => setHideMenuForPreview(event.currentTarget.checked)} />
            대기 중 메인 화면 숨기기 (개발용)
          </label>}
          {inMenu && <fieldset>
            <legend>랭킹 프리뷰</legend>
            <label className="audience-toggle">
              표시 상태
              <select value={rankingMode} onChange={event => setRankingMode(event.currentTarget.value as typeof rankingMode)}>
                <option value="ready">정상 · 샘플 데이터</option>
                <option value="loading">로딩</option>
                <option value="empty">빈 목록</option>
                <option value="error">오류</option>
              </select>
            </label>
          </fieldset>}
          <fieldset disabled={!canSampleHud}>
            <legend>플레이 HUD 미리보기</legend>
            <label className="audience-toggle">
              HUD 표시 데이터
              <select value={hudPreset} onChange={event => {
                setHudPreset(event.currentTarget.value as HudPreset)
                setHudJudgement(null)
              }}>
                <option value="live">실제 플레이</option>
                {Object.entries(hudPresets).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
              </select>
            </label>
            <p className="panel-note">샘플 값과 판정은 HUD에만 표시됩니다.</p>
            <div className="demo-actions">
              {(['perfect', 'good', 'miss'] as const).map(kind => (
                <button key={kind} type="button" onClick={() => {
                  const combo = Math.max(1, sampleHud?.combo ?? round.stats.combo + 1)
                  setHudJudgement({ kind, earnedPoints: pointsForPass(kind, combo), at: performance.now() })
                  stageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
                }}>{kind.toUpperCase()} 표시</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>비둘기 반응 미리보기</legend>
            <p className="panel-note" aria-label="성공 반응 재생 시간">{periodLabel(reactionPeriod)} 기준 · {reactionTimings}</p>
            <div className="demo-actions">
              {(Object.keys(successDemoActions) as PigeonSuccessKind[]).map(kind => (
                <button key={kind} type="button" disabled={!canPreviewSuccess} onClick={() => startSuccessDemo(kind)}>
                  {successDemoActions[kind]}
                </button>
              ))}
              <button type="button" onClick={startLaughDemo}>비둘기 웃음 테스트</button>
              <button type="button" disabled={!canPreviewSuccess} onClick={startShockDemo}>MISS 감전 효과 미리보기</button>
              <button type="button" disabled={!canPreviewSuccess} onClick={() => startFinalePreview('missLimit')}>3번째 MISS 게임 오버 연출 미리보기</button>
              <button type="button" disabled={!canPreviewSuccess} onClick={() => startFinalePreview('time')}>60초 완주 엔딩 미리보기</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>비둘기 시야 방해</legend>
            <label className="audience-toggle">
              <input type="checkbox" checked={automaticDistraction} onChange={event => setAutomaticDistraction(event.currentTarget.checked)} />
              자동 방해 이벤트
            </label>
            <label className="audience-toggle">
              고정 시드 (다음 판)
              <input type="text" inputMode="numeric" maxLength={10} value={fixedSeed} placeholder="비워 두면 무작위"
                aria-invalid={fixedSeed !== '' && parseDistractionSeed(fixedSeed) === null} onChange={event => setFixedSeed(event.currentTarget.value)} />
            </label>
            <div className="panel-note" aria-label="자동 방해 일정">
              <div>현재 시드 {distractionSchedule.seed} · 발생 {distractionSchedule.startedCount}/{distractionSchedule.events.length}</div>
              {distractionSchedule.events.map(event => (
                <div key={event.atMs}>{(event.atMs / 1000).toFixed(2)}초 · {distractionLabels[event.kind]} · {eventLabels[event.status]}</div>
              ))}
            </div>
            <div className="demo-actions">
              <button type="button" disabled={!canPreviewSuccess || showManholePreview || distractionSchedule.active !== null} onClick={() => startDistraction('flight')}>비둘기 비행 방해 테스트</button>
              <button type="button" disabled={!canPreviewSuccess || showManholePreview || distractionSchedule.active !== null} onClick={() => startDistraction('walk')}>비둘기 걷기 방해 테스트</button>
              <button type="button" disabled={!canPreviewSuccess || showManholePreview || simulating || distractionSchedule.active !== null}
                onClick={() => startDistraction('manhole')}>하수구 비둘기 탈출 미리보기</button>
            </div>
            <label className="audience-toggle">
              이동 방향
              <select value={distractionDirection} onChange={event => setDistractionDirection(event.currentTarget.value === '-1' ? -1 : 1)}>
                <option value={1}>좌 → 우</option>
                <option value={-1}>우 → 좌</option>
              </select>
            </label>
            {distractionSliders.map(([key, label, min, max, increment, unit]) => (
              <label className="slider" key={key}>
                <span>{label}</span>
                <input type="range" min={min} max={max} step={increment} value={distractionSettings[key]} onChange={event => {
                  const value = event.currentTarget.valueAsNumber
                  setDistractionSettings(current => ({ ...current, [key]: value }))
                }} />
                <output>{distractionSettings[key]}{unit}</output>
              </label>
            ))}
          </fieldset>
          {controls.map(group => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              {group.sliders.map(([key, label, min, max, increment, unit]) => (
                <label className="slider" key={key}>
                  <span>{key === 'ropeSpeed' && settings.autoAcceleration ? '줄 회전 배율' : label}</span>
                  <input
                    type="range"
                    min={key === 'startPeriodMs' ? settings.endPeriodMs : min}
                    max={key === 'endPeriodMs' ? settings.startPeriodMs : max}
                    step={increment}
                    value={settings[key]}
                    onChange={event => {
                      const value = event.currentTarget.valueAsNumber
                      updateSettings({ [key]: value })
                    }}
                  />
                  <output>{settings[key]}{key === 'ropeSpeed' && settings.autoAcceleration ? '×' : unit}</output>
                </label>
              ))}
              {group.title === '줄 가속' && (
                <>
                  <label className="audience-toggle">
                    <input type="checkbox" checked={settings.autoAcceleration} onChange={event => updateSettings({ autoAcceleration: event.currentTarget.checked })} />
                    자동 가속
                  </label>
                  <p className="panel-note" aria-label="현재 가속 상태">실제 {(hud.playedMs / 1000).toFixed(1)}초 · {periodLabel(livePeriod)}</p>
                  <label className="slider">
                    <span>시뮬레이션 시간</span>
                    <input type="range" min={0} max={roundDurationMs / 1000} value={sampleSeconds} onChange={event => {
                      const seconds = event.currentTarget.valueAsNumber
                      if (simulationRef.current) simulationRef.current.sampleSeconds = seconds
                      setSampleSeconds(seconds)
                    }} />
                    <output>{sampleSeconds}초</output>
                  </label>
                  <p className="panel-note" aria-label="시뮬레이션 회전 주기">미리보기 · {periodLabel(samplePeriod)}</p>
                  <div className="demo-actions">
                    <button type="button" disabled={!simulating && !canPreviewSuccess} aria-pressed={simulating} onClick={toggleSimulation}>
                      {simulating ? '가속 시뮬레이션 종료' : '가속 시뮬레이션 시작'}
                    </button>
                  </div>
                </>
              )}
              {group.title === '전깃줄과 비둘기' && (
                <label className="audience-toggle">
                  <input
                    type="checkbox"
                    checked={settings.audience}
                    onChange={event => {
                      const audience = event.currentTarget.checked
                      updateSettings({ audience })
                    }}
                  />
                  관중 비둘기 표시
                </label>
              )}
              {group.title === '판정 조정' && (
                <p className="panel-note">
                  {windowMs
                    ? `통과 ${Math.round(windowMs.latest)}~${Math.round(windowMs.earliest)}ms 전 입력으로 줄을 넘을 수 있습니다. PERFECT 중심은 ${Math.round(windowMs.ideal)}ms 전입니다.`
                    : '현재 점프 높이로는 줄을 넘을 수 없습니다.'}
                </p>
              )}
            </fieldset>
          ))}
          <fieldset>
            <legend>마지막 판정</legend>
            {lastPass ? (
              <div className="panel-note" aria-label="실제 판정 상세">
                <strong>{lastPass.number}번째 통과 · {lastPass.kind.toUpperCase()}</strong>
                <div>입력 → 통과 {lastPass.inputLeadMs === null ? '입력 없음' : `${Math.round(lastPass.inputLeadMs)}ms`}</div>
                <div>발 {lastPass.footHeight.toFixed(3)}m · 필요 {lastPass.requiredHeight.toFixed(3)}m</div>
              </div>
            ) : <p className="panel-note">아직 줄이 발밑을 통과하지 않았습니다.</p>}
          </fieldset>
          <div className="demo-actions" aria-label="연출 테스트">
            {(Object.keys(demoActions) as DemoAction[]).map(action => (
              <button key={action} type="button" onClick={() => startDemo(action)}>
                {demoActions[action]}
              </button>
            ))}
            <button type="button" disabled={inMenu && !showManholePreview} onClick={toggleRope}>
              {ropePaused ? '줄 회전 재생' : '줄 회전 일시 정지'}
            </button>
            <button className="reset-button" type="button" onClick={() => resetScene(inMenu ? 'menu' : 'initialCountdown')}>게임 상태 초기화</button>
          </div>
        </aside>
      </div>
    </main>
  )
}
