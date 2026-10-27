import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { ParkScene } from './ParkScene'
import './park.css'
import './scene.css'
import '../features/parkMenus/hud.css'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../network/worldClient'
import { ParkRuntimeProvider } from './runtime/ParkRuntime'
import { ParkTools } from './ParkTools'
import type { QualityPreset } from '../config'
import { ParkInteractionHint } from '../features/interactions/ParkInteractionHint'
import { EmoteWheel } from '../features/emotes/EmoteWheel'
import { TelescopePanel } from '../features/telescopes/TelescopePanel'
import { FeedbackPanel } from '../features/feedback/FeedbackPanel'
import { AnonymousNotes } from '../features/notes/AnonymousNotes'
import { ManualHost } from '../features/manual/ManualHost'
import { FacilityStatus } from '../features/facilities/FacilityStatus'
import { ManualWorldActions } from '../features/manual/ManualWorldActions'
import { resetMetrics } from '../performance/metrics'
import { ParkMap } from '../features/navigation/ParkMap'
import { ParkNavigation } from '../features/navigation/NavigationHud'
import { BungeoppangHud } from '../features/bungeoppang/BungeoppangHud'
import { useBungeoppang } from '../features/bungeoppang/store'
import { ShopPanel } from '../features/shop/ShopPanel'
import { WardrobeLauncher, WardrobeScreen } from '../features/wardrobe/WardrobeScreen'
import { AdvertisementLink } from '../features/advertisements/AdvertisementLink'
import { CameraControls } from '../features/camera/CameraControls'
import { FollowMenu } from '../features/follow/FollowMenu'
import { ParkChat } from '../features/chat/ParkChat'
import { useGame } from '../game/store'
import { OmokFeedback, SpectatorChat } from '../game/omok/OmokFeedback'
import { ChannelMenu } from '../features/parkMenus/ChannelMenu'
import { AccountMenu } from '../features/parkMenus/AccountMenu'
import { LocationChip } from '../features/parkMenus/LocationChip'

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
  return <ParkRuntimeProvider onAuthEnded={props.onAuthEnded}><ParkContent {...props}/></ParkRuntimeProvider>
}
function ParkContent({ onExit, exitError, onAuthEnded }: ParkProps) {
  const bungeoppang = useBungeoppang(s => s.phase !== 'idle')
  const omokFocus = useGame(s => s.game?.role === 'PLAYER' && s.game.omok?.status === 'PLAYING' && !s.lastResult)
  const omokWatching = useGame(s => s.game?.role === 'SPECTATOR' && s.game.omok?.status === 'PLAYING')
  const session = useSession(useShallow(s=>({ sessionId:s.sessionId,roomId:s.roomId })))
  const [quality,setQuality] = useState<QualityPreset>('low')
  const changeQuality = useCallback((value: QualityPreset) => {
    setQuality(value)
    resetMetrics()
  }, [])
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
      <div className="park-hud">
        {!omokFocus && <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
          <ChannelMenu />
          {/* 빠른 메뉴: each feature keeps its own launcher, placed into a slot by CSS. */}
          <div className="park-quick-dock" aria-hidden="true" />
          <div className="park-dock-wardrobe"><WardrobeLauncher /></div>
          <LocationChip />
        </div>}
        {!omokFocus && <div inert={bungeoppang}>
          <AccountMenu quality={quality} exitError={exitError} onExit={onExit} onWithdrawn={onAuthEnded} />
        </div>}

        <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
          {!omokFocus && (omokWatching ? <SpectatorChat /> : <ParkChat key={`${session.sessionId}:${session.roomId}`} />)}
        </div>

        {!omokFocus && <aside className="park-shortcuts" aria-label="조작 방법">
          {shortcuts.map(({ key, action }) => (
            <div className="park-shortcuts__item" key={key}><kbd>{key}</kbd><span>{action}</span></div>
          ))}
        </aside>}
      </div>
      <div className="park-roaming-ui" hidden={bungeoppang} inert={bungeoppang}>
        <ParkTools quality={quality} onQuality={changeQuality}/>
        {!omokFocus && <>
        <ParkInteractionHint />
        <FacilityStatus />
        <EmoteWheel />
        <TelescopePanel />
        <FeedbackPanel />
        <AnonymousNotes />
        <ShopPanel />
        <WardrobeScreen />
        <AdvertisementLink />
        <CameraControls />
        <FollowMenu />
        <ParkMap />
        <ParkNavigation />
        </>}
      </div>
      <BungeoppangHud />
      <OmokFeedback />
      <ManualHost showLauncher={!omokFocus} worldActions={bungeoppang || omokFocus ? undefined : <ManualWorldActions quality={quality} onQuality={changeQuality} />} />
    </main>
  )
}
