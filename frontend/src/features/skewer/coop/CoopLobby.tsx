import { useState } from 'react'
import { useStore } from 'zustand'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import cover from '../../vrZone/art/skewer-cover-lowpoly.png'
import chefRoleArt from './art/chef-role-illustration.png'
import chefVRChoiceArt from './art/chef-vr-choice-illustration.png'
import chefPCChoiceArt from './art/chef-pc-choice-illustration.png'
import serverRoleArt from './art/server-role-illustration.png'
import serviceHallPreview from './art/service-hall-preview.png'
import type { CoopClient } from './client'
import { CoopRoomBrowser } from './CoopRoomBrowser'
import { SKEWER_CHEF_VR_ENABLED } from './availability'
import { CHEF_VR_STEPS } from '../chef/vrGuide'
import { TouchControllerGuide } from '../../vrGuide/TouchControllerDiagram'

const roles = [
  { id: 'chef', name: '요리사', device: SKEWER_CHEF_VR_ENABLED ? 'VR / 키보드·마우스' : '키보드·마우스 · VR 공사 중', description: '그림 주문표를 보고 꼬치를 만들어요.' },
  { id: 'server', name: '서빙 담당', device: '키보드 이동', description: '손님과 주방 사이를 연결해요.' },
] as const

const steps = {
  chef: [
    ['주문표 확인', '친구가 전달한 주문 두 개까지 확인해요.'],
    ['그림대로 꼬치 만들기', '재료 순서와 개수를 맞춰요.'],
    ['완성한 접시 제출', '친구가 테이블 번호를 보고 손님에게 가져가요.'],
  ],
  server: [
    ['주문 받아 주방으로', '손님 앞에서 E로 접수하고 주문 전달대로 옮겨요.'],
    ['음식과 사케 서빙', '테이블 번호를 확인해요. 사케는 냉장고에서 꺼내요.'],
    ['자리 정리와 식기 세척', 'E를 1.5초 눌러 수거한 뒤 식기세척기에 넣어요.'],
  ],
} as const

export function CoopLobby({ client, onClose, onEquipment, chefMode, onChefMode }: { client: CoopClient; onClose: () => void; onEquipment: () => void; chefMode: 'pc' | 'vr' | null; onChefMode: (mode: 'pc' | 'vr' | null) => void }) {
  const state = useStore(client.store), snapshot = state.snapshot, pub = snapshot?.publicState
  const role = snapshot?.privateState.role, owner = client.transport.scope().userId
  const player = pub?.players.find(p => p.userId === owner)
  const [acting, setActing] = useState(false)
  const [changingRole, setChangingRole] = useState(false)
  const act = async (input: Record<string, unknown>) => {
    if (acting) return
    setActing(true)
    try { await client.act(input) } finally { setActing(false) }
  }
  const waiting = !!pub && pub.players.length < 2
  const pickingRole = !!pub && !waiting && (!role || changingRole)
  const pickingMode = !pickingRole && role === 'chef' && (!chefMode || chefMode === 'vr' && !SKEWER_CHEF_VR_ENABLED)
  const picking = pickingRole || pickingMode
  const vr = SKEWER_CHEF_VR_ENABLED && (role === 'chef' ? chefMode === 'vr' : pub?.chefVR)
  const ready = !!role && pub?.players.length === 2 && pub.players.every(p => p.role && p.connected)
    && (role !== 'chef' || !!chefMode && (chefMode !== 'vr' || pub.chefVR))
  const readyHint = player?.ready ? '친구가 준비하면 시작해요.' : role === 'chef' && vr && !pub?.chefVR ? '먼저 헤드셋을 연결해 주세요.' : ready ? '' : '친구의 역할 선택을 기다려요.'
  const chooseRole = async (next: 'chef' | 'server') => {
    await act({ type: 'ROLE', role: next })
    if (client.snapshot?.privateState.role === next && !client.store.getState().error) {
      onChefMode(null)
      setChangingRole(false)
    }
  }
  const subtitle = !pub ? '각자의 기기에서 만나, 하나의 가게를 운영해요.'
    : waiting ? '친구도 같은 공원의 VR 존에서 이 가게에 참가하면 돼요.'
      : role ? '내 역할을 확인하고, 함께 영업을 시작해요.' : '한 명은 주방에서, 한 명은 홀에서. 서로 다른 역할을 골라요.'
  if (!pub) return <CoopRoomBrowser client={client} onClose={onClose} />
  return <PaperPopup title="VR 체험관 · 2인 협동 미니게임" label={!pub ? '꼬치왕 협동 방' : '역할 선택과 준비'}
    className={`coop-welcome-paper${pub ? ' is-preparing' : ''}${picking ? ' is-picking' : ''}`} onClose={onClose} closeLabel="방 나가기 · 다른 방 선택">
    <section aria-label={!pub ? '꼬치왕 협동 방' : '역할 선택과 준비'}>
      <header className="coop-welcome-heading">
        {!picking ? <p className="coop-section-label">{!pub ? '둘이 함께 여는 작은 가게' : waiting ? '친구와 만나기' : '영업 준비'}</p> : null}
        <h1>{!pub ? '온탑 꼬치왕' : waiting ? '친구를 기다리고 있어요' : pickingRole ? '어떤 역할을 맡을까요?' : pickingMode ? '어떻게 요리할까요?' : `${role === 'chef' ? vr ? 'VR 요리사' : 'PC 요리사' : '서빙 담당'} 준비하기`}</h1>
        {!picking ? <p>{subtitle}</p> : null}
      </header>
      {state.error ? <p className="paper-error" role="alert">{state.error}</p> : null}
      {!pub || waiting ? <div className="coop-entry-layout">
        <figure className="coop-entry-art"><img src={cover} alt="주문 그림을 보며 음식을 꽂는 온탑 꼬치왕" width="1024" height="1024" />
          <figcaption><strong>한 장의 주문표, 두 사람의 호흡</strong><span>주문 전달 → 꼬치 제작 → 손님에게 서빙</span></figcaption>
        </figure>
        <div className="coop-entry-content">
          <div className="coop-facts"><span>2인 협동</span><span>영업 4분</span><span>무료 플레이</span></div>
          <div className="coop-role-intro">{roles.map(r => <div key={r.id}><b>{r.name}</b><p>{r.description}</p><small>{r.device}</small></div>)}</div>
          <div className="coop-waiting-room" role="status"><strong><b>1</b> / 2명</strong><h2>{pub.roomName ?? '함께 여는 꼬치집'}</h2>{pub.hostNickname ? <p>방장 · {pub.hostNickname}</p> : null}<p>친구가 참가하면 각자의 역할을 고를 수 있어요.</p><span>같은 공원 → VR 존 → 참가하기</span></div>
        </div>
      </div> : <>
        {pickingRole ? <div className="coop-pick-cards" aria-label="역할 고르기">{roles.map(r => {
          const taken = pub.players.some(p => p.userId !== owner && p.role === r.id)
          return <button key={r.id} className={`coop-pick-card is-${r.id}`} aria-label={r.name} aria-pressed={role === r.id}
            disabled={taken || acting || player?.ready} onClick={() => void chooseRole(r.id)}>
            <img src={r.id === 'chef' ? chefRoleArt : serverRoleArt} alt="" draggable={false} />
            <span className="coop-card-title">{r.name}</span>
            {taken ? <span className="coop-card-taken">친구가 선택했어요</span> : <span className="coop-card-select" aria-hidden="true">선택하기 →</span>}
          </button>
        })}</div> : pickingMode ? <>
          <div className="coop-pick-cards" aria-label="요리 방식 고르기">{(['vr', 'pc'] as const).map(mode => <button key={mode} className={`coop-pick-card is-${mode}${mode === 'vr' && !SKEWER_CHEF_VR_ENABLED ? ' is-under-construction' : ''}`} aria-label={mode === 'vr' && !SKEWER_CHEF_VR_ENABLED ? 'VR 요리 · 공사 중' : `${mode.toUpperCase()}로 요리하기`} disabled={acting || mode === 'vr' && !SKEWER_CHEF_VR_ENABLED} onClick={() => { if (mode === 'pc' || SKEWER_CHEF_VR_ENABLED) onChefMode(mode) }}>
            <img src={mode === 'vr' ? chefVRChoiceArt : chefPCChoiceArt} alt="" draggable={false} /><span className="coop-card-title">{mode.toUpperCase()}</span>
            {mode === 'vr' && !SKEWER_CHEF_VR_ENABLED ? <span className="coop-construction-badge">공사 중</span> : null}
            <span className="coop-card-device">{mode === 'vr' ? '헤드셋 · 컨트롤러' : '키보드 · 마우스'}</span>
            <span className="coop-card-rule">{mode === 'vr' ? SKEWER_CHEF_VR_ENABLED ? '팀 랭킹 도전' : '공사 중 · 곧 만나요' : 'PC 팀 랭킹 도전'}</span>
          </button>)}</div><button className="coop-back-choice" onClick={() => setChangingRole(true)}>← 역할 다시 고르기</button>
        </> : role ? <>
        <div className="coop-prep-nav"><button disabled={acting || player?.ready || pub.chefVR && role === 'chef'} onClick={() => setChangingRole(true)}>← 역할 다시 고르기</button>{role === 'chef' ? <button disabled={acting || player?.ready || pub.chefVR} onClick={() => onChefMode(null)}>플레이 방식 바꾸기</button> : null}</div>
        <div className="coop-guide-layout">
          <figure className="coop-guide-art"><img src={role === 'server' ? serviceHallPreview : vr ? chefVRChoiceArt : chefPCChoiceArt}
            alt={role === 'server' ? '주문을 받고 음식을 전달하는 실제 서빙 게임 화면' : vr ? '컨트롤러로 꼬치를 만드는 VR 요리 일러스트' : '키보드로 꼬치를 만드는 PC 요리 일러스트'} draggable={false} />
            <figcaption>{role === 'server' ? '홀의 동선은 내가 책임져요' : vr ? '직접 집고 꽂는 나만의 주방' : '키보드와 마우스로 완성하는 꼬치'}</figcaption>
          </figure>
          <div className="coop-role-guide"><ol>{(role === 'chef' && vr ? CHEF_VR_STEPS : steps[role]).map(([title, description], index) => <li key={title}><b aria-hidden="true">{index + 1}</b><div><h2>{title}</h2><p>{description}</p></div></li>)}</ol>
            <div className="coop-key-hints">{role === 'chef' ? vr ? <><span><kbd>트리거</kbd> 주문·재료 선택 / 접시 제출</span><span><kbd>그립</kbd> 꼬치 잡기</span><span>주방의 VR 조작 안내로 다시 확인해요</span></> : <><span><kbd>1–6</kbd> 재료 선택</span><span><kbd>Space</kbd> 꽂기</span><span><kbd>R</kbd> 완성·제출</span><span><kbd>⌫</kbd> 끝 재료 빼기</span></>
              : <><span><kbd>WASD</kbd> 이동</span><span><kbd>E</kbd> 상호작용</span><span><kbd>R</kbd> 반납·재수령</span></>}</div>
            {role === 'chef' && vr ? <button className="coop-equipment-button" onClick={onEquipment}>{pub.chefVR ? 'VR 연결 확인하기' : '헤드셋 연결하기'} <span aria-hidden="true">↗</span></button>
              : role === 'server' ? <p className="coop-guide-tip">음식과 더러운 식기는 함께 들 수 없어요. 꼬치는 보관대에, 사케는 냉장고에 내려놓으세요.</p> : null}
          </div>
        </div>
        {role === 'chef' && vr ? <TouchControllerGuide mode="chef" /> : null}
        <div className={`coop-ranking-notice${vr ? ' is-vr' : ''}`}><b>{vr ? 'VR 팀 랭킹 도전' : 'PC 팀 랭킹 도전'}</b><span>PC·VR 기록은 따로 집계해요. 경기 중 방식을 바꾸면 랭킹에서 제외돼요. 엽전 보상은 동일해요.</span></div>
        <footer className="coop-ready-footer"><div className="coop-team-status" aria-label="참가자 준비 상태">{pub.players.map(p => <div key={p.userId} data-ready={p.ready}><span className="coop-status-dot" /><span><b>{p.userId === owner ? '나' : '친구'}</b> · {p.role === 'chef' ? '요리사' : p.role === 'server' ? '서빙 담당' : '역할 선택 중'}<small>{!p.connected ? '연결 확인 중' : p.ready ? '준비 완료' : '준비 전'}</small></span></div>)}</div>
          <div className="coop-ready-action"><button className="paper-primary" disabled={(!ready && !player?.ready) || acting} onClick={() => void act({ type: 'READY', ready: !player?.ready })}>{acting ? '변경 중…' : player?.ready ? '준비 취소' : '준비 완료'}</button>{readyHint ? <small>{readyHint}</small> : null}</div>
        </footer>
        </> : null}
      </>}
      {!pub || waiting ? <p className="coop-entry-reward">입장료 없이 즐겨요 <span>·</span> 팀 점수 20점당 각자 1냥 <span>·</span> 모든 미니게임 합산 하루 최대 1000냥</p> : null}
    </section>
  </PaperPopup>
}
