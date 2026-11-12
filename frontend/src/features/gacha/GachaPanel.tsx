import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { MAX_TICKET_PURCHASE, refreshGacha, resetGacha, useGacha } from './state'
import { useGachaEvents } from './events'
import { money } from './contracts'
import { closeConstructionNotice } from '../construction/model'
import { useGachaOverlay } from './view'
import { openWardrobe } from '../wardrobe/state'
import { CAPSULES, Capsule, RevealEffects, useCapsuleAssets, useCapsuleDraw } from './capsuleMotion'
import { Machine3D, CapsuleHero3D } from './CapsuleScene'
import { CoinToWallet } from './GachaBoxes'
import { capsuleName, capsuleTier, displayGachaMessage } from './labels'
import { GachaActionIcon } from './GachaActionIcon'
import { RefillNotice } from './RefillNotice'
import { refillRemaining } from './timing'
import { armUnlock } from '../../audio/bgm'
import { playSfx } from '../../audio/sfx'
import './gachaPanel.css'
import './capsuleMotion.css'
import './gachaActions.css'

export function GachaPanel() {
  const connected=useSession(s=>s.status==='connected'&&!!s.roomId)
  const s=useGacha(), live=useGachaEvents(v=>v.machine), notices=useGachaEvents(v=>v.notices)
  const [selected,setSelected]=useState(1), [now,setNow]=useState(()=>performance.now())
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  const owner=useSession(v=>v.sessionId)
  const art=useCapsuleAssets()
  const [sceneReady,setSceneReady]=useState(false)
  const sceneLoaded=useCallback(()=>setSceneReady(true),[])
  useEffect(()=>{if(!connected)setSceneReady(false)},[connected])
  const motion=useCapsuleDraw(connected,owner??'',reduced)
  useEffect(()=>{useGachaOverlay.setState({open:connected});return()=>{useGachaOverlay.setState({open:false})}},[connected])
  const drawing=motion.busy
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches)
    media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  useEffect(()=>{ const timer=setInterval(()=>setNow(performance.now()),100);return()=>clearInterval(timer) },[])
  useEffect(()=>{if(connected)void refreshGacha();else closeConstructionNotice()},[connected])
  useEffect(()=>{
    const d=dialog.current;if(!d||!connected)return
    d.showModal();return()=>d.close()
  },[connected])
  const latestMachine=s.state&&live&&live.version>s.state.machine.version?live:s.state?.machine
  const machine=drawing&&motion.presentation?motion.presentation.machine:latestMachine
  const inventory=drawing&&motion.presentation?motion.presentation.inventory:s.state?.inventory
  const remaining=refillRemaining(machine,now), refilling=remaining>0
  const blocked=s.busy||drawing||!!s.pending||!s.state
  const prize=machine?.prizes.find(p=>p.grade===selected)
  const gender=useSession(v=>v.profiles[v.sessionId]?.character==='girl'?'FEMALE':'MALE')
  const product=s.state?.products.find(p=>p.grade===selected&&(p.compatibility==='ANY'||p.compatibility===gender))
  const notice=drawing&&motion.presentation?motion.presentation.notice:notices.filter(n=>n.expiresAt>now).at(-1)
  const result=motion.phase==='reveal'?motion.result:null
  const sounded=useRef('')
  useEffect(()=>{if(result?.kind==='DRAW'&&result.grade!==5&&sounded.current!==result.operationId){sounded.current=result.operationId;playSfx(result.grade===1?'game-start':'ui-equip')}},[result])
  const price=s.state?.ticketPrice??100,available=inventory?.availableBalance??0
  const [buyCount,setBuyCount]=useState(1)
  const affordable=Math.max(1,Math.min(MAX_TICKET_PURCHASE,Math.floor(available/price)))
  const count=Math.min(buyCount,affordable)
  const act=(kind:'BUY'|'DRAW')=>{if(!blocked&&(kind!=='DRAW'||!refilling&&art.status==='ready'&&sceneReady)){armUnlock();playSfx('ui-click');void motion.act(kind,kind==='BUY'?count:1)}}
  const canDraw=!blocked&&!refilling&&art.status==='ready'&&sceneReady&&!!s.state?.inventory.tickets
  // Space: draw; while the draw plays, skip it; on the result, confirm it (the focused button must not also click).
  // Listened on the document while the dialog is open: focus falls to <body> when the skip button goes away.
  const space=useRef<()=>void>(()=>{})
  space.current=()=>{if(result)motion.dismiss();else if(drawing)motion.skip();else if(canDraw)act('DRAW')}
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(!dialog.current?.open||e.key!==' '&&e.code!=='Space')return
      if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return
      e.preventDefault();e.stopPropagation();if(!e.repeat)space.current()
    }
    document.addEventListener('keydown',onKey,true);return()=>document.removeEventListener('keydown',onKey,true)
  },[])
  const retry=()=>{
    const pending=useGacha.getState().pending
    if(!pending)return
    if(pending.kind==='OPEN'){dialog.current?.close();closeConstructionNotice();openWardrobe();return}
    void motion.act(pending.kind)
  }
  if(!connected)return null
  return <dialog ref={dialog} className="gacha-art-dialog" aria-label="의상 뽑기"
    onCancel={e=>{e.preventDefault();if(drawing)motion.skip();else closeConstructionNotice()}}
    onClose={()=>{if(!dialog.current?.open)closeConstructionNotice()}} onKeyDown={e=>e.stopPropagation()}>
    <div className="gacha-art-stage" data-drawing={drawing} data-phase={motion.phase} data-refilling={refilling&&!drawing&&!result} data-reduced={reduced||motion.instant}>
      <Machine3D phase={motion.phase} phaseStartedAt={motion.phaseStartedAt} grade={motion.result?.grade} reduced={reduced} onReady={sceneLoaded} refillUntil={refilling&&!drawing&&!result?now+remaining:undefined}/>
      <div className="capsule-front-glass" aria-hidden="true"/>
      <h1 className="art-title">의상 뽑기</h1><p className="art-subtitle">모두가 함께하는 작은 행운</p>
      <div className="art-header-actions"><div className="art-wallet"><span>보유 엽전 <b>{inventory?money(inventory.balance):'확인 중'}</b></span>
        <span>뽑기권 <b>{inventory?.tickets??'—'}장</b></span></div>
        <button className="art-close" aria-label="뽑기 닫기" disabled={drawing||s.busy} onClick={()=>closeConstructionNotice()}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
      </div>
      <div className="art-announcement" aria-live="polite">{notice?.text??'S급 캡슐의 주인공은 누구일까요?'}</div>
      <div className="art-chest-options" aria-label="의상 캡슐 미리보기">
        {[1,2,3,4].map(grade=><button key={grade} aria-label={`${capsuleName(grade)} 미리보기`} aria-pressed={selected===grade}
          onClick={()=>setSelected(grade)}><Capsule grade={grade}/><span>{capsuleTier(grade)}</span></button>)}
      </div>
      <section className="art-preview-detail" aria-label="선택한 보상">
        <small>보상 미리보기</small><h2>{capsuleName(selected)}</h2>
        <p className="art-value">상품 가치 <strong>{money(prize?.value??[1000,500,250,100][selected-1]!)}</strong></p>
        <div className="art-divider"/><p>캡슐을 열면 의상 상품 하나가 나와요.</p>
        <p className="art-product">{product?.name??'현재 캐릭터가 입을 수 있는 의상'}</p>
        <p className="art-duplicate">같은 상품이 나오면<br/>가치의 절반을 엽전으로 받아요.</p>
      </section>
      <h2 className="art-stock-title">남은 보상</h2>
      <section className="art-stock" aria-label="남은 보상 개수">
        {machine?.prizes.map(p=><div key={p.grade} className="art-stock-row">
          <span>{p.grade===5?'엽전 20냥':capsuleName(p.grade)}</span>
          <b>{p.remaining}<small>개</small></b>
        </div>)}
      </section>
      {!drawing&&!result&&<RefillNotice remaining={remaining} transition={s.transition}/>}
      <p className="art-reset">S급 당첨 시 보상이 새로 채워져요</p>
      <p className="art-storage-hint">의상 캡슐은 마이룸에서 열어 보세요</p>
      <button className="art-storage art-button" aria-label="나의 옷장 · 캡슐 보관함" disabled={s.busy||drawing} onClick={()=>{dialog.current?.close();closeConstructionNotice();openWardrobe()}}><GachaActionIcon kind="wardrobe"/><span className="art-action-copy"><b>나의 옷장</b><small>모아 둔 캡슐 확인하기</small></span></button>
      <button className="art-buy art-button" aria-label={`뽑기권 ${count}장 구매 ${money(price*count)}`} disabled={blocked||!s.state||available<price*count}
        onClick={()=>void act('BUY')}><GachaActionIcon kind="ticket"/><span className="art-action-copy"><b>뽑기권 구매</b><small>{count}장 · {money(price*count)}</small></span></button>
      <div className="art-buy-count" role="group" aria-label="구매할 뽑기권 수">
        <button type="button" aria-label="한 장 줄이기" disabled={blocked||count<=1} onClick={()=>setBuyCount(Math.max(1,count-1))}>−</button>
        <output aria-live="polite">{count}</output>
        <button type="button" aria-label="한 장 늘리기" disabled={blocked||count>=affordable} onClick={()=>setBuyCount(Math.min(affordable,count+1))}>+</button>
      </div>
      <button className="art-draw art-button" aria-label="뽑기권 1장 사용" aria-keyshortcuts="Space" disabled={!canDraw} onClick={()=>void act('DRAW')}>
        <GachaActionIcon kind="capsule"/><span className="art-action-copy"><b>{drawing?(motion.phase==='turning'?'손잡이를 돌려요…':motion.phase==='mixing'?'행운을 섞고 있어요…':'행운이 다가와요…'):refilling?'캡슐 보충 중…':'캡슐 뽑기'}</b><small>뽑기권 1장 사용 · Space</small></span></button>
      {drawing&&<div className="art-draw-status" role="status"><span>{motion.phase==='mixing'?'공유 기계에서 결과를 확인하고 있어요':'행운의 캡슐을 꺼내고 있어요'}</span>
        <button onClick={motion.skip}>연출 건너뛰기 <kbd>Space</kbd></button></div>}
      {art.status==='error'&&<p className="art-error" role="alert">캡슐 그림을 불러오지 못했어요. 뽑기권은 사용하지 않았어요.<button onClick={art.retry}>그림 다시 불러오기</button></p>}
      {motion.phase==='anticipation'&&<div className="capsule-anticipation" aria-hidden="true"><span>특별한 행운이 다가와요…</span></div>}
      {s.loading&&!s.state&&<p className="art-notice" role="status">공유 기계의 재고를 불러오고 있어요…</p>}
      {(s.error||s.pending&&!s.busy&&!drawing)&&<p className="art-error" role="alert">{displayGachaMessage(s.error)||'이전 요청의 결과를 다시 확인해 주세요.'}{s.pending&&!s.busy&&!drawing&&<button onClick={retry}>{s.pending.kind==='OPEN'?'옷장에서 개봉 결과 확인':'같은 요청으로 다시 확인'}</button>}{s.error&&!s.pending&&!s.busy&&!drawing&&<button disabled={s.loading} onClick={()=>void refreshGacha()}>다시 불러오기</button>}</p>}
      {s.state&&inventory&&available<price*count&&<p className="art-shortage">구매하려면 {money(price*count-available)}이 더 필요해요.</p>}
      {result&&<div className={result.kind==='DRAW'?'capsule-reveal':'purchase-reveal'} data-grade={result.grade}
        style={{'--rarity-color':CAPSULES[result.grade]?.color??'#ffe49a'} as React.CSSProperties}>
        {result.kind==='DRAW'&&<><RevealEffects grade={result.grade}/><CapsuleHero3D grade={result.grade} reduced={reduced||motion.instant}/></>}
        <div className="art-result" role="status" aria-live="polite" data-operation-id={result.operationId}>
          <small>{result.kind==='BUY'?'구매 완료':result.grade===1?'가장 빛나는 행운!':'축하해요!'}</small>
          <strong>{result.kind==='BUY'?`뽑기권 ${Math.max(1,Math.round(result.paidCoins/price))}장을 받았어요`:result.grade===5?`${money(result.awardedCoins)} 당첨!`:`${capsuleName(result.grade)} 당첨!`}</strong>
          <span>{result.kind==='DRAW'&&result.grade!==5?'나의 옷장에 보관했어요.':'최신 지갑과 보유 수량에 반영했어요.'}</span>
          {result.kind==='DRAW'&&result.grade===5&&<CoinToWallet receipt={result.operationId} amount={result.awardedCoins} reduced={reduced||motion.instant} target=".art-wallet"/>}
          <button onClick={motion.dismiss}>확인 <kbd>Space</kbd></button></div></div>}
    </div>
  </dialog>
}

export function GachaLifecycle() {
  const owner=useSession(s=>s.sessionId),connected=useSession(s=>s.status==='connected')
  useEffect(()=>{
    resetGacha()
    if(connected&&owner)void refreshGacha()
  },[owner,connected])
  useEffect(()=>{
    const refresh=()=>{const state=useGacha.getState();if(connected&&state.owner===owner&&state.state)void refreshGacha()}
    window.addEventListener('ontop:gacha-inventory-changed',refresh)
    window.addEventListener('ontop:notifications-changed',refresh)
    return()=>{window.removeEventListener('ontop:gacha-inventory-changed',refresh);window.removeEventListener('ontop:notifications-changed',refresh)}
  },[owner,connected])
  return null
}
