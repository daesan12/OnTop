import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { create } from 'zustand'
import { Box3, Group, Vector3 } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { knownWholeSkin } from '../../world/art/wholeSkin'
import { catalogAsset, useSkinCatalog } from '../../world/art/skinCatalog'
import { setImage, outfitImage } from '../wardrobe/itemArt'
import { useWardrobe } from '../wardrobe/state'
import { useSession } from '../../network/worldClient'
import { gachaAction, refreshGacha, useGacha } from './state'
import { money, type GachaProduct, type GachaResult } from './contracts'
import { armUnlock } from '../../audio/bgm'
import { playSfx } from '../../audio/sfx'
import { CAPSULES, Capsule, Coin } from './capsuleMotion'
import { capsuleName, displayGachaMessage } from './labels'
import { useGachaOverlay } from './view'
import { WearParts } from './OpeningOrnaments'
import { OpeningRadiance } from './OpeningRadiance'
import { OpeningCapsule } from './OpeningCapsule'
import './capsuleOpening.css'
import './capsuleMotion.css'
import './openingReference.css'

type OpenPhase='idle'|'pause'|'sway'|'waiting'|'seam'|'opening'|'reveal'|'duplicate'|'coins'|'complete'
const empty={phase:'idle' as OpenPhase,startedAt:0,busy:false,result:null as GachaResult|null,grade:4,instant:false,value:0}
const disclosed=(phase:OpenPhase)=>['reveal','duplicate','coins','complete'].includes(phase)

/** Existing persisted operation IDs and authoritative receipts remain the only source of rewards. */
function useOpening(active:boolean,owner:string,reduced:boolean){
 const [s,set]=useState(empty),flight=useRef<AbortController|null>(null),skip=useRef(false),reduce=useRef(reduced)
 reduce.current=reduced
 useEffect(()=>{set(empty);return()=>{flight.current?.abort();flight.current=null}},[active,owner])
 async function open(grade:number){
  const before=useGacha.getState()
  if(!active||flight.current||before.busy||before.owner!==owner||!before.state||before.pending&&before.pending.kind!=='OPEN')return
  const actualGrade=before.pending?.grade??grade,control=new AbortController();flight.current=control;skip.current=false
  const current=()=>!control.signal.aborted&&flight.current===control&&useSession.getState().sessionId===owner&&useSession.getState().status==='connected'
  const phase=(p:OpenPhase)=>{if(current())set(v=>({...v,phase:p,startedAt:performance.now(),instant:skip.current||reduce.current}))}
  const wait=async(ms:number)=>{const began=performance.now();while(current()&&!skip.current&&!reduce.current&&performance.now()-began<ms)await new Promise(r=>setTimeout(r,32))}
  try{
   armUnlock();playSfx('ui-click')
   set({...empty,busy:true,phase:'pause',startedAt:performance.now(),grade:actualGrade,value:before.state.machine.prizes.find(p=>p.grade===actualGrade)?.value??0})
   const request=gachaAction('OPEN',actualGrade),id=useGacha.getState().pending?.operationId
   await wait(380);phase('sway');await wait(950);phase('waiting');await request
   const receipt=useGacha.getState().result
   if(!current())return
   if(!receipt||receipt.operationId!==id||receipt.kind!=='OPEN'||receipt.grade!==actualGrade||!receipt.product||receipt.product.grade!==actualGrade){set(empty);return}
   set(v=>({...v,result:receipt}))
   phase('seam');await wait(actualGrade===1?950:actualGrade===2?650:350)
   phase('opening');playSfx('card-draw');await wait(650)
   if(actualGrade===1)await wait(350)
   phase('reveal');playSfx(actualGrade===1?'game-start':'ui-equip');await wait(receipt.duplicate?900:500)
   if(receipt.duplicate){phase('coins');await wait(1000)}
   phase('complete')
  }finally{if(flight.current===control){const live=current();flight.current=null;if(live)set(v=>({...v,busy:false}))}}
 }
 return {...s,open,skip:()=>{skip.current=true},dismiss:()=>set(empty)}
}

function Lighting(){return <><ambientLight intensity={1.5}/><directionalLight position={[3,5,5]} intensity={3} color="#fff0d0"/><directionalLight position={[-3,2,2]} intensity={1.5} color="#c9e8ff"/></>}
class ArtBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}
function GarmentMesh({url}:{url:string}){
 const gltf=useLoader(ParkAssetLoader,url)
 const normalized=useMemo(()=>{const object=clone(gltf.scene),box=new Box3().setFromObject(object),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());const group=new Group();object.position.sub(center);group.add(object);group.scale.setScalar(2.65/Math.max(size.x,size.y,size.z,.01));return group},[gltf])
 return <primitive object={normalized} dispose={null}/>
}
export function ProductDisplay({product}:{product:GachaProduct}){
 useSkinCatalog(s=>s.revision)
 const variant=useSession(s=>s.profiles[s.sessionId]?.character==='girl'?'girl':'man')
 const model=knownWholeSkin(product.imageKey,variant),owned=useWardrobe(s=>s.items.find(i=>product.itemIds.includes(i.item.itemId)))
 const picture=catalogAsset(product.imageKey)?.imageUrl??setImage(product.code)??(owned?setImage(owned.item.setCode)??outfitImage(product.imageKey,owned.item.equipSlot!):undefined)
 if(model)return <ArtBoundary key={product.imageKey} fallback={<div className="open-asset-message">의상 모델을 불러오지 못했어요.<br/>획득 내역은 옷장에 보관돼요.</div>}>
  <Suspense fallback={<div className="open-asset-message" role="status">의상 모습을 불러오고 있어요…</div>}>
   <Canvas resize={{offsetSize:true}} camera={{position:[0,.08,4.8],fov:38}} dpr={1} frameloop="demand" gl={{alpha:true,antialias:true}}><Lighting/><GarmentMesh url={model.url}/></Canvas>
  </Suspense>
 </ArtBoundary>
 if(picture)return <img src={picture} alt={product.name}/>
 return <div className="open-asset-message">{product.name}<br/><small>등록된 의상 미리보기가 아직 없어요.</small></div>
}

const coinReceipts=new Set<string>()
/** Cosmetic movement toward a visible wallet; no balance mutation occurs here. */
export function CoinToWallet({receipt,amount,reduced,target='.open-wallet'}:{receipt:string;amount:number;reduced:boolean;target?:string}){
 const root=useRef<HTMLSpanElement>(null),owner=useSession(s=>s.sessionId)
 useEffect(()=>{
  if(!amount||!root.current)return
  const animations:Animation[]=[]
  const timer=setTimeout(()=>{
   const key=owner+':'+receipt;if(coinReceipts.has(key))return
   const node=root.current,to=document.querySelector<HTMLElement>(target);if(!node||!to)return
   coinReceipts.add(key);if(coinReceipts.size>100)coinReceipts.delete(coinReceipts.values().next().value!)
   playSfx('coin-gain')
   if(reduced)return
   const from=node.getBoundingClientRect(),end=to.getBoundingClientRect(),dx=end.x+end.width/2-from.x-from.width/2,dy=end.y+end.height/2-from.y-from.height/2
   node.querySelectorAll<HTMLElement>('.open-flying-coin').forEach((coin,i)=>animations.push(coin.animate([
    {transform:'translate(0,0) scale(.6)',opacity:0},{transform:`translate(${(i-3)*12}px,-30px) scale(1)`,opacity:1,offset:.18},
    {transform:`translate(${dx}px,${dy}px) scale(.35)`,opacity:0}
   ],{duration:1000,delay:i*65,easing:'cubic-bezier(.35,.05,.65,.9)',fill:'both'})))
  },100)
  return()=>{clearTimeout(timer);animations.forEach(a=>a.cancel())}
 },[receipt,amount,reduced,target,owner])
 return <span ref={root} className="open-coin-source" data-coin-receipt={receipt}><b>+{money(amount)}</b>{Array.from({length:7},(_,i)=><span className="open-flying-coin" key={i}><Coin/></span>)}</span>
}

const useItemChoice=create(()=>({grade:null as number|null}))
const OPEN_CHOSEN_ITEM='ontop-gacha-open-chosen-item'
export function GachaItemFooter(){
 const grade=useItemChoice(v=>v.grade),s=useGacha(),quantity=s.state?.inventory.boxes.find(b=>b.grade===grade)?.quantity??0
 if(!grade||quantity<1)return <p className="wardrobe-detail__empty">열어 볼 아이템을 골라 주세요. 두 번 누르면 바로 열어요.</p>
 return <><span className="wardrobe-art" data-slot="TOP"><Capsule grade={grade}/></span>
  <div className="wardrobe-detail__text"><b>{capsuleName(grade)}</b><small>{quantity}개 보유 · 열면 해당 등급의 의상 하나를 받아요</small></div>
  <div className="wardrobe-detail__actions"><button type="button" className="wardrobe-wear" disabled={s.busy||!!s.pending||quantity<1} onClick={()=>window.dispatchEvent(new Event(OPEN_CHOSEN_ITEM))}>열기</button></div>
 </>
}
export function GachaBoxes(){
 const s=useGacha(),owner=useSession(v=>v.sessionId),connected=useSession(v=>v.status==='connected'),items=useWardrobe(v=>v.items)
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),dialog=useRef<HTMLDialogElement>(null)
 const [recovered,setRecovered]=useState<GachaResult|null>(null)
 const opening=useOpening(connected,owner,reduced),visible=opening.phase!=='idle',result=opening.result,shown=disclosed(opening.phase)
 const chosen=useItemChoice(v=>v.grade),query=useWardrobe(v=>v.query.trim())
 useEffect(()=>{useItemChoice.setState({grade:null});return()=>{useItemChoice.setState({grade:null})}},[])
 useEffect(()=>{const open=()=>{const grade=useItemChoice.getState().grade;if(grade)void opening.open(grade)};window.addEventListener(OPEN_CHOSEN_ITEM,open);return()=>window.removeEventListener(OPEN_CHOSEN_ITEM,open)},[opening.open])
 useEffect(()=>{void refreshGacha()},[])
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
 useEffect(()=>{const d=dialog.current;if(!d||!visible||!connected)return;d.showModal();useGachaOverlay.setState({surface:'boxes'});return()=>{d.close();useGachaOverlay.setState({surface:null})}},[visible,connected])
 const paidOut=!!result?.duplicate&&['coins','complete'].includes(opening.phase)
 const componentSlots=result?.product?.components?.flatMap(c=>c.slots)??[]
 const slots=componentSlots.length?componentSlots:result?.product?.itemIds.flatMap(id=>{const slot=items.find(i=>i.item.itemId===id)?.item.equipSlot;return slot?[slot]:[]})??[]
 const parts=[...new Set(slots.map(slot=>slot==='HAIR'?'머리':slot==='FACE'?'얼굴':'옷'))]
 const ownedBoxes=s.state?.inventory.boxes.filter(b=>b.quantity>0)??[]
 const matchingBoxes=ownedBoxes.filter(b=>!query||capsuleName(b.grade).toLocaleLowerCase().includes(query.toLocaleLowerCase()))
 const next=()=>opening.dismiss()
 const sameLeft=s.state?.inventory.boxes.find(b=>b.grade===opening.grade)?.quantity??0
 const retry=async()=>{
  const pending=useGacha.getState().pending
  if(!pending)return
  if(pending.kind==='OPEN'){void opening.open(pending.grade!);return}
  await gachaAction(pending.kind)
  const receipt=useGacha.getState().result
  if(useSession.getState().sessionId===owner&&receipt?.operationId===pending.operationId)setRecovered(receipt)
 }
 return <section className="gacha-item-storage" aria-label="아이템 보관함" aria-busy={s.loading}>
  <ul className="wardrobe-grid gacha-item-grid">{matchingBoxes.map(b=><li key={b.grade}>
   <button type="button" className="wardrobe-card" aria-label={`${capsuleName(b.grade)} ${b.quantity}개 보유`} aria-pressed={chosen===b.grade} disabled={s.busy||opening.busy} onClick={()=>useItemChoice.setState({grade:b.grade})} onDoubleClick={()=>{if(!s.pending&&b.quantity>0)void opening.open(b.grade)}}>
    <span className="wardrobe-art" data-slot="TOP"><Capsule grade={b.grade}/></span><span className="wardrobe-card__text"><b>{capsuleName(b.grade)}</b><small>보유 {b.quantity}개</small></span>
   </button>
  </li>)}</ul>
  {s.state&&query&&matchingBoxes.length===0&&<div className="wardrobe-empty" role="status"><b>찾는 아이템이 없어요</b><p>검색어를 바꿔 보세요.</p></div>}
  {s.state&&!query&&ownedBoxes.length===0&&<div className="wardrobe-empty" role="status"><b>보유한 캡슐이 없어요</b><p>뽑기에서 얻은 캡슐이 여기에 표시돼요.</p></div>}
  {s.error&&<div role="alert" className="gacha-item-error"><p>{displayGachaMessage(s.error)}</p>
   {!s.state&&s.pending?.kind==='OPEN'&&<p>먼저 ‘다시 불러오기’를 누르면 이전 개봉 결과를 확인할 수 있어요.</p>}
   <button type="button" className="gacha-item-retry" disabled={s.loading||s.busy||opening.busy} onClick={()=>void refreshGacha()}>다시 불러오기</button>
  </div>}
  {s.pending&&!s.busy&&<button className="gacha-item-retry" disabled={!s.state||s.loading||opening.busy} onClick={()=>void retry()}>이전 거래 결과 확인</button>}
  {recovered&&<div className="gacha-item-recovery" role="status" data-operation-id={recovered.operationId}><b>{recovered.kind==='BUY'?`뽑기권 ${Math.max(1,Math.round(recovered.paidCoins/(s.state?.ticketPrice??100)))}장 구매를 확인했어요`:recovered.grade===5?`${money(recovered.awardedCoins)} 당첨을 확인했어요`:`${capsuleName(recovered.grade)} 당첨을 확인했어요`}</b><p>확정된 결과를 복구했어요. 추가로 소비하지 않았어요.</p><button onClick={()=>setRecovered(null)}>확인</button></div>}
  {!s.state&&s.loading&&<p role="status">캡슐을 불러오고 있어요…</p>}
  <dialog ref={dialog} className="capsule-opening-dialog" aria-label="의상 캡슐 개봉" onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();opening.busy?opening.skip():next()}}>
   <div className="capsule-opening-stage" data-phase={opening.phase} data-grade={opening.grade} data-reduced={reduced||opening.instant} style={{'--rarity-color':CAPSULES[opening.grade]!.color} as React.CSSProperties}>
    {opening.phase==='complete'&&<button className="open-result-x" aria-label="개봉 결과 닫기" onClick={next}>×</button>}
    <div className="open-title"><h2 aria-label={shown?'캡슐 개봉 결과':'캡슐 개봉 중'}>{shown?'캡슐 개봉 결과':'캡슐 개봉 중'}</h2><p>{shown?'캡슐을 개봉하여 아래 아이템을 획득했어요!':'캡슐 속 행운을 깨우고 있어요'}</p></div>

    <div className="open-prize-display">
    {shown&&<OpeningRadiance grade={opening.grade}/> }
    <div className="open-capsule-scene" aria-hidden="true"><Canvas resize={{offsetSize:true}} camera={{position:[0,1.4,5.4],fov:40}} frameloop="demand" dpr={1} gl={{alpha:true,antialias:true}}><Lighting/><OpeningCapsule grade={opening.grade} phase={opening.phase} startedAt={opening.startedAt} reduced={reduced||opening.instant} revealed={shown}/></Canvas></div>
    {shown&&result?.product&&<div className="open-center-art" role="img" aria-label={result.product.name} data-fading={paidOut||undefined}><ProductDisplay key={result.operationId} product={result.product}/></div>}
    {paidOut&&<div className="open-coin-payout" role="status" aria-live="polite">
     <div className="open-coin-pile" aria-hidden="true">{Array.from({length:9},(_,i)=><span key={i} style={{'--i':i} as React.CSSProperties}><Coin/></span>)}</div>
     <strong>+{money(result!.awardedCoins)}</strong><small>엽전으로 자동 지급했어요</small>
     <CoinToWallet receipt={result!.operationId} amount={result!.awardedCoins} reduced={reduced||opening.instant} target=".wardrobe-coin"/>
    </div>}

    </div>
    {shown&&result?.product?<div className="open-result-card" data-operation-id={result.operationId} aria-live="polite">
     <h3>{result.product.name}</h3><div className="open-item-tags"><span>의상 세트</span><WearParts parts={parts}/></div>
    </div>:<p className="open-suspense" role="status">{opening.phase==='waiting'?'캡슐 안의 행운을 확인하고 있어요…':opening.phase==='seam'||opening.phase==='opening'?'빛 속의 의상을 만나 보세요':'잠시만요, 행운이 깨어나요'}</p>}
    {/* One button row from the start: the skip button while it plays, then 다시 열기·확인 in the same place and frame. */}
    {visible&&<div className="open-result-actions">{opening.phase==='complete'?<><button disabled={sameLeft<1||s.busy||!!s.pending} onClick={()=>void opening.open(opening.grade)} aria-label={`${capsuleName(opening.grade)} 다시 열기 (${sameLeft}개 남음)`}><span className="open-next-icon" aria-hidden="true"><Capsule grade={opening.grade}/></span>다시 열기<small className="open-again-count">{sameLeft}개</small></button><button onClick={next}><span aria-hidden="true">✓</span> 확인</button></>
     :<button className="open-skip-action" disabled={!opening.busy} onClick={opening.skip}><span className="open-next-icon open-skip-strut" aria-hidden="true"/>연출 건너뛰기</button>}</div>}
   </div>
  </dialog>
 </section>
}
