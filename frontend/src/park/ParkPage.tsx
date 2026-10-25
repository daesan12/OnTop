import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import coinImage from '../assets/yeopjeon-icon.png'
import leafImage from '../assets/park-leaf.png'
import peopleImage from '../assets/park-people.png'
import avatarImage from '../assets/park-avatar.png'
import { ParkScene } from './ParkScene'
import './park.css'
import './scene.css'
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
import { ShopLauncher, ShopPanel } from '../features/shop/ShopPanel'
import { AdvertisementLink } from '../features/advertisements/AdvertisementLink'
import { CameraControls } from '../features/camera/CameraControls'
import { FollowMenu } from '../features/follow/FollowMenu'
import { ParkChat } from '../features/chat/ParkChat'
import { WalletBalance } from '../features/wallet/WalletBalance'

const shortcuts = [
  { key: 'WASD', action: '이동' },
  { key: 'Shift', action: '달리기' },
  { key: 'Space', action: '점프' },
  { key: 'M', action: '지도' },
  { key: 'G', action: '감정표현' },
]

function getHudScale(): number {
  if (window.innerWidth <= 900) return 1
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080)
}

type ParkProps = { onExit: () => void; exitError: string; onAuthEnded: () => void }
export function ParkPage(props: ParkProps) {
  return <ParkRuntimeProvider onAuthEnded={props.onAuthEnded}><ParkContent {...props}/></ParkRuntimeProvider>
}
function ParkContent({ onExit, exitError }: ParkProps) {
  const bungeoppang = useBungeoppang(s => s.phase !== 'idle')
  const session = useSession(useShallow(s=>({ channelName:s.channelName,playerCount:s.playerCount,capacity:s.capacity,sessionId:s.sessionId,roomId:s.roomId,account:s.account })))
  const [quality,setQuality] = useState<QualityPreset>('low')
  const changeQuality = useCallback((value: QualityPreset) => {
    setQuality(value)
    resetMetrics()
  }, [])
  const parkView = { name:session.channelName || '채널 선택', players:session.playerCount, capacity:session.capacity, nickname:session.account?.nickname ?? '정보 미연동' }
  const [hudScale, setHudScale] = useState(getHudScale)

  useEffect(() => {
    const updateScale = () => setHudScale(getHudScale())
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return (
    <main className="park-page" aria-label="공원 기본 화면" data-bungeoppang={bungeoppang} style={{
      '--park-ui-scale': hudScale,
      '--park-edge': `${30 * hudScale}px`,
      '--park-shortcuts-half-width': `${390 * hudScale}px`,
    } as CSSProperties}>
      <ParkScene quality={quality} />
      <div className="park-hud">
        <section className="park-location" aria-label="현재 공원과 접속 인원" role="button" tabIndex={0} aria-haspopup="true" onClick={()=>window.dispatchEvent(new Event('ontop-toggle-channels'))} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.dispatchEvent(new Event('ontop-toggle-channels'))}}}>
          <img className="park-location__leaf" src={leafImage} alt="" />
          <div className="park-location__details">
            <div className="park-location__name">{parkView.name}</div>
            <div className="park-location__population">
              <img src={peopleImage} alt="" />
              <span>{parkView.players} / {parkView.capacity}</span>
            </div>
          </div>
          <span className="park-chevron" aria-hidden="true" />
        </section>

        <div className="park-account">
          <div className="park-account__summary" aria-label="내 정보">
            <img className="park-account__coin" src={coinImage} alt="엽전" />
            <WalletBalance />
            <span className="park-account__separator" aria-hidden="true" />
            <span className="park-account__nickname">{parkView.nickname}</span>
            <span className="park-account__avatar"><img src={avatarImage} alt="내 캐릭터" /></span>
            <span className="park-chevron" aria-hidden="true" />
          </div>
          <div className="park-account-actions"><ShopLauncher /><button className="park-exit" type="button" onClick={onExit}>나가기</button></div>
          {exitError && <p className="park-exit-error" role="alert">{exitError}</p>}
        </div>

        <ParkChat key={`${session.sessionId}:${session.roomId}`} />

        <aside className="park-shortcuts" aria-label="조작 방법">
          {shortcuts.map(({ key, action }) => (
            <div className="park-shortcuts__item" key={key}><kbd>{key}</kbd><span>{action}</span></div>
          ))}
        </aside>
      </div>
      <ParkTools quality={quality} onQuality={changeQuality}/>
      <ParkInteractionHint />
      <FacilityStatus />
      <EmoteWheel />
      <TelescopePanel />
      <FeedbackPanel />
      <AnonymousNotes />
      <ShopPanel />
      <AdvertisementLink />
      <CameraControls />
      <FollowMenu />
      <BungeoppangHud />
      <ParkMap />
      <ParkNavigation />
      <ManualHost worldActions={<ManualWorldActions quality={quality} onQuality={changeQuality} onExit={onExit} />} />
    </main>
  )
}
