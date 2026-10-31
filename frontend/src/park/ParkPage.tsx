import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { installBrowserShortcutGuard } from './browserShortcuts'
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
import { ParkInteractionHint } from '../features/interactions/ParkInteractionHint'
import { ConstructionNotice } from '../features/construction/ConstructionNotice'
import { EmoteWheel } from '../features/emotes/EmoteWheel'
import { TelescopePanel } from '../features/telescopes/TelescopePanel'
import { FeedbackPanel } from '../features/feedback/FeedbackPanel'
import { AnonymousNotes } from '../features/notes/AnonymousNotes'
import { ManualHost } from '../features/manual/ManualHost'
import { FacilityStatus } from '../features/facilities/FacilityStatus'
import { ManualWorldActions } from '../features/manual/ManualWorldActions'
import { SettingsLauncher } from '../performance/GraphicsSettings'
import { ParkMap } from '../features/navigation/ParkMap'
import { ParkNavigation } from '../features/navigation/NavigationHud'
import { BungeoppangHud } from '../features/bungeoppang/BungeoppangHud'
import { useBungeoppang } from '../features/bungeoppang/store'
import { ShopHost } from '../features/shop/ShopHost'
import { WardrobeLauncher, WardrobeHost } from '../features/wardrobe/WardrobeHost'
import { AdvertisementLink } from '../features/advertisements/AdvertisementLink'
import { CameraControls } from '../features/camera/CameraControls'
import { FollowMenu } from '../features/follow/FollowMenu'
import { ParkChat } from '../features/chat/ParkChat'
import { useGame } from '../game/store'
import { OmokFeedback, SpectatorChat } from '../game/omok/OmokFeedback'
import { ChannelMenu } from '../features/parkMenus/ChannelMenu'
import { AccountMenu } from '../features/parkMenus/AccountMenu'
import { RewardCoinFlight } from '../features/wallet/RewardCoinFlight'
import { LocationChip } from '../features/parkMenus/LocationChip'
import { JumpmapHud } from '../features/jumpmap/JumpmapHud'
import { useJumpmapController } from '../features/jumpmap/useJumpmapController'

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

type ParkProps = { onExit: () => void; exitError: string; onAuthEnded: () => void }
export function ParkPage(props: ParkProps) {
  useLayoutEffect(() => {
    // Keep local debugging available; explicit opt-in exercises the production guard in QA.
    if (import.meta.env.PROD || import.meta.env.VITE_BROWSER_SHORTCUT_GUARD === 'true')
      return installBrowserShortcutGuard()
  }, [])
  return <ParkRuntimeProvider onAuthEnded={props.onAuthEnded}><ParkContent {...props}/></ParkRuntimeProvider>
}
function ParkContent({ onExit, exitError, onAuthEnded }: ParkProps) {
  useJumpmapController()
  const bungeoppang = useBungeoppang(s => s.phase !== 'idle')
  const omokFocus = useGame(s => (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING') && !s.lastResult)
  const omokChat = useGame(s => (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING') && !s.lastResult)
  const session = useSession(useShallow(s=>({ sessionId:s.sessionId,roomId:s.roomId })))
  // Everyone plays on the Low preset; the graphics choice is not offered.
  const quality: QualityPreset = 'low'
  const [hudScale, setHudScale] = useState(getHudScale)

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
      <ParkScene quality={quality} />
      <ParkBgm />
      <ParkSfx />
      <RewardCoinFlight />
      <div className="park-hud">
        {!omokFocus && <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
          <ChannelMenu />
          {/* 빠른 메뉴: each feature keeps its own launcher, placed into a slot by CSS. */}
          <div className="park-quick-dock" aria-hidden="true" />
          <div className="park-dock-settings"><SettingsLauncher /></div>
          <div className="park-dock-wardrobe"><WardrobeLauncher /></div>
          <LocationChip />
        </div>}
        {!omokFocus && <div inert={bungeoppang}>
          <AccountMenu exitError={exitError} onExit={onExit} onWithdrawn={onAuthEnded} />
        </div>}

        <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
          {omokChat ? <SpectatorChat /> : !omokFocus && <ParkChat key={`${session.sessionId}:${session.roomId}`} />}
        </div>

        {!omokFocus && <aside className="park-shortcuts" aria-label="조작 방법">
          {shortcuts.map(({ key, action }) => (
            <div className="park-shortcuts__item" key={key}><kbd>{key}</kbd><span>{action}</span></div>
          ))}
        </aside>}
      </div>
      <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
        <ParkTools />
        <ParkInteractionHint />
        <div hidden={omokFocus} inert={omokFocus}>
        <ConstructionNotice />
        <FacilityStatus />
        <EmoteWheel />
        <TelescopePanel />
        <FeedbackPanel />
        <AnonymousNotes />
        <ShopHost />
        <WardrobeHost />
        <AdvertisementLink />
        <CameraControls />
        <FollowMenu />
        <ParkMap />
        <ParkNavigation />
        <JumpmapHud />
        </div>
      </div>
      <BungeoppangHud />
      <OmokFeedback />
      <ManualHost showLauncher={!omokFocus} worldActions={bungeoppang || omokFocus ? undefined : <ManualWorldActions />} />
    </main>
  )
}
