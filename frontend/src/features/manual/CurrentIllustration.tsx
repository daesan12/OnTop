import { GameArt } from './GameArt';

/** Same cream/green/gold visual language; obsolete raster rules are not shipped. */
export function CurrentIllustration({kind}:{kind:'renju'|'farkle'}) {
  const renju=kind==='renju';
  const items=renju ? [
    ['준비','2명 · 15×15 교차점 · 흑 먼저'],
    ['내 차례','빈 교차점에 한 돌씩 · 한 차례 30초'],
    ['승리','흑 정확히 5목 · 백 5목 이상'],
    ['흑의 금수','삼삼 · 사사 · 6개 이상 장목. 정확한 5목 승리가 우선해요.'],
  ] : [
    ['준비와 목표','2명 · 주사위 6개. 서버가 확정한 2,000 / 4,000 / 6,000점을 확인해요.'],
    ['굴리고 고르기','R 또는 컵으로 굴려 득점 조합을 선택해요. 이전에 보관한 주사위와 새 조합을 합치지 않아요.'],
    ['멈추거나 한 번 더','Q로 점수 확정 · R로 남은 주사위 재굴림 · T로 점수표'],
    ['BUST · HOT DICE','득점 조합이 없으면 이번 턴 점수만 잃어요. 여섯 개 모두 득점하면 다시 6개를 굴릴 수 있어요.'],
  ];
  return <article className="current-rule-art" aria-label={renju?'렌주 그림 규칙':'주사위 진행 그림 규칙'}>
    <header><div><h4>{renju?'오목':'주사위 한 판'}</h4><p>{renju?'다섯 돌을 잇는 첫 대국':'한 번 더 굴릴까, 지금 멈출까?'}</p><b>{renju?'렌주 · 현재 적용 규칙':'한 차례 전체 30초 · 재굴림으로 연장되지 않아요'}</b></div><GameArt game={renju?'gomoku':'farkle'}/></header>
    <div className="current-rule-grid">{items.map(([title,body],i)=><section key={title}><h5><span>{String(i+1).padStart(2,'0')}</span>{title}</h5><p>{body}</p></section>)}</div>
    <footer>{renju?'● ● ● ● ● → 흑 5목 승리 · 금수 거절 시 차례와 마감은 그대로예요.':'시간이 끝나면 이번 턴 점수만 잃고 상대 차례예요. 이미 확정한 총점은 유지돼요.'}</footer>
  </article>;
}
