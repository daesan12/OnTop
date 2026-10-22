type TableOverlayProps = {
  sceneClicks: number
  uiClicks: number
  onDemoButtonClick: () => void
}

export function TableOverlay({
  sceneClicks,
  uiClicks,
  onDemoButtonClick,
}: TableOverlayProps) {
  return (
    <div className="ui-layer">
      <section className="demo-panel" aria-labelledby="demo-title">
        <p className="eyebrow">TABLE VIEW · LAYER DEMO</p>
        <h1 id="demo-title">테이블 화면 기초 구조</h1>
        <p>3D 장면과 React UI를 한 화면에 겹쳐 배치했습니다.</p>
        <button type="button" onClick={onDemoButtonClick}>
          UI 버튼 클릭 확인
        </button>
        <p className="click-count" aria-live="polite">
          UI 클릭 {uiClicks}회 · 3D 오브젝트 클릭 {sceneClicks}회
        </p>
      </section>
      <p className="scene-hint">가운데 상자를 클릭하면 3D 클릭 횟수가 올라갑니다.</p>
    </div>
  )
}
