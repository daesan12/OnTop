// Isolated UI fixture. Never imported by a product entry point or connected to a real wallet.
import {createRoot} from 'react-dom/client'
import {GachaBoxes,GachaItemFooter} from '../../src/features/gacha/GachaBoxes'
import {useSession} from '../../src/network/worldClient'
import {useWardrobe} from '../../src/features/wardrobe/state'
import {parkRuntime} from '../../src/park/runtime/runtime'
import type {OwnedItem} from '../../src/features/shop/contracts'
import '../../src/features/gacha/gachaPanel.css'
import '../../src/features/wardrobe/wardrobe.css'
const slots=['HAIR','FACE','TOP','BOTTOM','SHOES'] as const
const items:OwnedItem[]=slots.map((equipSlot,index)=>({userItemId:index+1,quantity:1,equipped:false,item:{itemId:index+1,itemCode:'TEST_'+index,name:equipSlot==='HAIR'?'갓':equipSlot==='FACE'?'얼굴':'검수 의상',itemType:'EQUIPMENT',equipSlot,price:10,imageKey:'skin/ssafy-black-male/v3',setCode:'TEST_SET'}}))
useSession.setState({sessionId:'101',status:'connected',roomId:'fixture-channel'})
useWardrobe.setState({owner:'101',ready:true,items})
parkRuntime.requestJSON=async(path,init)=>{const r=await fetch(path,init);if(!r.ok)throw Error('검수 요청 실패');return r.json()}
document.body.style.cssText='margin:0;background:#d8d2b9;color:#24382c;font-family:serif'
createRoot(document.getElementById('root')!).render(<main><h1>캡슐 개봉 · 로컬 검수</h1><GachaBoxes/><GachaItemFooter/></main>)
