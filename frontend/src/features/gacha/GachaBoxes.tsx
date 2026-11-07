import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { create } from 'zustand'
import { Box3, Group, Vector3 } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { knownWholeSkin } from '../../world/art/wholeSkin'
import { catalogAsset, useSkinCatalog } from '../../world/art/skinCatalog'
import { setImage, outfitImage } from '../wardrobe/itemArt'
import { previewWardrobeItem, useWardrobe } from '../wardrobe/state'
import { useSession } from '../../network/worldClient'
import { gachaAction, refreshGacha, useGacha } from './state'
import { money, type GachaProduct, type GachaResult } from './contracts'
import { armUnlock } from '../../audio/bgm'
import { playSfx } from '../../audio/sfx'
import { CAPSULES, Capsule, Coin, RevealEffects } from './capsuleMotion'
import { capsuleName, capsuleTier, displayGachaMessage } from './labels'
import { useGachaOverlay } from './view'
import './capsuleOpening.css'

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
   phase('reveal');playSfx(actualGrade===1?'game-start':'ui-equip');await wait(receipt.duplicate?1500:500)
   if(receipt.duplicate){phase('duplicate');await wait(1200);phase('coins');await wait(1200)}
   phase('complete')
  }finally{if(flight.current===control){const live=current();flight.current=null;if(live)set(v=>({...v,busy:false}))}}
 }
 return {...s,open,skip:()=>{skip.current=true},dismiss:()=>set(empty)}
}

const colors:Record<number,string>={1:'#d83239',2:'#9858cf',3:'#378ed2',4:'#70a75a'}
function OpeningShell({grade,phase,startedAt,reduced}:{grade:number;phase:OpenPhase;startedAt:number;reduced:boolean}){
 const root=useRef<Group>(null),lid=useRef<Group>(null),color=colors[grade]
 useFrame(()=>{
  if(!root.current||!lid.current)return
  const t=Math.max(0,(performance.now()-startedAt)/1000)
  // Two separated, weighty gestures, never an accelerating vibration loop.
  const pulse=(start:number)=>{const p=(t-start)/.28;return p>0&&p<1?Math.sin(p*Math.PI*2)*Math.sin(p*Math.PI):0}
  root.current.rotation.z=!reduced&&phase==='sway'?.14*pulse(.04)-.18*pulse(.58):0
  const p=phase==='opening'?Math.min(1,t/.65):0,ease=1-(1-p)**3
  lid.current.position.set(0,ease*.85,-ease*.28);lid.current.rotation.x=-ease*1.08
 })
 return <group ref={root} rotation={[.06,0,0]}>
  <mesh><sphereGeometry args={[1,32,24,0,Math.PI*2,Math.PI/2,Math.PI/2]}/><meshPhysicalMaterial color={color} clearcoat={1} roughness={.25}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[1,.045,8,48]}/><meshStandardMaterial color={['seam','opening'].includes(phase)?'#fff3c0':'#efc56d'} emissive={['seam','opening'].includes(phase)?CAPSULES[grade]!.color:'#000'} emissiveIntensity={2} metalness={.5}/></mesh>
  <group ref={lid}>
   <mesh><sphereGeometry args={[1,32,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color={color} clearcoat={1} roughness={.22}/></mesh>
   <mesh position={[0,.98,0]}><sphereGeometry args={[.25,16,12]}/><meshStandardMaterial color="#f4d07a" metalness={.6} roughness={.25}/></mesh>
   {grade===1&&[-1,0,1].map(x=><mesh key={x} position={[x*.23,1.18,0]} rotation={[0,0,-x*.4]}><coneGeometry args={[.09,.4,8]}/><meshStandardMaterial color="#f4d07a" metalness={.6} roughness={.25}/></mesh>)}
  </group>
  {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*Math.PI*2/5)*.13,Math.cos(i*Math.PI*2/5)*.13-.04,1]} scale={[.09,.14,.045]} rotation={[0,0,-i*Math.PI*2/5]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#f4d07a" metalness={.5} roughness={.25}/></mesh>)}
  <mesh position={[0,-.04,1.04]}><sphereGeometry args={[.09,12,8]}/><meshStandardMaterial color="#fff0b0"/></mesh>
  <mesh position={[0,-.39,1]}><coneGeometry args={[.08,.3,10]}/><meshStandardMaterial color={color}/></mesh>
  {[-1,1].map(side=><group key={side} position={[side*.48,.43,.77]} rotation={[0,side*.45,side*.3]}>
   <mesh><torusGeometry args={[.17,.025,6,16,Math.PI*1.6]}/><meshStandardMaterial color={grade===3?'#e9f5ff':grade===4?'#d3e39a':'#efc56d'}/></mesh>
  </group>)}
  {['seam','opening'].includes(phase)&&<pointLight position={[0,.15,1.4]} color={CAPSULES[grade]!.color} intensity={4}/>}
 </group>
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
 const model=knownWholeSkin(product.imageKey),owned=useWardrobe(s=>s.items.find(i=>product.itemIds.includes(i.item.itemId)))
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
 if(!grade)return <p className="wardrobe-detail__empty">열어 볼 아이템을 골라 주세요. 두 번 누르면 바로 열어요.</p>
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
 useEffect(()=>{const d=dialog.current;if(!d||!visible||!connected)return;d.showModal();useGachaOverlay.setState({open:true});return()=>{d.close();useGachaOverlay.setState({open:false})}},[visible,connected])
 const parts=result?.product?.itemIds.map(id=>items.find(i=>i.item.itemId===id)?.item.equipSlot).filter((p,i,a)=>p&&a.indexOf(p)===i)
 const labels:Record<string,string>={HAIR:'머리',FACE:'얼굴',TOP:'상의',BOTTOM:'하의',SHOES:'신발'}
 const takeLook=()=>{const owned=items.find(i=>result?.product?.itemIds.includes(i.item.itemId));opening.dismiss();window.dispatchEvent(new Event('ontop-gacha-show-outfits'));if(owned)previewWardrobeItem(owned.userItemId)}
 const next=()=>opening.dismiss()
 const retry=async()=>{
  const pending=useGacha.getState().pending
  if(!pending)return
  if(pending.kind==='OPEN'){void opening.open(pending.grade!);return}
  await gachaAction(pending.kind)
  const receipt=useGacha.getState().result
  if(useSession.getState().sessionId===owner&&receipt?.operationId===pending.operationId)setRecovered(receipt)
 }
 return <section className="gacha-item-storage" aria-label="아이템 보관함">
  <ul className="wardrobe-grid gacha-item-grid">{s.state?.inventory.boxes.filter(b=>!query||capsuleName(b.grade).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(b=><li key={b.grade}>
   <button type="button" className="wardrobe-card" aria-label={`${capsuleName(b.grade)} ${b.quantity}개 보유`} aria-pressed={chosen===b.grade} disabled={s.busy||opening.busy} onClick={()=>useItemChoice.setState({grade:b.grade})} onDoubleClick={()=>{if(!s.pending&&b.quantity>0)void opening.open(b.grade)}}>
    <span className="wardrobe-art" data-slot="TOP"><Capsule grade={b.grade}/></span><span className="wardrobe-card__text"><b>{capsuleName(b.grade)}</b><small>보유 {b.quantity}개</small></span>
   </button>
  </li>)}</ul>
  {s.state&&query&&!s.state.inventory.boxes.some(b=>capsuleName(b.grade).toLocaleLowerCase().includes(query.toLocaleLowerCase()))&&<div className="wardrobe-empty" role="status"><b>찾는 아이템이 없어요</b><p>검색어를 바꿔 보세요.</p></div>}
  {s.error&&<p role="alert" className="gacha-item-error">{displayGachaMessage(s.error)}</p>}
  {s.pending&&!s.busy&&<button className="gacha-item-retry" onClick={()=>void retry()}>같은 요청으로 결과 다시 확인</button>}
  {recovered&&<div className="gacha-item-recovery" role="status" data-operation-id={recovered.operationId}><b>{recovered.kind==='BUY'?'뽑기권 1장 구매를 확인했어요':recovered.grade===5?`${money(recovered.awardedCoins)} 당첨을 확인했어요`:`${capsuleName(recovered.grade)} 당첨을 확인했어요`}</b><p>확정된 결과를 복구했어요. 추가로 소비하지 않았어요.</p><button onClick={()=>setRecovered(null)}>확인</button></div>}
  {!s.state&&<p role="status">캡슐을 불러오고 있어요…</p>}
  <dialog ref={dialog} className="capsule-opening-dialog" aria-label="의상 캡슐 개봉" onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();opening.busy?opening.skip():next()}}>
   <div className="capsule-opening-stage" data-phase={opening.phase} data-grade={opening.grade} data-reduced={reduced||opening.instant} style={{'--rarity-color':CAPSULES[opening.grade]!.color} as React.CSSProperties}>
    <div className="open-wallet">보유 엽전 <b>{money(s.state?.inventory.balance??0)}</b></div>
    <div className="open-title"><small>나의 옷장 · {capsuleName(opening.grade)}</small><h2>{shown?'나를 찾아온 작은 행운':'어떤 의상이 기다릴까요?'}</h2></div>
    {shown&&<RevealEffects grade={opening.grade}/>}
    <div key={shown?'product':'capsule'} className="open-center-art" role="img" aria-label={shown?result?.product?.name:`${capsuleName(opening.grade)} 개봉 중`}>
     {shown&&result?.product?<ProductDisplay key={result.operationId} product={result.product}/>:<Canvas resize={{offsetSize:true}} camera={{position:[0,.15,4.8],fov:40}} dpr={1} frameloop={reduced?'demand':'always'} gl={{alpha:true,antialias:true}}><Lighting/><OpeningShell grade={opening.grade} phase={opening.phase} startedAt={opening.startedAt} reduced={reduced||opening.instant}/></Canvas>}
    </div>
    {shown&&result?.product?<div className="open-result-card" data-operation-id={result.operationId} aria-live="polite">
     <small>{result.duplicate?'의상 공개':'새 의상 획득!'}</small><h3>{result.product.name}</h3><p className="open-parts">{capsuleTier(result.grade)} · {parts?.length?parts.map(p=>labels[p!]).join(' · '):`${result.product.itemIds.length}개 포함 아이템`}<span>상품 하나로 함께 착용해요</span></p>
     {result.duplicate&&['duplicate','coins','complete'].includes(opening.phase)?<div className="open-duplicate"><b>이미 보유 중</b><p>이미 보유한 의상이에요.<br/>상품 가치{opening.value?` ${money(opening.value)}`:''}의 50%인 <strong>{money(result.awardedCoins)}</strong>을 중복 보상으로 지급했어요.</p></div>:<p>{result.duplicate?'이 의상을 확인해 보세요.':'옷장에 보관했어요. 원하는 때 직접 입어 보세요.'}</p>}
     {result.duplicate&&['coins','complete'].includes(opening.phase)&&<CoinToWallet receipt={result.operationId} amount={result.awardedCoins} reduced={reduced||opening.instant}/>}
     {opening.phase==='complete'&&<div className="open-result-actions"><button onClick={takeLook}>옷장에서 입어 보기</button><button onClick={next}>확인</button></div>}
    </div>:<p className="open-suspense" role="status">{opening.phase==='waiting'?'캡슐 안의 행운을 확인하고 있어요…':opening.phase==='seam'||opening.phase==='opening'?'빛 속의 의상을 만나 보세요':'잠시만요, 행운이 깨어나요'}</p>}
    {opening.busy&&<button className="open-skip" onClick={opening.skip}>연출 건너뛰기</button>}
   </div>
  </dialog>
 </section>
}
