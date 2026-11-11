export function WearParts({parts}:{parts:string[]}){
 return <p className="open-parts">착용 부위: {parts.length?parts.join(' · '):'옷장에서 확인할 수 있어요'}</p>
}
