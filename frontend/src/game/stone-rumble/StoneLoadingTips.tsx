import { useEffect, useState } from 'react'
import { StoneTowerIcon } from './StoneTowerIcon'
import './stone-loading.css'

const tips = [
  {
    kind: 'tiles', title: '밟은 돌에서는 멈추지 마세요',
    copy: '발판을 밟으면 황토색으로 변해요. 약 1.2초 뒤 무너지니 다음 돌로 이동하세요.',
    detail: '발판이 꺼져도 아래층에 착지하면 계속 생존할 수 있어요.',
    alt: '황토색 발판이 무너지기 전에 다음 석재 발판으로 옮겨 가는 캐릭터와 아래에 이어진 두 개 층',
    controls: [{ key: 'WASD', label: '이동' }, { key: 'Space', label: '점프' }],
  },
  {
    kind: 'pigeon', title: '비둘기로 상대의 발을 흔드세요',
    copy: '마우스로 방향을 잡고 E 또는 오른쪽 비둘기 버튼을 누르세요. 맞은 상대는 블록 한 칸만큼 밀려나요.',
    detail: '공격은 1.5초마다 충전돼요. 상대가 딛고 있는 발판이 무너지기 직전에 노려 보세요.',
    alt: '공원 위 돌탑에서 비둘기를 날리는 캐릭터와 맞고 뒤쪽 발판으로 밀려나는 상대',
    controls: [{ key: '마우스', label: '조준' }, { key: 'E', label: '비둘기 공격' }],
  },
  {
    kind: 'dive', title: '점프한 뒤에도 한 칸 더!',
    copy: 'Space로 점프한 뒤 Shift를 누르면 몸을 앞으로 던지며 한 칸 슬라이딩해요. 지상과 공중 모두 사용할 수 있어요.',
    detail: '아래층에 착지하면 다시 버틸 수 있어요. 1층보다 더 아래로 떨어지면 탈락해요.',
    alt: '무너지는 돌과 다음 발판 사이에서 양팔을 앞으로 뻗고 한 칸 다이빙하는 캐릭터',
    controls: [{ key: 'Space', label: '점프' }, { key: 'Shift', label: '한 칸 슬라이딩' }],
  },
] as const

const artRoot = '/art/stone-rumble/loading/'
const imageSizes = '100vw'
const tipNames = ['발판', '비둘기', '슬라이딩'] as const
const sceneUrl = (kind: string, width: number) => `${artRoot}scene-${kind}-native-${width}.webp`

export function StoneLoadingTips({ ready, total, ownReady, error, retry }: {
  ready: number; total: number; ownReady: boolean; error: string; retry: () => void
}) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setIndex(i => (i + 1) % tips.length), 9000)
    return () => clearTimeout(timer)
  }, [index])
  useEffect(() => {
    // 그림은 실제 모델을 미리 렌더링한 WebP다. 로딩 UI에서 모델/3D 렌더러를 추가로 실행하지 않는다.
    const portrait = window.matchMedia('(max-width: 700px)').matches
    for (const tip of tips.slice(1)) {
      const image = new Image()
      image.fetchPriority = 'low'
      if (!portrait) {
        image.sizes = imageSizes
        image.srcset = `${sceneUrl(tip.kind, 1280)} 1280w, ${sceneUrl(tip.kind, 1920)} 1920w`
      }
      image.src = sceneUrl(tip.kind, portrait ? 640 : 1280)
    }
  }, [])
  const tip = tips[index]!
  const prepared = Math.max(0, Math.min(total, ready))
  return <div className="stone-loading-tips" aria-label="돌탑 경기 준비" role="region">
    <picture className="stone-tip-picture" key={tip.kind}>
      <source media="(max-width: 700px)" srcSet={sceneUrl(tip.kind, 640)} />
      <img src={sceneUrl(tip.kind, 1280)} srcSet={`${sceneUrl(tip.kind, 1280)} 1280w, ${sceneUrl(tip.kind, 1920)} 1920w`}
        sizes={imageSizes} width="1920" height="1080" alt={tip.alt} decoding="async" fetchPriority="high" />
    </picture>
    <div className="stone-loading-shade" aria-hidden="true" />
    <header className="stone-loading-heading"><StoneTowerIcon /><h1>돌탑 생존전</h1></header>
    <div className="stone-loading-footer">
      <article className="stone-tip-card" aria-label={`${index + 1}번째 생존 팁`}>
        <div className="stone-tip-copy"><small>생존 TIP <b>0{index + 1}</b><span> / 0{tips.length}</span></small>
          <h2>{tip.title}</h2><p>{tip.copy}</p><p className="stone-tip-detail">{tip.detail}</p>
          <div className="stone-tip-controls" aria-label="관련 조작">{tip.controls.map(control => <span key={control.key}><kbd>{control.key}</kbd>{control.label}</span>)}</div>
        </div>
      </article>
      <nav className="stone-tip-nav" aria-label="게임 팁 선택">
        {tips.map((tip, i) => <button type="button" key={tip.kind} aria-label={`${i + 1}번째 팁`} aria-pressed={i === index} onClick={() => setIndex(i)}><span>0{i + 1}</span>{tipNames[i]}</button>)}
      </nav>
      <div className="stone-loading-progress" role="status">
        <div className="stone-loading-ready"><strong>{error ? '준비를 다시 확인해 주세요' : '경기장 준비'}</strong><span>{prepared}<small> / {total}</small></span></div>
        <div className="stone-loading-stones" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i} data-ready={i < prepared} />)}</div>
        <p>{error || (ownReady ? '내 준비는 끝났어요. 모두 준비되면 구름에서 함께 내려가요.' : '공원과 경기장을 준비하고 있어요. 잠시만 기다려 주세요.')}</p>
        {error && <button className="stone-loading-retry" onClick={retry}>다시 준비하기</button>}
      </div>
    </div>
  </div>
}
