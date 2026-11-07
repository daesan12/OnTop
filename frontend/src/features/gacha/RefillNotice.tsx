export function RefillNotice({remaining,transition}:{remaining:number;transition:'ROUND_ENDED'|'REFILLING'|null}) {
  if(remaining<=0&&!transition)return null
  if(remaining<=0)return <p className="art-refill-ready" role="status">뽑기권은 사용하지 않았어요. 새 보상을 확인하고 뽑기 버튼을 다시 눌러 주세요.</p>
  const refilling=remaining>0
  return <section className="art-refill" role="status" aria-live="polite" aria-atomic="true" aria-label="뽑기 보충 안내">
    <span className="art-refill-seal" aria-hidden="true">✿</span>
    <h3>{refilling?'캡슐을 채우고 있어요':'새로운 뽑기가 준비됐어요'}</h3>
    <p>{transition==='ROUND_ENDED'?'이번 뽑기가 종료됐어요.':refilling?'새로운 행운을 준비하고 있어요.':'남은 보상을 확인해 주세요.'}
      {transition&&<><br/><strong>뽑기권은 사용하지 않았어요.</strong></>}</p>
    {refilling?<><div className="art-refill-track" role="progressbar" aria-label="캡슐 보충" aria-valuemin={0} aria-valuemax={3000} aria-valuenow={Math.round(Math.max(0,3000-remaining))}>
      <i style={{width:`${Math.min(100,Math.max(0,1-remaining/3000)*100)}%`}}/></div><small>{Math.ceil(remaining/1000)}초 후 다시 뽑을 수 있어요</small></>:
      <small>원할 때 뽑기 버튼을 다시 눌러 주세요.</small>}
  </section>
}
