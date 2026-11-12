import { Component } from 'react'
import type { ReactNode } from 'react'

/** Lives outside the lazy module, so a failed 3D download cannot take down chat or the 2D toggle. */
export class SceneLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <p className="scene-fallback" role="status">3D 파일을 불러오지 못했습니다. 2D 지도 버튼으로 계속 검수해주세요.</p>
      : this.props.children
  }
}
