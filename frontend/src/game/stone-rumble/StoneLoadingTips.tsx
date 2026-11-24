import { useEffect, useState } from 'react'
import { StoneTowerIcon } from './StoneTowerIcon'
import './stone-loading.css'

const tips = [
  {
    kind: 'tiles', title: '밟은 돌에서는 멈추지 마세요',
    copy: '발판을 밟으면 황토색으로 변해요. 약 1초 뒤 무너지니 다음 돌로 이동하세요.',
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
const imageSizes = [
  '(orientation: landscape) and (max-height: 540px) min(51vw, 66dvh)',
  '(max-width: 620px) and (max-height: 720px) min(calc(100vw - 60px), 43dvh)',
  '(max-width: 620px) calc(100vw - 60px)',
  '(max-height: 1000px) min(51vw, 71dvh)',
  '(max-width: 1400px) 47vw',
  '700px',
].join(', ')
const tipNames = ['발판', '비둘기', '슬라이딩'] as const
const sceneUrl = (kind: string, width: number) => `${artRoot}scene-${kind}-park-${width}.webp`
const sceneSources = (kind: string) => `${sceneUrl(kind, 540)} 540w, ${sceneUrl(kind, 1080)} 1080w`

export function StoneLoadingTips({ ready, total, ownReady, error, retry }: {
  ready: number; total: number; ownReady: boolean; error: string; retry: () => void
}) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setIndex(i => (i + 1) % tips.length), 9000)
    return () => clearTimeout(timer)
  }, [index])
  useEffect(() => {
    // 첫 팁을 표시한 뒤 나머지 삽화를 낮은 우선순위로 미리 불러온다.
    for (const tip of tips.slice(1)) {
      const image = new Image()
      image.fetchPriority = 'low'
      image.sizes = imageSizes
      image.srcset = sceneSources(tip.kind)
    }
  }, [])
  const tip = tips[index]!
  const prepared = Math.max(0, Math.min(total, ready))
  return <div className="stone-loading-tips" aria-label="돌탑 경기 준비" role="region" tabIndex={0}>
    <div className="stone-loading-content">
      <header className="stone-loading-heading"><StoneTowerIcon /><h1>돌탑 생존전</h1></header>
      <div className="stone-loading-sheet">
        <div className="stone-tip-layout">
          <div className="stone-tip-visual">
            <div className="stone-tip-picture">
              <img key={tip.kind} src={sceneUrl(tip.kind, 540)} srcSet={sceneSources(tip.kind)}
                sizes={imageSizes} width="1080" height="810" alt={tip.alt} decoding="async" fetchPriority="high" />
            </div>
            <nav className="stone-tip-nav" aria-label="게임 팁 선택">
              {tips.map(({ kind }, i) => <button type="button" key={kind} aria-label={`${i + 1}번째 팁`} aria-pressed={i === index} onClick={() => setIndex(i)}><span>0{i + 1}</span> {tipNames[i]}</button>)}
            </nav>
          </div>
          <article className="stone-tip-copy" aria-label={`${index + 1}번째 생존 팁`}>
            <h2>{tip.title}</h2><p>{tip.copy}</p><p className="stone-tip-detail">{tip.detail}</p>
            <div className="stone-tip-controls" aria-label="관련 조작">{tip.controls.map(control => <span key={control.key}><kbd>{control.key}</kbd>{control.label}</span>)}</div>
          </article>
        </div>
        <div className="stone-loading-progress" role="status">
          <div className="stone-loading-ready">
            <strong>{error ? '준비를 다시 확인해 주세요' : '경기장 준비'}</strong>
            <div className="stone-loading-stones" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i} data-ready={i < prepared} />)}</div>
            <span>{prepared}<small> / {total}</small></span>
          </div>
          <p>{error || (ownReady ? '내 준비는 끝났어요. 모두 준비되면 구름에서 함께 내려가요.' : '공원과 경기장을 준비하고 있어요. 잠시만 기다려 주세요.')}</p>
          {error && <button type="button" className="stone-loading-retry" onClick={retry}>다시 준비하기</button>}
        </div>
      </div>
    </div>
  </div>
}
