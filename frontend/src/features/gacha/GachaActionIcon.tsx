/** Shared engraved line icons, matching the machine's brass trim. */
export function GachaActionIcon({kind}:{kind:'wardrobe'|'ticket'|'capsule'}){
 return <span className="art-action-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  {kind==='wardrobe'?<><path d="M7 13 24 5l17 8M9 13h30v29H9zM24 14v28M7 42h34"/><path d="M18 25v6m12-6v6M13 17h7m8 0h7"/></>
   :kind==='ticket'?<g transform="rotate(-12 24 24)"><path d="M5 12h38v8a4 4 0 0 0 0 8v8H5v-8a4 4 0 0 0 0-8z"/><path d="M12 17h24v14H12zM32 12v3m0 18v3"/><path d="m22 18 2 3 3-1-1 4 2 2-4 1-2 3-1-4-3-2 3-2z"/></g>
   :<><circle cx="24" cy="26" r="16"/><path d="M8 26h32M18 10l2-5 4 3 4-3 2 5M24 21l2 3 4 1-3 3-3 2-3-2-3-3 4-1z"/><path d="M24 31v6"/></>}
 </svg></span>
}
