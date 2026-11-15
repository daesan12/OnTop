import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { installBrowserShortcutGuard } from './browserShortcuts'
import { NotificationCenter } from '../features/notifications/NotificationCenter'
import { SkinCatalogLifecycle } from '../features/skins/SkinCatalogLifecycle'
import { ParkScene } from './ParkScene'
import { ParkBgm } from '../audio/ParkBgm'
import { ParkSfx } from '../audio/ParkSfx'
import './park.css'
import './scene.css'
import '../features/parkMenus/hud.css'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../network/worldClient'
import { ParkRuntimeProvider } from './runtime/ParkRuntime'
import { ParkTools } from './ParkTools'
import type { QualityPreset } from '../config'
import { useMobility } from '../features/mobility/state'
import { MobilityHud } from '../features/mobility/MobilityHud'
import { ParkInteractionHint } from '../features/interactions/ParkInteractionHint'
import { BALLOON_RIDE_ENABLED } from './mapSelection'
import { ConstructionNotice } from '../features/construction/ConstructionNotice'
import { FortunePanel } from '../features/fortune/FortunePanel'
import { EmoteWheel } from '../features/emotes/EmoteWheel'
import { TelescopePanel } from '../features/telescopes/TelescopePanel'
import { FeedbackPanel } from '../features/feedback/FeedbackPanel'
import { PolicePrivateNotice } from '../features/ai/PolicePrivateNotice'
import { AnonymousNotes } from '../features/notes/AnonymousNotes'
import { ManualHost } from '../features/manual/ManualHost'
import { FacilityStatus } from '../features/facilities/FacilityStatus'
import { ManualWorldActions } from '../features/manual/ManualWorldActions'
import { SettingsLauncher } from '../performance/GraphicsSettings'
import { ParkMap } from '../features/navigation/ParkMap'
import { ParkNavigation } from '../features/navigation/NavigationHud'
import { useBungeoppang, watchBungeoppangRecovery } from '../features/bungeoppang/store'
import { getPreloadedBungeoppangHud, loadBungeoppangHud } from '../features/bungeoppang/loadBungeoppangView'
import { ShopHost } from '../features/shop/ShopHost'
import { WardrobeLauncher, WardrobeHost } from '../features/wardrobe/WardrobeHost'
import { AdvertisementLink } from '../features/advertisements/AdvertisementLink'
import { CameraControls } from '../features/camera/CameraControls'
import { ParkXRControls } from '../features/parkXR/ParkXRControls'
import { FollowMenu } from '../features/follow/FollowMenu'
import { ParkChat } from '../features/chat/ParkChat'
import { useDisplayGame as useGame } from '../game/displayGame'
import { OmokFeedback, SpectatorChat } from '../game/omok/OmokFeedback'
import { ChannelMenu } from '../features/parkMenus/ChannelMenu'
import { ChannelEntryGate } from '../features/parkMenus/ChannelEntryGate'
import { AccountMenu } from '../features/parkMenus/AccountMenu'
import { RewardCoinFlight } from '../features/wallet/RewardCoinFlight'
import { useWalletSync } from '../features/wallet/useWalletSync'
import { LocationChip } from '../features/parkMenus/LocationChip'
import { JumpmapHud } from '../features/jumpmap/JumpmapHud'
import { useJumpmapController } from '../features/jumpmap/useJumpmapController'
import { useStore } from 'zustand'
import { ParkVrZone } from '../features/vrZone/ParkVrZone'
import { parkVrZone } from '../features/vrZone/parkBridge'
import { RankingBoardHost } from '../features/rankingBoard/RankingBoardHost'
import { SpeedMoleHost } from '../features/speedMole/SpeedMoleHost'
import { JumpRopeHost } from '../features/jumpRope/JumpRopeHost'
import { jumpRopeSettlementActive, useJumpRope } from '../features/jumpRope/store'
import { ParkWelcomeStory } from '../features/welcomeStory/ParkWelcomeStory'
import { WelcomeTour } from '../features/welcomeTour/WelcomeTour'
import { BehaviorReporter } from '../features/behaviorLog/BehaviorReporter'
import { EntryNewsPopup } from '../features/announcements/EntryNewsPopup'
import { AiResidentsHost } from '../features/ai/AiResidentsHost'
import { AnnouncementBanner } from '../features/announcements/AnnouncementBanner'
import { WinnerContactsHost } from '../features/winnerContacts/WinnerContactsHost'
import { useArcade } from '../features/arcade/store'
import { MoleModePicker } from '../features/arcade/MoleModePicker'
import { closeSpotDifference, useSpotDifference } from '../features/spotDifference/store'
import { useMole } from '../features/mole/store'
import { usePlusMinus } from '../features/plusMinus/store'
import { useRpsRoulette } from '../features/rpsRoulette/store'
import { useSpeedMole } from '../features/speedMole/store'
import { GachaLifecycle } from '../features/gacha/GachaLifecycle'
import { useGachaOverlay } from '../features/gacha/view'
import { useParkGameplayActive } from '../features/operation/parkGameplay'
import { useParkOperationGate } from '../features/operation/useParkOperationGate'
import type { ServiceOperationStatus } from '../features/operation/serviceOperation'


const LocalBalloonHud = lazy(() => import('../features/balloon/LocalBalloonHud'))
const ArcadePicker = lazy(() => import('../features/arcade/ArcadePicker').then(module => ({ default: module.ArcadePicker })))
const SpotDifferencePanel = lazy(() => import('../features/spotDifference/SpotDifferencePanel').then(module => ({ default: module.SpotDifferencePanel })))
const LazyBungeoppangHud = lazy(loadBungeoppangHud)
function BungeoppangHud() {
  // Reuse a HUD already loaded on approach without re-entering the lazy fallback.
  const [Hud] = useState(() => getPreloadedBungeoppangHud() ?? LazyBungeoppangHud)
  return <Hud />
}
const MolePanel = lazy(() => import('../features/mole/MolePanel').then(module => ({ default: module.MolePanel })))
const PlusMinusPanel = lazy(() => import('../features/plusMinus/PlusMinusPanel').then(module => ({ default: module.PlusMinusPanel })))
const RpsRoulettePanel = lazy(() => import('../features/rpsRoulette/RpsRoulettePanel').then(module => ({ default: module.RpsRoulettePanel })))

const shortcuts = [
  { key: 'WASD', action: '이동' },
  { key: 'Shift', action: '달리기' },
  { key: 'Space', action: '점프' },
  { key: 'E', action: '상호작용' },
  { key: 'Enter', action: '채팅' },
  // The camera buttons were removed; their shortcuts are listed here instead.
  { key: 'V', action: '3인칭' },
  { key: 'Ctrl', action: '마우스 룩' },
]

function getHudScale(): number {
  if (window.innerWidth <= 900) return 1
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080)
}

type ParkProps = {
  onExit: () => void
  exitError: string
  onAuthEnded: () => void
  onOperationBlocked: (status: ServiceOperationStatus) => void
  welcomeStoryDeadline?: number | null
  onWelcomeStoryComplete?: () => void
}
export function ParkPage(props: ParkProps) {
  useLayoutEffect(() => {
    // Keep local debugging available; explicit opt-in exercises the production guard in QA.
    if (import.meta.env.PROD || import.meta.env.VITE_BROWSER_SHORTCUT_GUARD === 'true')
      return installBrowserShortcutGuard()
  }, [])
  return <ParkRuntimeProvider onAuthEnded={props.onAuthEnded}><ParkContent {...props}/></ParkRuntimeProvider>
}
function ParkContent({ onExit, exitError, onAuthEnded, onOperationBlocked, welcomeStoryDeadline, onWelcomeStoryComplete }: ParkProps) {
  const riding = useMobility(s => s.phase === 'riding' || s.phase === 'ending')
  useWalletSync()
  useJumpmapController()
  useEffect(watchBungeoppangRecovery, [])
  const [entryNewsHost,setEntryNewsHost]=useState<HTMLDivElement|null>(null)
  const gameplayActive = useParkGameplayActive()
  const jumpRopeSaving = useJumpRope(jumpRopeSettlementActive)
  useParkOperationGate(gameplayActive || jumpRopeSaving, onOperationBlocked)
  const vrPhase = useStore(parkVrZone.store, state => state.phase)
  const bungeoppang = useBungeoppang(s => s.phase !== 'idle')
  const breadRecovery = useBungeoppang(s => s.recoveryDeferred)
  const arcadeScope = useArcade(s => s.open ? s.scope : null)
  const arcadeOpen = arcadeScope === 'all'
  const spotDifferenceOpen = useSpotDifference(s => s.open)
  useEffect(() => closeSpotDifference, [])
  const moleOpen = useMole(s => s.open)
  const plusMinusOpen = usePlusMinus(s => s.open)
  const rpsOpen = useRpsRoulette(s => s.open)
  const speedMoleOpen = useSpeedMole(s => s.open)
  const jumpRopeOpen = useJumpRope(s => s.open)
  const gachaOpen = useGachaOverlay(s => s.surface !== null)
  const hideAnnouncements = gameplayActive || bungeoppang || vrPhase !== 'closed'
    || !!arcadeScope || moleOpen || plusMinusOpen || rpsOpen || speedMoleOpen || jumpRopeOpen || spotDifferenceOpen || gachaOpen
  const omokFocus = useGame(s => (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING') && !s.lastResult)
  const omokChat = useGame(s => (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING') && !s.lastResult)
  const stoneOverlay = useGame(s => {
    if (!s.game?.stone && !(s.start?.gameCode === 'STONE_RUMBLE' && ['PLAYING', 'SETTLING'].includes(s.start.phase))) return 'none'
    return s.game?.role === 'PLAYER' && (s.game.stone?.status === 'FINISHED' || s.result || s.lastResult) ? 'result' : 'game'
  })
  const seated = useSession(s => !!s.tableId && s.seatIndex >= 0
    && !!s.tableStates[s.tableId]?.seats.some(seat => seat.userId === s.sessionId))
  // GamePanel의 돌탑 전체 화면/결과가 덮는 동안만 공원 렌더를 멈춘다. 퇴장 후 잔여 결과는 공원을 가리지 않는다.
  const stoneFocus = stoneOverlay === 'game' || stoneOverlay === 'result' && seated
  const session = useSession(useShallow(s=>({ sessionId:s.sessionId,roomId:s.roomId })))
  // Everyone plays on the Low preset; the graphics choice is not offered.
  const quality: QualityPreset = 'low'
  const [hudScale, setHudScale] = useState(getHudScale)
  const [winningsOpen, setWinningsOpen] = useState(false)
  const [winningsRefresh, setWinningsRefresh] = useState(0)
  const [winningsWeek, setWinningsWeek] = useState<string | null>(null)
  const autoOpenWinnings = useCallback(() => setWinningsOpen(true), [])

  useEffect(() => {
    const updateScale = () => setHudScale(getHudScale())
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return (
    <main className="park-page" aria-label="공원 기본 화면" data-bungeoppang={bungeoppang} data-omok-focus={omokFocus}
      onContextMenu={event => {
        // Keep text editing menus and in-game avatar menus usable.
        if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return
        event.preventDefault()
      }}
      onDragStart={event => {
        if (event.target instanceof Element && event.target.closest('img, canvas')) event.preventDefault()
      }}
      style={{
      '--park-ui-scale': hudScale,
      '--park-edge': `${20 * hudScale}px`,
    } as CSSProperties}>
      <ParkScene quality={quality} active={!jumpRopeOpen && !stoneFocus} />
      <ParkBgm />
      <ParkSfx />
      <RewardCoinFlight />
      <ChannelEntryGate />
      <AiResidentsHost />
      <AnnouncementBanner hidden={hideAnnouncements} />
      <EntryNewsPopup hidden={hideAnnouncements || welcomeStoryDeadline != null} launcherHost={entryNewsHost} />
      {welcomeStoryDeadline != null && onWelcomeStoryComplete &&
        <ParkWelcomeStory blocked={hideAnnouncements} deadline={welcomeStoryDeadline} onComplete={onWelcomeStoryComplete} />}
      <GachaLifecycle />
      <SkinCatalogLifecycle />
      <NotificationCenter key={session.sessionId} hidden={gameplayActive} newsHostRef={setEntryNewsHost}
        onOpenWinnings={week => { setWinningsWeek(week); setWinningsRefresh(value => value + 1); setWinningsOpen(true) }} />
      {!omokFocus && <div className="park-weather-placement"><LocationChip /></div>}
      <div className="park-hud">
        {!omokFocus && <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
          <ChannelMenu />
          {/* 빠른 메뉴: each feature keeps its own launcher, placed into a slot by CSS. */}
          <div className="park-quick-dock" aria-hidden="true" />
          <div className="park-dock-settings"><SettingsLauncher /></div>
          <div className="park-dock-wardrobe"><WardrobeLauncher /></div>
        </div>}
        {!omokFocus && <div inert={bungeoppang}>
          <AccountMenu exitError={exitError} onExit={onExit} onWithdrawn={onAuthEnded}
            onOpenWinnings={() => { setWinningsWeek(null); setWinningsOpen(true); setWinningsRefresh(value => value + 1) }} />
        </div>}

        <div className="park-chat-layer" hidden={bungeoppang} inert={bungeoppang}>
          {omokChat ? <SpectatorChat /> : !omokFocus && <ParkChat key={`${session.sessionId}:${session.roomId}`} />}
        </div>

        {!omokFocus && <aside className="park-shortcuts" aria-label="조작 방법">
          {shortcuts.map(({ key, action }) => (
            <div className="park-shortcuts__item" key={key}><kbd>{key}</kbd><span>{riding && key === 'Space' ? '하차' : action}</span></div>
          ))}
        </aside>}
      </div>
      <BehaviorReporter quality={quality} />
      <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
        <ParkTools />
        <ParkInteractionHint />
        <MobilityHud />
        <PolicePrivateNotice />
        <div hidden={omokFocus} inert={omokFocus}>
        <WelcomeTour />
        <ConstructionNotice />
        {BALLOON_RIDE_ENABLED && <Suspense fallback={null}><LocalBalloonHud /></Suspense>}
        <FortunePanel />
        {arcadeScope === 'mole' && <MoleModePicker />}
        {(rpsOpen || arcadeOpen || plusMinusOpen || moleOpen) && <Suspense fallback={<p role="status">게임을 불러오는 중입니다.</p>}>
          {rpsOpen && <RpsRoulettePanel />}
          {arcadeOpen && <ArcadePicker />}
          {plusMinusOpen && <PlusMinusPanel />}
          {moleOpen && <MolePanel />}
        </Suspense>}
        <SpeedMoleHost />
        <JumpRopeHost />
        {spotDifferenceOpen && <Suspense fallback={<p role="status">사격장을 불러오는 중입니다.</p>}>
          <SpotDifferencePanel />
        </Suspense>}
        <FacilityStatus />
        <EmoteWheel />
        <TelescopePanel />
        <FeedbackPanel />
        <AnonymousNotes />
        <ShopHost />
        <WardrobeHost />
        <AdvertisementLink />
        <CameraControls />
        <ParkXRControls />
        <FollowMenu />
        <ParkMap />
        <ParkNavigation />
        <JumpmapHud />
        </div>
      </div>
      <ParkVrZone />
      {(bungeoppang || breadRecovery) && <Suspense fallback={<p role="status">붕어빵 가게를 불러오는 중입니다.</p>}><BungeoppangHud /></Suspense>}
      <OmokFeedback />
      <RankingBoardHost />
      <ManualHost showLauncher={!omokFocus} worldActions={bungeoppang || omokFocus ? undefined : <ManualWorldActions />} />
      <WinnerContactsHost open={winningsOpen} refreshKey={winningsRefresh} selectedWeek={winningsWeek}
        onAutoOpen={autoOpenWinnings} onClose={() => setWinningsOpen(false)} />
    </main>
  )
}
