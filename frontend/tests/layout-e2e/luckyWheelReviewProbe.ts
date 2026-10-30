import {createElement} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {LuckyFacilityPanel} from '../../src/features/luckyFacilities/LuckyFacilityPanel'

let root:Root|undefined,host:HTMLDivElement|undefined
/** Test the retained model directly without reactivating its removed map facility. */
export function mountRetainedWheel(){
 host=document.createElement('div');document.body.append(host)
 root=createRoot(host);root.render(createElement(LuckyFacilityPanel,{id:'layout-shop'}))
}
export function unmountRetainedWheel(){root?.unmount();host?.remove();root=undefined;host=undefined}
