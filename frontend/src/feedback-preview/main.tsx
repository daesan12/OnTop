import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { TraditionalMailbox } from '../world/art/TraditionalMailbox'
import { PlannedGround } from '../world/art/PlannedGround'
import { SimpleParkTrees } from '../world/art/SimpleParkTrees'
import { MAILBOX } from '../config'
import { EXPECTED_MAP_VERSION } from '../config/mapVersion'
import { receive } from '../network/worldClient'
import { openFeedback } from '../features/feedback/controller'
import { FeedbackPanel } from '../features/feedback/FeedbackPanel'
import { feedbackService } from '../features/feedback/service'
import { MockFeedbackService } from '../features/feedback/mock/MockFeedbackService'
import { resetFeedbackState, useFeedbackState } from '../features/feedback/state'
import { roamingInput } from '../world/inputOwnership'
import '../styles.css'
import './preview.css'

// A separate local-only entry. It never restores login or starts HTTP/WebSocket
// transports, and never ships as the normal application's index entry.
if (!import.meta.env.DEV || import.meta.env.MODE !== 'feedback-preview') throw new Error('로컬 feedback-preview 모드로 열어주세요.')
roamingInput.ready = true
receive({ type: 'CONNECTED', payload: { userId: 'preview-user' }, requestId: null })
receive({ type: 'CHANNEL_STATE', payload: { channelId: 'preview-channel', name: '로컬 소리함', version: 1, currentUsers: 1, capacity: 16, userIds: ['preview-user'] }, requestId: null })
receive({ type: 'WORLD_STATE', payload: { channelId: 'preview-channel', version: 1, mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: 'preview-user', position: { x: MAILBOX.x, y: .8, z: MAILBOX.z + 1.7, yaw: Math.PI, moving: false, running: false, swimming: false, lastInputSeq: 0 } }] }, requestId: null })

function PreviewCamera({ yaw }: { yaw: number }) {
  useFrame(({ camera }) => {
    camera.position.set(MAILBOX.x + Math.sin(yaw) * 3.6, 1.7, MAILBOX.z + Math.cos(yaw) * 3.6)
    camera.lookAt(MAILBOX.x, .9, MAILBOX.z)
  })
  return null
}
function Preview() {
  const [failure, setFailure] = useState(false), [yaw, setYaw] = useState(.3)
  const opened = useFeedbackState(s => s.open)
  const open = () => {
    if (useFeedbackState.getState().open) return
    resetFeedbackState(true)
    useFeedbackState.setState({ nextAllowedAt: 0, error: '', operationId: '', submittedText: '' })
    const mock = new MockFeedbackService(800)
    feedbackService.submit = (submission, signal) => failure
      ? new Promise((_, reject) => setTimeout(() => reject(new Error('전송 실패입니다. 작성한 내용은 그대로 보관됩니다.')), 800))
      : mock.submit(submission, signal)
    openFeedback()
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat || useFeedbackState.getState().open) return
      event.preventDefault(); open()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [failure])
  return <main className="feedback-preview-page">
    <Canvas shadows camera={{ fov: 42, near: .1, far: 500 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#b6c8bc']}/><fog attach="fog" args={['#b6c8bc',18,75]}/>
      <hemisphereLight color="#ffefd3" groundColor="#809072" intensity={2.3}/>
      <directionalLight position={[-15,25,15]} intensity={2.4} color="#fff0d9" castShadow shadow-mapSize={[1024,1024]}/>
      <PlannedGround/><SimpleParkTrees/><TraditionalMailbox/><PreviewCamera yaw={yaw}/>
    </Canvas>
    <header className="feedback-preview-toolbar"><div><strong>온탑 소리함</strong><span>로컬 디자인 미리보기 · 실제 의견은 전송되지 않습니다.</span></div>
      <div><label><input type="checkbox" checked={failure} onChange={e => setFailure(e.target.checked)} disabled={opened}/> 전송 실패 확인</label><button onClick={() => setYaw(y => y + Math.PI / 4)} disabled={opened}>에셋 회전</button><button onClick={open} disabled={opened}>E · 소리함 열기</button></div>
    </header>
    {!opened && <div className="feedback-preview-hint"><kbd>E</kbd>를 눌러 의견을 작성해보세요.<small>전송 성공 후 편지가 소리함에 들어갑니다.</small></div>}
    <FeedbackPanel/>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
