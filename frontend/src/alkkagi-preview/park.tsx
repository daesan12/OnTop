import { useAlkkagiSocial } from '../game/alkkagi/spectatorEvents'
import { _roots } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../park/ParkPage'
import { exchangeCallbackCode } from '../auth/authFlow'
import { parkRuntime } from '../park/runtime/runtime'
import '../styles.css'

// 별도 local entry. 배포 index/App·정식 로그인은 변경하지 않는다.
async function boot() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ALKKAGI_ENABLED !== 'true'
    || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('로컬 검수 전용 화면입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'red'
  const response = await fetch('/dev/alkkagi-park/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ role }) })
  if (!response.ok) throw new Error('로컬 검수 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code:exchangeCode }).toString()
  await exchangeCallbackCode()
  // 검수 엔트리에서만 실제 화면과 같은 모듈 인스턴스를 테스트에 제공한다. 토큰은 노출하지 않는다.
  Object.assign(window, { alkkagiParkTest: {
    state: () => { const s=useGame.getState(),w=useSession.getState();return {gameId:s.game?.gameId,public:s.game?.alkkagi,private:s.game?.alkkagiHand,
      social:useAlkkagiSocial.getState(),status:w.status,roomId:w.roomId,tableId:w.tableId,phase:s.start?.phase,recovery:s.recovery,error:s.error,sessionError:w.error,pending:s.pending,uncertain:s.uncertain,table:w.tableStates[w.tableId]} },
    project: (id:string) => {
      for(const root of _roots.values()) {
        const {scene,camera,gl}=root.store.getState(), board=scene.getObjectByName('alkkagi-world-board')
        const piece=useGame.getState().game?.alkkagi?.pieces.find(p=>p.id===id)
        if(!board || !piece)continue
        const rect=gl.domElement.getBoundingClientRect()
        const project=(x:number,z:number)=>{
          const v=board.localToWorld(new Vector3(x,.28,z)).project(camera)
          return {x:rect.left+(v.x+1)/2*rect.width,y:rect.top+(1-v.y)/2*rect.height}
        }
        return {start:project(piece.x,piece.y),end:project(piece.x,piece.y+1.2)}
      }
      return null
    },
    command: (method:string,arg:unknown) => {
      if(method==='sendAlkkagiSpectator') return parkRuntime.sendAlkkagiSpectator!(arg as Record<string,unknown>)
      if(method==='actAlkkagi') return parkRuntime.actAlkkagi!(arg as Record<string,unknown>)
      if(method==='sendSpectatorChat') return parkRuntime.sendSpectatorChat(String(arg))
      if(method==='forfeitGame') return parkRuntime.forfeitGame(String(arg))
      if(method==='leaveTable') return parkRuntime.leaveTable()
      if(method==='setReady') return parkRuntime.setReady(arg===true)
      throw new Error('지원하지 않는 로컬 검수 명령')
    }
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError="" onAuthEnded={() => location.reload()} />
    <nav style={{position:'fixed',bottom:8,left:8,zIndex:65,background:'#fff8df',padding:8,borderRadius:8}} aria-label="로컬 공원 검수">
      <strong>로컬 검수 · 실제 회원/재화 없음</strong> · <a href="?role=red" target="_blank">홍팀</a> · <a href="?role=green" target="_blank">청팀</a> · <a href="?role=viewer" target="_blank">관전</a>
      <button onClick={() => parkRuntime.inspectTable('table-1')}>1번 탁자 확인</button>
    </nav>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent=String(error) })
