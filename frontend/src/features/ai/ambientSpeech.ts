export type AmbientSpeech={text:string;expiresAt:number}
export function validAmbient(value:unknown):boolean {
 if(value==null)return true
 if(typeof value!=='object')return false
 const p=value as AmbientSpeech
 return typeof p.text==='string'&&p.text.length>0&&p.text.length<=160&&typeof p.expiresAt==='number'&&Number.isFinite(p.expiresAt)&&p.expiresAt>0
}
