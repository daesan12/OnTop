import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {EntryNewsPopup} from '../features/announcements/EntryNewsPopup'
import {NotificationCenter} from '../features/notifications/NotificationCenter'
import {useSession} from '../network/worldClient'
import '../styles.css'
import '../features/parkMenus/parkMenus.css'
import './preview.css'

if(!import.meta.env.DEV||import.meta.env.MODE!=='entry-news-preview')throw new Error('로컬 공지 미리보기 전용입니다.')
useSession.setState({sessionId:'entry-news-preview',status:'connected'})
function Preview(){
 const [host,setHost]=useState<HTMLDivElement|null>(null)
 return <main className="news-preview"><header><span>ONTOP · LOCAL PREVIEW</span><h1>공지·이벤트 다시 보기</h1><p>실제 공원에서 사용하는 버튼과 팝업입니다. 샘플 이미지이며 서버·DB·외부 API에 연결하지 않습니다.</p></header>
  <div className="park-account"><div className="news-preview-profile">온탑 주민 <small>로컬 미리보기</small></div></div>
  <section><h2>이렇게 확인해보세요</h2><ol><li>팝업에서 ‘오늘 보지 않기’를 선택하고 닫기</li><li>오른쪽 위 알림 아래 ‘이벤트/공지’ 누르기</li><li>다시 열린 공지 확인 · Esc로 닫기</li></ol><p>오늘 숨김 설정은 수동으로 다시 열어도 유지됩니다.</p></section>
  <NotificationCenter newsHostRef={setHost}/><EntryNewsPopup launcherHost={host}/>
 </main>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
